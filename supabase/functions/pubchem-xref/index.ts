// pubchem-xref — rungs 3 and 4 of the structure (SMILES) ladder (phase 36a, 2026-11-03).
//   mode "drugbank": PubChem substance cross-reference by DrugBank ID -> exactly one CID -> properties.
//                    Writes public.physiochemical (insert-only, status 'ok'). Misses write nothing (the moiety stays
//                    available to rung 4) and are listed in the response.
//   mode "name":     PubChem lookup by moiety name. Writes ONLY public.structure_name_candidates, for Joshua's review;
//                    load_approved_name_structures() copies the rows he approves. Never touches physiochemical.
// Same guard and PubChem pacing as pubchem-structures: x-ingest-token = ingest_tokens(name='rxclass'), verify_jwt off,
// 2 workers, a pause after every request, never chain a batch that wrote nothing. PubChem blocked this function's address
// once at 4 workers (see docs/structure-fetch.md): probe first, start only on a 200.
// Body: { mode: "drugbank" | "name", limit?: number, pcids?: number[], chain?: boolean, after?: number, probe?: boolean }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const REST = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const PROPS = "Title,SMILES,InChI,InChIKey,MolecularFormula,MolecularWeight";
const WORKERS = 2;
const PAUSE_MS = 400;
const BUDGET_MS = 95_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } }); }
    catch { await sleep(800 * (attempt + 1)); continue; }
    if (r.status === 404 || r.status === 400) { await r.body?.cancel(); await sleep(PAUSE_MS); return null; }
    if (r.status === 429 || r.status === 503 || r.status >= 500) { await r.body?.cancel(); await sleep(4000 * (attempt + 1)); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`${r.status} ${url}`); }
    const t = await r.text();
    await sleep(PAUSE_MS);
    try { return JSON.parse(t); } catch { return null; }
  }
  throw new Error(`retries exhausted ${url}`);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/,\s+/g, ",").trim();
const cleanName = (s: string) => s.replace(/\s+/g, " ").replace(/,\s+/g, ",").trim();

