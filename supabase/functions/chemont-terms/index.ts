// chemont-terms — one-off loader for the ClassyFire ChemOnt taxonomy (names, parents, definitions)
// into public.chemont_terms. Guarded by x-ingest-token = ingest_tokens(name='rxclass').
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";

const SOURCES = [
  "http://classyfire.wishartlab.com/system/downloads/1_0/chemont/ChemOnt_2_1.obo.zip",
  "https://classyfire.wishartlab.com/system/downloads/1_0/chemont/ChemOnt_2_1.obo.zip",
];

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxclass").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let text = "", tried: string[] = [];
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      tried.push(`${url} ${r.status}`);
      if (!r.ok) continue;
      const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
      const obo = Object.keys(files).find((k) => k.endsWith(".obo"));
      if (obo) { text = strFromU8(files[obo]); break; }
    } catch (e) { tried.push(`${url} ${String(e).slice(0, 120)}`); }
  }
  if (!text) return Response.json({ error: "download failed", tried }, { status: 502 });

  const rows: { chemont_id: string; name: string; parent_id: string | null; definition: string | null }[] = [];
  for (const block of text.split(/\n\[Term\]\n/).slice(1)) {
    const id = block.match(/^id: (CHEMONTID:\d+)/m)?.[1];
    const name = block.match(/^name: (.+)$/m)?.[1]?.trim();
    if (!id || !name) continue;
    const parent = block.match(/^is_a: (CHEMONTID:\d+)/m)?.[1] ?? null;
    const def = block.match(/^def: "(.*)"/m)?.[1]?.replace(/\\"/g, '"') ?? null;
    rows.push({ chemont_id: id, name, parent_id: parent, definition: def });
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("chemont_terms").upsert(rows.slice(i, i + 1000), { onConflict: "chemont_id" });
    if (error) return Response.json({ error: error.message, at: i }, { status: 500 });
  }
  return Response.json({ terms: rows.length, tried });
});
