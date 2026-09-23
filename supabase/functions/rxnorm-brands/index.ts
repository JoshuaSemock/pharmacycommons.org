// rxnorm-brands — looks up RxNorm brand names (TTY=BN) for moieties by UNII.
//
// Each run takes the next `limit` moieties (core rows first, then salt forms) that have a UNII and no row in
// public.rxnorm_lookup yet, resolves UNII -> RxNorm ingredient -> brand names ->
// each brand's ingredients, and stores the results in public.rxnorm_brands.
// With {chain: true} it re-invokes itself until every moiety has been tried.
//
// Guarded by header x-ingest-token = public.ingest_tokens(name='rxnorm').
// RxNav allows ~20 requests/second per IP; this stays well under that.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const WORKERS = 6;
const PAUSE_MS = 90;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rx(path: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${RXNAV}${path}`, { signal: AbortSignal.timeout(15000) });
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`RxNav ${r.status} ${path}`);
    await sleep(PAUSE_MS);
    return await r.json();
  }
  throw new Error(`RxNav retries exhausted ${path}`);
}

const concepts = (j: any, tty: string): { rxcui: string; name: string }[] =>
  (j?.relatedGroup?.conceptGroup ?? [])
    .filter((g: any) => g.tty === tty)
    .flatMap((g: any) => g.conceptProperties ?? [])
    .map((c: any) => ({ rxcui: c.rxcui, name: c.name }));

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxnorm").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { limit?: number; chain?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const limit = Math.max(1, Math.min(250, Number(body.limit ?? 150)));

  const { data: todo, error } = await db.rpc("rxnorm_todo", { p_limit: limit });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; unii: string; base_name: string | null }[] = todo ?? [];

  const bnIngredients = new Map<string, string[]>();
  let done = 0, withBrands = 0, failed = 0;

  async function work() {
    for (;;) {
      const m = queue.shift();
      if (!m) return;
      try {
        let rxcui: string | null =
          (await rx(`/rxcui.json?idtype=UNII_CODE&id=${encodeURIComponent(m.unii)}`))?.idGroup?.rxnormId?.[0] ?? null;
        if (!rxcui && m.base_name) {
          rxcui = (await rx(`/rxcui.json?name=${encodeURIComponent(m.base_name.toLowerCase())}`))?.idGroup?.rxnormId?.[0] ?? null;
        }
        if (!rxcui) {
          await db.from("rxnorm_lookup").upsert({ pcid: m.pcid, unii: m.unii, rxcui: null, status: "not_found" });
          done++;
          continue;
        }
        let brands = concepts(await rx(`/rxcui/${rxcui}/related.json?tty=BN`), "BN");
        let pass = 1;
        if (brands.length === 0) {
          // A salt UNII resolves to a precise ingredient (PIN); brand names hang off its base ingredient (IN).
          const base = concepts(await rx(`/rxcui/${rxcui}/related.json?tty=IN`), "IN")[0];
          if (base && base.rxcui !== rxcui) {
            rxcui = base.rxcui;
            pass = 2; // fell back to the base ingredient; entity_brand_names drops these if another entity owns that IN
            brands = concepts(await rx(`/rxcui/${rxcui}/related.json?tty=BN`), "BN");
          }
        }
        const rows = [];
        for (const b of brands) {
          let ins = bnIngredients.get(b.rxcui);
          if (!ins) {
            ins = concepts(await rx(`/rxcui/${b.rxcui}/related.json?tty=IN`), "IN").map((c) => c.rxcui).sort();
            bnIngredients.set(b.rxcui, ins);
          }
          rows.push({ pcid: m.pcid, brand: b.name, brand_rxcui: b.rxcui, ingredient_rxcuis: ins });
        }
        if (rows.length) {
          const { error: e } = await db.from("rxnorm_brands").upsert(rows, { onConflict: "pcid,brand_rxcui" });
          if (e) throw new Error(e.message);
          withBrands++;
        }
        await db.from("rxnorm_lookup").upsert({ pcid: m.pcid, unii: m.unii, rxcui, status: "ok", n_brands: rows.length, pass });
        done++;
      } catch (e) {
        failed++;
        await db.from("rxnorm_lookup").upsert({ pcid: m.pcid, unii: m.unii, status: "error", detail: String(e).slice(0, 300) });
      }
    }
  }

  const total = queue.length;
  await Promise.all(Array.from({ length: WORKERS }, work));

  // keep going until nothing is left
  if (body.chain && total === limit) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rxnorm-brands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("Authorization") ?? "",
          "x-ingest-token": token,
        },
        body: JSON.stringify({ limit, chain: true }),
      }).catch(() => {}),
    );
  }

  return Response.json({ batch: total, done, with_brands: withBrands, failed, chained: !!body.chain && total === limit });
});
