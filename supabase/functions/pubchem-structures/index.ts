// pubchem-structures — fills public.physiochemical (SMILES, InChI, formula, MW) for core moieties
// that have an InChIKey, via PubChem PUG REST (public domain). Rung 1 of the structure ladder.
// Never overwrites: rows are inserted only when no physiochemical row exists for the pcid.
// Guarded by x-ingest-token = ingest_tokens(name='rxclass'); verify_jwt is off because of that guard.
// Body: { limit?: number, pcids?: number[], chain?: boolean, probe?: string[] }
// probe: diagnostic mode, fetches each InChIKey once and reports HTTP status + PubChem throttling header; writes nothing.
// Note: physiochemical.source defaults to 'CAS Common Chemistry' and raw is NOT NULL, so both are always set here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey";
const PROPS = "SMILES,InChI,InChIKey,MolecularFormula,MolecularWeight";
const WORKERS = 2; // ~3 req/s: PubChem throttles near 5 req/s (and on running-time), 4 workers got throttled
const PAUSE_MS = 300;
const BUDGET_MS = 95_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } }); }
    catch { await sleep(800 * (attempt + 1)); continue; }
    if (r.status === 404) { await r.body?.cancel(); await sleep(PAUSE_MS); return null; }
    if (r.status === 429 || r.status === 503 || r.status >= 500) { await r.body?.cancel(); await sleep(4000 * (attempt + 1)); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`${r.status} ${url}`); }
    const t = await r.text();
    await sleep(PAUSE_MS);
    try { return JSON.parse(t); } catch { return null; }
  }
  throw new Error(`retries exhausted ${url}`);
}

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
    for (const k of body.probe.slice(0, 5)) {
      const t1 = Date.now();
      try {
        const r = await fetch(`${PUG}/${encodeURIComponent(k)}/property/${PROPS}/JSON`, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
        const txt = (await r.text()).slice(0, 200);
        out.push({ key: k, status: r.status, ms: Date.now() - t1, throttle: r.headers.get("x-throttling-control"), body: txt });
      } catch (e) {
        out.push({ key: k, error: String(e).slice(0, 200), ms: Date.now() - t1 });
      }
      await sleep(1000);
    }
    return Response.json({ probe: out });
  }

  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 100)));
  const t0 = Date.now();
  const { data: todo, error } = await db.rpc("structure_todo", { p_limit: limit, p_pcids: body.pcids ?? null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; inchi_key: string }[] = todo ?? [];
  let ok = 0, notFound = 0, mismatch = 0, failed = 0;
  const errors: string[] = [];

  async function work() {
    for (;;) {
      if (Date.now() - t0 > BUDGET_MS) return;
      const m = queue.shift();
      if (!m) return;
      try {
        const j = await getJson(`${PUG}/${encodeURIComponent(m.inchi_key)}/property/${PROPS}/JSON`);
        const p = j?.PropertyTable?.Properties?.[0];
        if (!p) {
          const { error: e0 } = await db.from("physiochemical").upsert(
            { pcid: m.pcid, source: "PubChem", structure_status: "not_found", match_method: "pubchem_inchikey",
              raw: { queried_inchikey: m.inchi_key, result: "404" }, fetched_at: new Date().toISOString() },
            { onConflict: "pcid", ignoreDuplicates: true });
          if (e0) throw new Error(e0.message);
          notFound++; continue;
        }
        const smiles = p.SMILES ?? p.IsomericSMILES ?? p.CanonicalSMILES ?? null;
        const keyOk = (p.InChIKey ?? "").toUpperCase() === m.inchi_key.toUpperCase();
        const row = {
          pcid: m.pcid,
          smiles: keyOk ? smiles : null,
          inchi: keyOk ? (p.InChI ?? null) : null,
          inchi_key: p.InChIKey ?? null,
          molecular_formula: keyOk ? (p.MolecularFormula ?? null) : null,
          molecular_weight: keyOk && p.MolecularWeight != null ? Number(p.MolecularWeight) : null,
          source: "PubChem",
          pubchem_cid: p.CID ?? null,
          match_method: "pubchem_inchikey",
          structure_status: keyOk && smiles ? "ok" : "key_mismatch",
          raw: { properties: p, n_cids: j.PropertyTable.Properties.length },
          fetched_at: new Date().toISOString(),
        };
        const { error: e } = await db.from("physiochemical").upsert(row, { onConflict: "pcid", ignoreDuplicates: true });
        if (e) throw new Error(e.message);
        if (row.structure_status === "ok") ok++; else mismatch++;
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(`${m.pcid}: ${String(e).slice(0, 160)}`);
      }
    }
  }

  const total = queue.length;
  await Promise.all(Array.from({ length: WORKERS }, work));

  const leftover = queue.length;
  const progressed = ok + notFound + mismatch > 0;
  // never chain on a batch that wrote nothing (persistent failures would loop forever)
  const more = !!body.chain && !body.pcids && progressed && (total === limit || leftover > 0);
  if (more) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pubchem-structures`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ingest-token": token },
        body: JSON.stringify({ limit, chain: true }),
      }).catch(() => {}),
    );
  }
  return Response.json({ batch: total, leftover, ok, not_found: notFound, key_mismatch: mismatch, failed, errors, chained: more });
});
