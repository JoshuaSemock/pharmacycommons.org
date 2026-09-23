// drugsfda-ingest — loads one page of openFDA /drug/drugsfda into
// public.fda_applications + public.fda_products (idempotent upsert).
//
// Call with POST {skip, limit, search?} and header x-ingest-token matching
// public.ingest_tokens(name='drugsfda'). Delete that token row to disable it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_SEARCH = "application_number:NDA* application_number:BLA*"; // openFDA: space = OR

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "drugsfda").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { skip?: number; limit?: number; search?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const skip = Math.max(0, Math.min(25000, Number(body.skip ?? 0)));
  const limit = Math.max(1, Math.min(1000, Number(body.limit ?? 1000)));
  const search = body.search ?? DEFAULT_SEARCH;

  const url = new URL("https://api.fda.gov/drug/drugsfda.json");
  url.searchParams.set("search", search);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));
  const key = Deno.env.get("OPENFDA_API_KEY");
  if (key) url.searchParams.set("api_key", key);

  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (r.status === 404) return Response.json({ skip, fetched: 0, total: 0, note: "no results" });
  if (!r.ok) return Response.json({ skip, error: `openFDA HTTP ${r.status}`, detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  const results: any[] = j.results ?? [];

  const apps = results.map((a) => ({
    appl_no: a.application_number,
    application_type: String(a.application_number).match(/^[A-Z]+/)?.[0] ?? null,
    sponsor_name: a.sponsor_name ?? null,
    raw: { ...a, products: undefined },
    fetched_at: new Date().toISOString(),
  }));

  const products = results.flatMap((a) =>
    (a.products ?? []).map((p: any) => ({
      product_id: `${a.application_number}-${p.product_number ?? "000"}`,
      appl_no: a.application_number,
      product_no: p.product_number ?? null,
      ndc: null,
      brand_name: p.brand_name ?? null,
      generic_name: (p.active_ingredients ?? []).map((i: any) => i.name).filter(Boolean).join("; ") || null,
      dosage_form: p.dosage_form ?? null,
      route: p.route ?? null,
      marketing_status: p.marketing_status ?? null,
      raw: p,
      fetched_at: new Date().toISOString(),
    }))
  );

  // de-duplicate within the page (defensive; PK collisions abort a batch upsert)
  const uniq = <T,>(rows: T[], k: (r: T) => string) => [...new Map(rows.map((x) => [k(x), x])).values()];
  const a1 = await db.from("fda_applications").upsert(uniq(apps, (x) => x.appl_no), { onConflict: "appl_no" });
  if (a1.error) return Response.json({ skip, error: `applications: ${a1.error.message}` }, { status: 500 });
  const p1 = await db.from("fda_products").upsert(uniq(products, (x) => x.product_id), { onConflict: "product_id" });
  if (p1.error) return Response.json({ skip, error: `products: ${p1.error.message}` }, { status: 500 });

  return Response.json({ skip, fetched: results.length, products: products.length, total: j.meta?.results?.total ?? null });
});
