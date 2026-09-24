// classyfire-ingest — fills public.chemont_links for moieties that have none.
// InChIKey from moieties (or, failing that, PubChem name -> InChIKey), then the ClassyFire
// entity record -> kingdom / superclass / class / subclass / intermediate nodes / direct parent
// / alternative parents, stored as chemont_links rows (ord preserves that order).
// Guarded by x-ingest-token = ingest_tokens(name='rxclass'). {chain:true} re-invokes until done.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CF = "http://classyfire.wishartlab.com/entities";
const PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name";
const WORKERS = 5;
const BUDGET_MS = 95_000; // stop taking new work after this, then chain
const started = () => Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, pause = 250): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } }); }
    catch { await sleep(800 * (attempt + 1)); continue; }
    if (r.status === 404) { await r.body?.cancel(); await sleep(pause); return null; }
    if (r.status === 429 || r.status >= 500) { await r.body?.cancel(); await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`${r.status} ${url}`); }
    const t = await r.text();
    await sleep(pause);
    try { return JSON.parse(t); } catch { return null; }
  }
  throw new Error(`retries exhausted ${url}`);
}

function lineage(j: any): string[] {
  const ids: string[] = [];
  const push = (n: any) => { const id = n?.chemont_id; if (id && !ids.includes(id)) ids.push(id); };
  push(j?.kingdom); push(j?.superclass); push(j?.class); push(j?.subclass);
  for (const n of j?.intermediate_nodes ?? []) push(n);
  push(j?.direct_parent);
  for (const n of j?.alternative_parents ?? []) push(n);
  return ids;
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxclass").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { limit?: number; chain?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const limit = Math.max(1, Math.min(150, Number(body.limit ?? 60)));
  const t0 = started();
  const { data: todo, error } = await db.rpc("classyfire_todo", { p_limit: limit });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; inchi_key: string | null; name: string }[] = todo ?? [];
  let classified = 0, noKey = 0, notInCf = 0, failed = 0;

  async function work() {
    for (;;) {
      if (Date.now() - t0 > BUDGET_MS) return;
      const m = queue.shift();
      if (!m) return;
      try {
        let key = m.inchi_key, basis = key ? "moieties" : null;
        if (!key && m.name) {
          const clean = m.name.replace(/\s*\((exception|.*?)\)\s*$/i, "").trim();
          const pc = await getJson(`${PUBCHEM}/${encodeURIComponent(clean)}/property/InChIKey/JSON`, 220);
          key = pc?.PropertyTable?.Properties?.[0]?.InChIKey ?? null;
          if (key) basis = "pubchem_name";
        }
        if (!key) {
          await db.from("classyfire_lookup").upsert({ pcid: m.pcid, status: "no_inchikey", n_terms: 0 });
          noKey++; continue;
        }
        const cf = await getJson(`${CF}/${key}.json`);
        const ids = cf ? lineage(cf) : [];
        if (!ids.length) {
          await db.from("classyfire_lookup").upsert({ pcid: m.pcid, inchi_key: key, key_basis: basis, status: "not_in_classyfire", n_terms: 0 });
          notInCf++; continue;
        }
        const { error: e } = await db.from("chemont_links").upsert(
          ids.map((id, i) => ({ pcid: m.pcid, chemont_id: id, ord: i + 1 })), { onConflict: "pcid,chemont_id" });
        if (e) throw new Error(e.message);
        await db.from("classyfire_lookup").upsert({ pcid: m.pcid, inchi_key: key, key_basis: basis, status: "ok", n_terms: ids.length });
        classified++;
      } catch (e) {
        failed++;
        await db.from("classyfire_lookup").upsert({ pcid: m.pcid, status: "error", detail: String(e).slice(0, 300) });
      }
    }
  }

  const total = queue.length;
  await Promise.all(Array.from({ length: WORKERS }, work));

  const leftover = queue.length;
  if (body.chain && (total === limit || leftover > 0)) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/classyfire-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "", "x-ingest-token": token },
        body: JSON.stringify({ limit, chain: true }),
      }).catch(() => {}),
    );
  }
  return Response.json({ batch: total, leftover, classified, no_inchikey: noKey, not_in_classyfire: notInCf, failed, chained: !!body.chain && (total === limit || leftover > 0) });
});