type Props = { CID: number; Title?: string; SMILES?: string; InChI?: string; InChIKey?: string; MolecularFormula?: string; MolecularWeight?: string | number };
async function propsFor(cid: number): Promise<Props | null> {
  const j = await getJson(`${REST}/compound/cid/${cid}/property/${PROPS}/JSON`);
  return j?.PropertyTable?.Properties?.[0] ?? null;
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxclass").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { mode?: string; limit?: number; pcids?: number[]; chain?: boolean; after?: number; probe?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const mode = body.mode === "name" ? "name" : "drugbank";

  if (body.probe) {
    const out: unknown[] = [];
    for (const [label, url] of [
      ["drugbank DB01221 (ketamine)", `${REST}/substance/sourceid/DrugBank/DB01221/cids/JSON`],
      ["name ibogaine", `${REST}/compound/name/ibogaine/cids/JSON`],
    ] as const) {
      const t1 = Date.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
        out.push({ label, status: r.status, ms: Date.now() - t1, throttle: r.headers.get("x-throttling-control"), body: (await r.text()).slice(0, 300) });
      } catch (e) { out.push({ label, error: String(e).slice(0, 200), ms: Date.now() - t1 }); }
      await sleep(1000);
    }
    return Response.json({ probe: out });
  }

  const limit = Math.max(1, Math.min(mode === "drugbank" ? 2000 : 150, Number(body.limit ?? (mode === "drugbank" ? 2000 : 100))));
  const t0 = Date.now();
  const errors: string[] = [];
  const stats: Record<string, number> = {};
  const bump = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };
  let total = 0;
  let lastPcid = body.after ?? 0;
  let progressed = 0;
  const misses: number[] = [];

  if (mode === "drugbank") {
    const { data: todo, error } = await db.rpc("structure_todo_drugbank", { p_limit: 5000, p_pcids: body.pcids ?? null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const queue: { pcid: number; drugbank_id: string }[] = (todo ?? []).filter((q: { pcid: number }) => q.pcid > (body.after ?? 0)).slice(0, limit);
    total = queue.length;
    async function work() {
      for (;;) {
        if (Date.now() - t0 > BUDGET_MS) return;
        const m = queue.shift();
        if (!m) return;
        lastPcid = Math.max(lastPcid, m.pcid);
        try {
          const j = await getJson(`${REST}/substance/sourceid/DrugBank/${m.drugbank_id}/cids/JSON`);
          const cids = [...new Set<number>((j?.InformationList?.Information ?? []).flatMap((i: { CID?: number[] }) => i.CID ?? []).filter((c: number) => c > 0))];
          if (cids.length !== 1) { misses.push(m.pcid); bump(cids.length === 0 ? "no_cid" : "several_cids"); continue; }
          const p = await propsFor(cids[0]);
          const smiles = p?.SMILES ?? null;
          if (!p || !smiles) { misses.push(m.pcid); bump("no_properties"); continue; }
          const { error: e } = await db.from("physiochemical").upsert({
            pcid: m.pcid, smiles, inchi: p.InChI ?? null, inchi_key: p.InChIKey ?? null,
            molecular_formula: p.MolecularFormula ?? null,
            molecular_weight: p.MolecularWeight != null ? Number(p.MolecularWeight) : null,
            source: "PubChem", pubchem_cid: p.CID, match_method: "pubchem_drugbank", structure_status: "ok",
            raw: { properties: p, drugbank_id: m.drugbank_id }, fetched_at: new Date().toISOString(),
          }, { onConflict: "pcid", ignoreDuplicates: true });
          if (e) throw new Error(e.message);
          bump("ok"); progressed++;
        } catch (e) { bump("failed"); if (errors.length < 5) errors.push(`${m.pcid}: ${String(e).slice(0, 160)}`); }
      }
    }
    await Promise.all(Array.from({ length: WORKERS }, work));
    const more = !!body.chain && !body.pcids && (progressed > 0 || stats.no_cid > 0 || stats.several_cids > 0 || stats.no_properties > 0) && !(stats.failed > 0 && progressed === 0) && queue.length + (total === limit ? 1 : 0) > 0;
    if (more) {
      // @ts-ignore EdgeRuntime is provided by the Supabase runtime
      EdgeRuntime.waitUntil(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pubchem-xref`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-ingest-token": token },
        body: JSON.stringify({ mode, limit, chain: true, after: lastPcid }),
      }).catch(() => {}));
    }
    return Response.json({ mode, batch: total, leftover: queue.length, stats, misses, last_pcid: lastPcid, errors, chained: more });
  }

  // mode "name"
  const { data: todo, error } = await db.rpc("structure_todo_name", { p_limit: limit, p_pcids: body.pcids ?? null });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; name: string }[] = todo ?? [];
  total = queue.length;
  async function workName() {
    for (;;) {
      if (Date.now() - t0 > BUDGET_MS) return;
      const m = queue.shift();
      if (!m) return;
      try {
        const q = cleanName(m.name);
        const j = await getJson(`${REST}/compound/name/${encodeURIComponent(q)}/cids/JSON`);
        const cids: number[] = j?.IdentifierList?.CID?.filter((c: number) => c > 0) ?? [];
        let row: Record<string, unknown> = { pcid: m.pcid, queried_name: m.name, n_cids: cids.length, cid_list: cids.slice(0, 20), match_basis: "none", confidence: "none" };
        if (cids.length > 0) {
          let chosen: Props | null = null;
          let basis: "title_exact" | "synonym_exact" | "name_only" = "name_only";
          for (const cid of cids.slice(0, 3)) {
            const p = await propsFor(cid);
            if (!p) continue;
            if (!chosen) chosen = p; // fall back to the first result
            if (p.Title && norm(p.Title) === norm(q)) { chosen = p; basis = "title_exact"; break; }
            const syn = await getJson(`${REST}/compound/cid/${cid}/synonyms/JSON`);
            const names: string[] = syn?.InformationList?.Information?.[0]?.Synonym ?? [];
            if (names.some((s) => norm(s) === norm(q))) { chosen = p; basis = "synonym_exact"; break; }
          }
          if (chosen) {
            const confidence = basis === "name_only" ? "low" : cids.length === 1 ? "high" : "medium";
            let owner: number | null = null;
            if (chosen.InChIKey) {
              const { data: o } = await db.from("physiochemical").select("pcid").eq("inchi_key", chosen.InChIKey).neq("pcid", m.pcid).limit(1);
              const { data: o2 } = o?.length ? { data: o } : await db.from("moieties").select("pcid").eq("inchi_key", chosen.InChIKey).neq("pcid", m.pcid).limit(1);
              owner = o2?.[0]?.pcid ?? null;
            }
            row = { ...row, cid: chosen.CID, title: chosen.Title ?? null, match_basis: basis, confidence,
              smiles: chosen.SMILES ?? null, inchi: chosen.InChI ?? null, inchi_key: chosen.InChIKey ?? null,
              molecular_formula: chosen.MolecularFormula ?? null,
              molecular_weight: chosen.MolecularWeight != null ? Number(chosen.MolecularWeight) : null,
              inchi_key_owner_pcid: owner,
              note: owner ? `InChIKey already on PCID-${owner}: possible duplicate record` : null };
          }
        }
        const { error: e } = await db.from("structure_name_candidates").upsert(row, { onConflict: "pcid", ignoreDuplicates: true });
        if (e) throw new Error(e.message);
        bump(String(row.confidence)); progressed++;
      } catch (e) { bump("failed"); if (errors.length < 5) errors.push(`${m.pcid}: ${String(e).slice(0, 160)}`); }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, workName));
  const more = !!body.chain && !body.pcids && progressed > 0 && (total === limit || queue.length > 0);
  if (more) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pubchem-xref`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-ingest-token": token },
      body: JSON.stringify({ mode, limit, chain: true }),
    }).catch(() => {}));
  }
  return Response.json({ mode, batch: total, leftover: queue.length, stats, errors, chained: more });
});
