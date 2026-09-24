// rxclass-ingest — pulls drug class memberships from NLM RxClass for every moiety.
//
// mode "taxonomy": loads ATC levels 1-4 (names + parents by code prefix) and the VA class tree
//                  into public.rxclass_classes. Run once before/after the drug pass.
// mode "va_verify": pulls each used VA class's product members and keeps single-ingredient product names
//                  in public.rxclass_va_products (VA assigns classes to products, so ingredient-level VA
//                  classes can leak in from combination products). Unused VA classes must be pre-marked
//                  members_fetched=true in SQL.
// mode "drugs" (default): takes the next `limit` moieties with no public.rxclass_lookup row,
//                  resolves an RxCUI (existing rxnorm_lookup -> UNII -> exact name), calls
//                  /rxclass/class/byRxcui once, and keeps FDA EPC / MoA / PE / chemical-structure
//                  (DailyMed), ATC level 4 and VA class rows in public.rxclass_drug.
//                  A salt RxCUI (PIN) with no classes falls back to its base ingredient (IN).
//                  With {chain: true} it re-invokes itself until every moiety has been tried.
//
// Guarded by header x-ingest-token = public.ingest_tokens(name='rxclass').
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const WORKERS = 6;
const PAUSE_MS = 90;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rx(path: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${RXNAV}${path}`, { signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`RxNav ${r.status} ${path}`);
    await sleep(PAUSE_MS);
    return await r.json();
  }
  throw new Error(`RxNav retries exhausted ${path}`);
}

const DAILYMED_RELAS: Record<string, string> = {
  has_epc: "EPC", has_moa: "MOA", has_pe: "PE", has_chemical_structure: "CHEM",
};

type ClassRow = { class_id: string; rela_source: string; rela: string; class_type: string; class_name: string };

function keepClasses(j: any): ClassRow[] {
  const out = new Map<string, ClassRow>();
  for (const d of j?.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
    const c = d.rxclassMinConceptItem ?? {};
    const src: string = d.relaSource ?? "";
    const rela: string = d.rela ?? "";
    let row: ClassRow | null = null;
    if ((src === "DAILYMED" || src === "FDASPL") && DAILYMED_RELAS[rela]) {
      row = { class_id: c.classId, rela_source: "DAILYMED", rela, class_type: DAILYMED_RELAS[rela], class_name: c.className };
    } else if (src === "ATC" && c.classType === "ATC1-4") {
      row = { class_id: c.classId, rela_source: "ATC", rela: "atc", class_type: "ATC", class_name: c.className };
    } else if (src === "VA" && c.classType === "VA" && rela === "has_VAClass") {
      row = { class_id: c.classId, rela_source: "VA", rela: "has_VAClass", class_type: "VA", class_name: c.className };
    }
    if (row?.class_id && row.class_name) out.set(`${row.class_id}|${row.rela_source}|${row.rela}`, row);
  }
  return [...out.values()];
}

async function taxonomy(db: any) {
  const rows: any[] = [];
  const atc = await rx(`/rxclass/allClasses.json?classTypes=ATC1-4`);
  for (const c of atc?.rxclassMinConceptList?.rxclassMinConcept ?? []) {
    const id: string = c.classId;
    const parent = id.length === 5 ? id.slice(0, 4) : id.length === 4 ? id.slice(0, 3) : id.length === 3 ? id.slice(0, 1) : null;
    rows.push({ class_id: id, rela_source: "ATC", class_type: "ATC", class_name: c.className, parent_class_id: parent });
  }
  const va = await rx(`/rxclass/classTree.json?classId=VA000`);
  const walk = (nodes: any[], parent: string | null) => {
    for (const n of nodes ?? []) {
      const c = n.rxclassMinConceptItem;
      if (c?.classId && c.classId !== "VA000") {
        rows.push({ class_id: c.classId, rela_source: "VA", class_type: "VA", class_name: c.className, parent_class_id: parent });
      }
      walk(n.rxclassTree, c?.classId === "VA000" ? null : c?.classId ?? parent);
    }
  };
  walk(va?.rxclassTree ?? [], null);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("rxclass_classes").upsert(rows.slice(i, i + 500), { onConflict: "class_id,rela_source" });
    if (error) throw new Error(error.message);
  }
  return { taxonomy_rows: rows.length };
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = req.headers.get("x-ingest-token") ?? "";
  const { data: tok } = await db.from("ingest_tokens").select("token").eq("name", "rxclass").maybeSingle();
  if (!tok || !token || tok.token !== token) return new Response("forbidden", { status: 403 });

  let body: { mode?: string; limit?: number; chain?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  if (body.mode === "va_verify") {
    const t0 = Date.now();
    const { data: todo, error: e0 } = await db.from("rxclass_classes")
      .select("class_id").eq("rela_source", "VA").eq("members_fetched", false).limit(400);
    if (e0) return Response.json({ error: e0.message }, { status: 500 });
    const queue = (todo ?? []).map((r: any) => r.class_id as string);
    let done = 0, products = 0;
    async function vaWork() {
      for (;;) {
        if (Date.now() - t0 > 100_000) return;
        const id = queue.shift();
        if (!id) return;
        try {
          const j = await rx(`/rxclass/classMembers.json?classId=${id}&relaSource=VA&rela=has_VAClass_extended`);
          const names: string[] = (j?.drugMemberGroup?.drugMember ?? []).map((m: any) => String(m?.minConcept?.name ?? "").toLowerCase())
            .filter((n: string) => n && !n.includes(" / "));
          const rows = [...new Set(names)].map((product) => ({ class_id: id, product }));
          for (let i = 0; i < rows.length; i += 500) {
            const { error } = await db.from("rxclass_va_products").upsert(rows.slice(i, i + 500), { onConflict: "class_id,product" });
            if (error) throw new Error(error.message);
          }
          products += rows.length;
          await db.from("rxclass_classes").update({ members_fetched: true, fetch_error: null }).eq("class_id", id).eq("rela_source", "VA");
          done++;
        } catch (e) {
          await db.from("rxclass_classes").update({ members_fetched: true, fetch_error: String(e).slice(0, 200) }).eq("class_id", id).eq("rela_source", "VA");
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, vaWork));
    const left = queue.length;
    if (left > 0) {
      // @ts-ignore EdgeRuntime is provided by the Supabase runtime
      EdgeRuntime.waitUntil(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rxclass-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "", "x-ingest-token": token },
        body: JSON.stringify({ mode: "va_verify" }),
      }).catch(() => {}));
    }
    return Response.json({ va_classes_done: done, products, left });
  }

  if (body.mode === "taxonomy") {
    try { return Response.json(await taxonomy(db)); }
    catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
  }

  const limit = Math.max(1, Math.min(300, Number(body.limit ?? 200)));
  const { data: todo, error } = await db.rpc("rxclass_todo", { p_limit: limit });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const queue: { pcid: number; unii: string | null; base_name: string | null; name: string | null; rxcui: string | null }[] = todo ?? [];

  let done = 0, withClasses = 0, notFound = 0, failed = 0;

  async function work() {
    for (;;) {
      const m = queue.shift();
      if (!m) return;
      try {
        let rxcui = m.rxcui, basis = rxcui ? "rxnorm_lookup" : null;
        if (!rxcui && m.unii) {
          rxcui = (await rx(`/rxcui.json?idtype=UNII_CODE&id=${encodeURIComponent(m.unii)}`))?.idGroup?.rxnormId?.[0] ?? null;
          if (rxcui) basis = "unii";
        }
        for (const nm of [m.name, m.base_name]) {
          if (rxcui || !nm) continue;
          rxcui = (await rx(`/rxcui.json?name=${encodeURIComponent(nm.toLowerCase())}&search=0`))?.idGroup?.rxnormId?.[0] ?? null;
          if (rxcui) basis = "name";
        }
        if (!rxcui) {
          await db.from("rxclass_lookup").upsert({ pcid: m.pcid, status: "no_rxcui", n_classes: 0 });
          notFound++; done++; continue;
        }
        let classes = keepClasses(await rx(`/rxclass/class/byRxcui.json?rxcui=${rxcui}`));
        if (classes.length === 0) {
          const rel = await rx(`/rxcui/${rxcui}/related.json?tty=IN`);
          const base = (rel?.relatedGroup?.conceptGroup ?? []).flatMap((g: any) => g.conceptProperties ?? [])[0];
          if (base?.rxcui && base.rxcui !== rxcui) {
            classes = keepClasses(await rx(`/rxclass/class/byRxcui.json?rxcui=${base.rxcui}`));
            if (classes.length) { rxcui = base.rxcui; basis = `${basis}+base_in`; }
          }
        }
        if (classes.length) {
          const { error: e } = await db.from("rxclass_drug").upsert(classes.map((c) => ({ pcid: m.pcid, ...c })),
            { onConflict: "pcid,class_id,rela_source,rela" });
          if (e) throw new Error(e.message);
          withClasses++;
        }
        await db.from("rxclass_lookup").upsert({ pcid: m.pcid, rxcui, rxcui_basis: basis, status: "ok", n_classes: classes.length });
        done++;
      } catch (e) {
        failed++;
        await db.from("rxclass_lookup").upsert({ pcid: m.pcid, status: "error", detail: String(e).slice(0, 300) });
      }
    }
  }

  const total = queue.length;
  await Promise.all(Array.from({ length: WORKERS }, work));

  if (body.chain && total === limit) {
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rxclass-ingest`, {
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

  return Response.json({ batch: total, done, with_classes: withClasses, no_rxcui: notFound, failed, chained: !!body.chain && total === limit });
});
