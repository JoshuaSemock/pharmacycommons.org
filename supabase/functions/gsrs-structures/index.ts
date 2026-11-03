// gsrs-structures — rung 2 of the structure ladder: FDA GSRS by UNII, for core moieties with a UNII but no InChIKey.
// GSRS (NCATS/FDA, US government data) -> structure.smiles / formula / InChIKey, plus substanceClass, which
// lets biologics (protein / nucleicAcid / structurallyDiverse) be flagged not_applicable_biologic from FDA's own class.
// Writes ONLY public.physiochemical (insert-if-absent). Never touches moieties; InChIKey backfill is a separate reviewed step.
// Guarded by x-ingest-token = ingest_tokens(name='rxclass'); verify_jwt is off because of that guard.
// Body: { limit?: number, pcids?: number[], chain?: boolean, probe?: string[] }   (probe = UNIIs; diagnostic, writes nothing)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GSRS = "https://gsrs.ncats.nih.gov/api/v1/substances";
const WORKERS = 2;
const PAUSE_MS = 300;
const BUDGET_MS = 95_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fetched = { status: number; json: any | null };

async function getSubstance(unii: string): Promise<Fetched> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch(`${GSRS}/${encodeURIComponent(unii)}?view=full`, { signal: AbortSignal.timeout(25000), headers: { Accept: "application/json" } }); }
    catch { await sleep(1000 * (attempt + 1)); continue; }
    if (r.status === 404) { await r.body?.cancel(); await sleep(PAUSE_MS); return { status: 404, json: null }; }
    if (r.status === 429 || r.status >= 500) { await r.body?.cancel(); await sleep(4000 * (attempt + 1)); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`${r.status} ${unii}`); }
    const t = await r.text();
    await sleep(PAUSE_MS);
    try { return { status: 200, json: JSON.parse(t) }; } catch { throw new Error(`bad json ${unii}`); }
  }
  throw new Error(`retries exhausted ${unii}`);
}

function summarize(j: any) {
  const s = j?.structure ?? null;
  return {
    uuid: j?.uuid ?? null,
    approvalID: j?.approvalID ?? j?.unii ?? null,
    name: j?._name ?? null,
    substanceClass: j?.substanceClass ?? null,
    structure: s ? {
      smiles: s.smiles ?? null,
      formula: s.formula ?? null,
      mwt: s.mwt ?? null,
      inchiKey: s.inchiKey ?? s._inchiKey ?? null,
      stereochemistry: s.stereochemistry ?? null,
      charge: s.charge ?? null,
    } : null,
  };
}

const BIOLOGIC_CLASSES = new Set(["protein", "nucleicAcid", "structurallyDiverse"]);

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxclass").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { limit?: number; pcids?: number[]; chain?: boolean; probe?: string[] } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  if (Array.isArray(body.probe)) {
    const out: unknown[] = [];
    for (const u of body.probe.slice(0, 6)) {
      const t1 = Date.now();
      try {
        const r = await getSubstance(u);
        out.push({ unii: u, status: r.status, ms: Date.now() - t1,
          structureKeys: r.json?.structure ? Object.keys(r.json.structure) : null,
          summary: r.json ? summarize(r.json) : null });
      } catch (e) { out.push({ unii: u, error: String(e).slice(0, 200), ms: Date.now() - t1 }); }
    }
    return Response.json({ probe: out });
  }

  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 100)));
  const t0 = Date.now();
  const { data: todo, error } = await db.rpc("structure_todo_unii", { p_limit: limit, p_pcids: body.pcids ?? null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; unii: string }[] = todo ?? [];
  const c = { ok: 0, biologic: 0, other: 0, not_found: 0, mismatch: 0, failed: 0 };
  const errors: string[] = [];

  async function put(row: Record<string, unknown>) {
    const { error: e } = await db.from("physiochemical").upsert(
      { source: "FDA GSRS", match_method: "gsrs_unii", fetched_at: new Date().toISOString(), ...row },
      { onConflict: "pcid", ignoreDuplicates: true });
    if (e) throw new Error(e.message);
  }

  async function work() {
    for (;;) {
      if (Date.now() - t0 > BUDGET_MS) return;
      const m = queue.shift();
      if (!m) return;
      try {
        const r = await getSubstance(m.unii);
        if (r.status === 404 || !r.json) {
          await put({ pcid: m.pcid, structure_status: "not_found", raw: { queried_unii: m.unii, result: "404" } });
          c.not_found++; continue;
        }
        const sum = summarize(r.json);
        if (sum.approvalID && String(sum.approvalID).toUpperCase() !== m.unii) {
          await put({ pcid: m.pcid, structure_status: "needs_review", raw: { queried_unii: m.unii, ...sum, note: "approvalID differs from queried UNII" } });
          c.mismatch++; continue;
        }
        const smiles = sum.structure?.smiles ?? null;
        if (sum.substanceClass === "chemical" && smiles) {
          const mw = sum.structure?.mwt != null ? Number(sum.structure.mwt) : null;
          await put({ pcid: m.pcid, structure_status: "ok", smiles, inchi_key: sum.structure?.inchiKey ?? null,
            molecular_formula: sum.structure?.formula ?? null, molecular_weight: Number.isFinite(mw as number) ? mw : null,
            raw: { queried_unii: m.unii, ...sum } });
          c.ok++;
        } else if (BIOLOGIC_CLASSES.has(sum.substanceClass ?? "")) {
          await put({ pcid: m.pcid, structure_status: "not_applicable_biologic", raw: { queried_unii: m.unii, ...sum } });
          c.biologic++;
        } else if (sum.substanceClass === "chemical") {
          await put({ pcid: m.pcid, structure_status: "not_found", raw: { queried_unii: m.unii, ...sum, note: "chemical record without SMILES" } });
          c.not_found++;
        } else {
          // polymer, mixture, concept, specified substances, ...: keep the class, do not guess
          await put({ pcid: m.pcid, smiles: smiles, structure_status: smiles ? "needs_review" : "not_applicable_other", raw: { queried_unii: m.unii, ...sum } });
          c.other++;
        }
      } catch (e) {
        c.failed++;
        if (errors.length < 5) errors.push(`${m.pcid}: ${String(e).slice(0, 160)}`);
      }
    }
  }

  const total = queue.length;
  await Promise.all(Array.from({ length: WORKERS }, work));

  const leftover = queue.length;
  const progressed = c.ok + c.biologic + c.other + c.not_found + c.mismatch > 0;
  // never chain on a batch that wrote nothing (a block or outage would loop forever)
  const more = !!body.chain && !body.pcids && progressed && (total === limit || leftover > 0);
  if (more) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gsrs-structures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-token": token },
        body: JSON.stringify({ limit, chain: true }),
      }).catch(() => {}),
    );
  }
  return Response.json({ batch: total, leftover, ...c, errors, chained: more });
});
