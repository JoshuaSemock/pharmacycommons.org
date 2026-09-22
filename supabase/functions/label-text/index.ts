// label-text — returns readable FDA label sections for an entity (by slug) or a label (by setid).
// First request for a label fetches it from openFDA and caches it in
// public.label_fetch_log + public.label_section_text; later requests are served from the cache.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const REFRESH_AFTER_DAYS = 30;
const PARSER_VERSION = 4; // bump when parsing changes; cached labels with an older version are re-fetched
const SETID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/;

type Group = "safety" | "core" | "populations" | "reference";
interface SectionDef { key: string; title: string; loinc: string; group: Group }

// Display order = array order. Keys are openFDA /drug/label field names.
const SECTIONS: SectionDef[] = [
  { key: "boxed_warning", title: "Boxed warning", loinc: "34066-1", group: "safety" },
  { key: "indications_and_usage", title: "What it's used for", loinc: "34067-9", group: "core" },
  { key: "dosage_and_administration", title: "Dosing and administration", loinc: "34068-7", group: "core" },
  { key: "dosage_forms_and_strengths", title: "Forms and strengths", loinc: "43678-2", group: "core" },
  { key: "contraindications", title: "Who should not take it", loinc: "34070-3", group: "core" },
  { key: "warnings_and_cautions", title: "Warnings and precautions", loinc: "43685-7", group: "core" },
  { key: "warnings", title: "Warnings", loinc: "34071-1", group: "core" },
  { key: "precautions", title: "Precautions", loinc: "42232-9", group: "core" },
  { key: "adverse_reactions", title: "Side effects", loinc: "34084-4", group: "core" },
  { key: "drug_interactions", title: "Drug interactions", loinc: "34073-7", group: "core" },
  { key: "use_in_specific_populations", title: "Use in specific populations", loinc: "43684-0", group: "populations" },
  { key: "pregnancy", title: "Pregnancy", loinc: "42228-7", group: "populations" },
  { key: "lactation", title: "Breastfeeding", loinc: "77290-5", group: "populations" },
  { key: "nursing_mothers", title: "Breastfeeding", loinc: "34080-2", group: "populations" },
  { key: "pediatric_use", title: "Children", loinc: "34081-0", group: "populations" },
  { key: "geriatric_use", title: "Older adults", loinc: "34082-8", group: "populations" },
  { key: "overdosage", title: "Overdose", loinc: "34088-5", group: "reference" },
  { key: "drug_abuse_and_dependence", title: "Abuse and dependence", loinc: "42227-9", group: "reference" },
  { key: "mechanism_of_action", title: "How it works", loinc: "43679-0", group: "reference" },
  { key: "clinical_pharmacology", title: "Clinical pharmacology", loinc: "34090-1", group: "reference" },
  { key: "pharmacodynamics", title: "Pharmacodynamics", loinc: "43681-6", group: "reference" },
  { key: "pharmacokinetics", title: "Pharmacokinetics", loinc: "43682-4", group: "reference" },
  { key: "clinical_studies", title: "Clinical studies", loinc: "34092-7", group: "reference" },
  { key: "how_supplied", title: "How supplied", loinc: "34069-5", group: "reference" },
  { key: "storage_and_handling", title: "Storage and handling", loinc: "44425-7", group: "reference" },
  { key: "patient_counseling_information", title: "Patient counseling", loinc: "88436-1", group: "reference" },
  { key: "information_for_patients", title: "Information for patients", loinc: "34076-0", group: "reference" },
  { key: "description", title: "Description", loinc: "34089-3", group: "reference" },
];
const SECTION_BY_KEY = new Map(SECTIONS.map((s, i) => [s.key, { ...s, order: i }]));

// openFDA returns both a parent section and its children as separate fields, with the
// children's text repeated inside the parent. Show the parent; drop the children.
// clinical_pharmacology is the reverse: keep the specific children, drop the umbrella.
const REDUNDANT_IF_PRESENT: Record<string, string[]> = {
  pregnancy: ["use_in_specific_populations"],
  lactation: ["use_in_specific_populations"],
  nursing_mothers: ["use_in_specific_populations"],
  pediatric_use: ["use_in_specific_populations"],
  geriatric_use: ["use_in_specific_populations"],
  clinical_pharmacology: ["mechanism_of_action", "pharmacodynamics", "pharmacokinetics"],
};

interface Block { heading?: string; text: string }

// ---------- text cleanup ----------

const CONNECTORS = new Set(["and", "or", "of", "in", "with", "for", "the", "to", "a", "an", "on", "by", "&", "vs", "vs.", "at", "from", "during", "after", "before", "without", "due"]);
const isCap = (w: string) => /^[A-Z0-9(“"'][\w\-/,()'’:.+®™]*$/.test(w);
const isBullet = (w: string) => /^[•●▪]/.test(w);
const isLowerWord = (w: string) => /^[a-z]/.test(w);
const MAX_HEADING_WORDS = 14;

/** "Lactic Acidosis There have been ..." -> { heading: "Lactic Acidosis", text: "There have been ..." } */
function splitHeading(chunk: string): Block {
  const words = chunk.split(" ");
  let j = 0;
  for (; j < words.length && j <= MAX_HEADING_WORDS; j++) {
    const w = words[j], next = words[j + 1] ?? "";
    if (isBullet(w)) break; // a bullet list starts the body
    if (j > 0 && isCap(w) && isLowerWord(next) && !CONNECTORS.has(next.toLowerCase())) break; // "There have", "In clinical"
    if (isCap(w)) continue;
    if (CONNECTORS.has(w.toLowerCase()) && isCap(next)) continue; // "Use in Renal"
    // "... Secretagogues Insulin and insulin": the prose began at the previous capitalised word
    if (j >= 2 && CONNECTORS.has(w.toLowerCase()) && isCap(words[j - 1])) {
      j = j - 1;
      while (j > 1 && CONNECTORS.has(words[j - 1].toLowerCase()) && isCap(words[j - 1])) j--; // keep "An"/"The" in the body
      break;
    }
    j = -1;
    break; // lowercase prose: no heading
  }
  if (j > 0 && j <= MAX_HEADING_WORDS && j < words.length) {
    return { heading: words.slice(0, j).join(" ").replace(/[:.]$/, ""), text: tidy(words.slice(j).join(" ")) };
  }
  return { text: tidy(chunk) };
}

/** Remove the leading "5 WARNINGS AND PRECAUTIONS" / "WARNING: LACTIC ACIDOSIS" heading; return section number if present. */
function stripHeading(raw: string): { num: string | null; body: string; boxedTitle?: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const m = text.match(/^(\d{1,2})?\s*([A-Z][A-Z0-9&,/\-()'’: ]{2,160}?)(?=\s+(?:\d{1,2}\.\d{1,2}\s|[A-Z][a-z]|[•●▪\-–]\s|\(|$))/);
  if (m && m[2] && m[2].replace(/[^A-Z]/g, "").length >= 3) {
    const heading = m[2].trim();
    return { num: m[1] ?? null, body: text.slice(m[0].length).trim(), boxedTitle: heading };
  }
  return { num: null, body: text };
}

/** Put bullets on their own lines so pre-line rendering is readable. */
function tidy(text: string): string {
  const lines = stripRefs(text)
    .replace(/\s*([•●▪])\s*/g, "\n• ")
    .replace(/\s*\[\[TABLE:(\d+)\]\]\s*/g, "\n[[TABLE:$1]]\n")
    .replace(/\s+(Table \d+[.:]?)/g, "\n$1")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // PLR labels repeat the Highlights bullets after the full text; drop exact repeats.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const k = dedupeKey(l);
    if (k.length > 12 && seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out.join("\n");
}

const dedupeKey = (l: string) =>
  l.replace(/\[\s*see [^\]]*\]/gi, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const stripRefs = (t: string) => t.replace(/\s*\(\s*\d{1,2}(\.\d{1,2})*(\s*,\s*\d{1,2}(\.\d{1,2})*)*\s*\)/g, "");
const cleanTitle = (t: string) => t.replace(/^\d{1,2}(\.\d{1,2})*\s+/, "").replace(/\s*:\s*$/, "").trim();

/** Split on the label's own subsection titles (from label_sections), which are exact. */
function splitOnKnownTitles(body: string, titles: string[]): Block[] | null {
  const cuts: { idx: number; len: number; heading: string }[] = [];
  let cursor = 0;
  for (const raw of titles) {
    const t = raw.replace(/\s+/g, " ").replace(/\s*:\s*$/, "").trim();
    if (t.length < 3) continue;
    let idx = body.indexOf(t, cursor);
    // must sit on a word boundary so "Gold" doesn't match inside "Golden"
    while (idx !== -1 && ((idx > 0 && body[idx - 1] !== " ") || /[A-Za-z0-9]/.test(body[idx + t.length] ?? ""))) {
      idx = body.indexOf(t, idx + 1);
    }
    if (idx === -1) continue;
    cuts.push({ idx, len: t.length, heading: cleanTitle(t) });
    cursor = idx + t.length;
  }
  if (cuts.length === 0) return null;
  const blocks: Block[] = [];
  const lead = body.slice(0, cuts[0].idx).trim();
  if (lead) blocks.push({ heading: "Summary", text: tidy(stripRefs(lead)) });
  cuts.forEach((c, i) => {
    const text = body.slice(c.idx + c.len, i + 1 < cuts.length ? cuts[i + 1].idx : undefined).replace(/^\s*:\s*/, "").trim();
    blocks.push({ heading: c.heading, text: tidy(text) });
  });
  return blocks.filter((b) => b.text || b.heading);
}

/** Fallback: split "5.1 Lactic Acidosis There have been ... 5.2 ..." on numbers and guess each heading. */
function splitSubsections(body: string, num: string | null, titles: string[] = []): Block[] {
  const known = titles.length ? splitOnKnownTitles(body, titles) : null;
  if (known) return known;
  if (!num) num = body.match(/(?:^|\s)(\d{1,2})\.\d{1,2}\s+[A-Z]/)?.[1] ?? null;
  if (!num) return [{ text: tidy(body) }];
  const re = new RegExp(`(?:^|\\s)(${num}\\.\\d{1,2})\\s+(?=[A-Z])`, "g");
  const cuts: { idx: number; len: number }[] = [];
  for (const m of body.matchAll(re)) cuts.push({ idx: m.index!, len: m[0].length });
  if (cuts.length === 0) return [{ text: tidy(body) }];

  const blocks: Block[] = [];
  // PLR labels open each section with the Highlights bullets (with "( 5.1 )" refs) before the numbered subsections
  const lead = body.slice(0, cuts[0].idx).trim();
  if (lead) blocks.push({ heading: "Summary", text: tidy(stripRefs(lead)) });

  cuts.forEach((c, i) => {
    const chunk = body.slice(c.idx + c.len, i + 1 < cuts.length ? cuts[i + 1].idx : undefined).trim();
    if (chunk) blocks.push(splitHeading(chunk));
  });
  return blocks.filter((b) => b.text || b.heading);
}

/** Plain text of an openFDA table fragment, whitespace-collapsed, for locating it in the prose. */
function tableText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * openFDA flattens each table into the section prose as well as returning its HTML.
 * Swap the flattened copy for a [[TABLE:i]] marker so the table renders once, in place.
 */
function markTables(text: string, tables: string[] | null): { text: string; placed: Set<number> } {
  const placed = new Set<number>();
  if (!tables) return { text, placed };
  let out = text.replace(/\s+/g, " ");
  tables.forEach((html, i) => {
    const t = tableText(html);
    if (t.length < 60) return;
    const head = t.slice(0, 50), tail = t.slice(-50);
    const a = out.indexOf(head);
    if (a === -1) return;
    const b = out.indexOf(tail, a + head.length);
    if (b === -1 || b - a > t.length * 1.5) return;
    out = `${out.slice(0, a)} [[TABLE:${i}]] ${out.slice(b + tail.length)}`;
    placed.add(i);
  });
  return { text: out, placed };
}

function toBlocks(key: string, values: string[], titles: string[] = []): Block[] {
  const blocks: Block[] = [];
  for (const v of values) {
    const { num, body, boxedTitle } = stripHeading(v);
    if (key === "boxed_warning") {
      // keep the specific risk as the heading, e.g. "WARNING: LACTIC ACIDOSIS"
      blocks.push({ heading: boxedTitle, text: tidy(body) });
    } else {
      blocks.push(...splitSubsections(body, num, titles));
    }
  }
  return blocks;
}

/** "These highlights do not include ... See full prescribing information for X. ..." -> "X" */
function displayTitle(title: string | null): string | null {
  if (!title) return null;
  const m = title.match(/see full prescribing information for\s+(.+?)\.(\s|$)/i);
  const t = (m ? m[1] : title).replace(/\s+/g, " ").trim();
  // "LISINOPRIL TABLETS LISINOPRIL tablets, for oral use ..." -> "LISINOPRIL TABLETS"
  const words = t.split(" ");
  let n = words.findIndex((w) => /^[a-z]/.test(w));
  if (n === -1) n = words.length;
  if (n > 1 && words[n - 1].toUpperCase() === words[0].toUpperCase()) n--;
  return words.slice(0, Math.max(n, 1)).join(" ").replace(/[,;:]$/, "");
}

// ---------- openFDA ----------

type FetchResult =
  | { status: "ok"; doc: Record<string, unknown> }
  | { status: "not_found" }
  | { status: "error"; detail: string };

async function fetchOpenFda(setid: string): Promise<FetchResult> {
  const key = Deno.env.get("OPENFDA_API_KEY");
  const url = new URL("https://api.fda.gov/drug/label.json");
  url.searchParams.set("search", `set_id:"${setid}"`);
  url.searchParams.set("limit", "1");
  if (key) url.searchParams.set("api_key", key);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) return { status: "error", detail: `openFDA HTTP ${r.status}` };
    const j = await r.json();
    const doc = j?.results?.[0];
    return doc ? { status: "ok", doc } : { status: "not_found" };
  } catch (e) {
    return { status: "error", detail: String(e).slice(0, 300) };
  }
}

// deno-lint-ignore no-explicit-any
type DB = any;

async function cacheLabel(db: DB, setid: string, res: FetchResult) {
  if (res.status === "error") return; // don't pin transient failures
  const first = (v: unknown) => (Array.isArray(v) ? (v[0] as string) ?? null : null);
  // deno-lint-ignore no-explicit-any
  const doc = res.status === "ok" ? (res.doc as any) : null;
  await db.from("label_fetch_log").upsert({
    setid,
    status: res.status,
    source: "openfda",
    application_number: first(doc?.openfda?.application_number),
    brand_name: first(doc?.openfda?.brand_name),
    generic_name: first(doc?.openfda?.generic_name),
    source_effective: doc?.effective_time ?? null,
    error_detail: null,
    parser_version: PARSER_VERSION,
    fetched_at: new Date().toISOString(),
  });
  await db.from("label_section_text").delete().eq("setid", setid);
  if (!doc) return;

  const { data: outline } = await db
    .from("label_sections")
    .select("section_order,loinc_code,title,parent_title")
    .eq("setid", setid)
    .order("section_order");
  const childTitles = new Map<string, string[]>(); // top-level LOINC -> descendant titles in order
  let currentTop: string | null = null;
  for (const r of (outline ?? []) as { loinc_code: string; title: string | null; parent_title: string | null }[]) {
    if (!r.parent_title) { currentTop = r.loinc_code; if (!childTitles.has(currentTop)) childTitles.set(currentTop, []); continue; }
    if (currentTop && r.title) childTitles.get(currentTop)!.push(r.title);
  }

  const has = (k: string) => Array.isArray(doc[k]) && doc[k].length > 0;
  const rows = [];
  for (const def of SECTIONS) {
    const vals = doc[def.key];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    if ((REDUNDANT_IF_PRESENT[def.key] ?? []).some(has)) continue;

    const tableList = Array.isArray(doc[`${def.key}_table`]) ? (doc[`${def.key}_table`] as string[]) : null;
    const allPlaced = new Set<number>();
    const marked = (vals as string[]).map((v) => {
      const { text, placed } = markTables(v, tableList);
      placed.forEach((i) => allPlaced.add(i));
      return text;
    });

    let blocks = toBlocks(def.key, marked, childTitles.get(def.loinc) ?? []);
    // identical subsections (some labels repeat one for IR and ER) show once
    const seenBlocks = new Set<string>();
    blocks = blocks.filter((b) => {
      const k = `${b.heading ?? ""}|${dedupeKey(b.text)}`;
      if (seenBlocks.has(k)) return false;
      seenBlocks.add(k);
      return true;
    });
    // a lone heading that just repeats the section ("Pediatric Use" under Children) adds nothing
    if (blocks.length === 1 && blocks[0].heading &&
        dedupeKey(blocks[0].heading) === def.key.replace(/_/g, "")) delete blocks[0].heading;
    if (blocks.length === 0) continue;
    // inline tables render at their [[TABLE:i]] marker; the rest are listed after the text
    const tables = tableList ? tableList.map((html, i) => ({ inline: allPlaced.has(i), html })) : null;
    rows.push({
      setid,
      section_key: def.key,
      loinc_code: def.loinc,
      title: def.title,
      display_order: SECTION_BY_KEY.get(def.key)!.order,
      blocks,
      tables_html: tables && tables.length ? tables : null,
    });
  }
  if (rows.length) {
    const { error } = await db.from("label_section_text").insert(rows);
    if (error) throw new Error(`cache insert failed: ${error.message}`);
  }
}

/** Returns the cached label, fetching/refreshing from openFDA when needed. null = openFDA has no such label. */
async function getLabel(db: DB, setid: string) {
  const { data: log } = await db.from("label_fetch_log").select("*").eq("setid", setid).maybeSingle();
  const stale = log &&
    (log.parser_version !== PARSER_VERSION || Date.now() - new Date(log.fetched_at).getTime() > REFRESH_AFTER_DAYS * 864e5);

  if (!log || stale) {
    const res = await fetchOpenFda(setid);
    if (res.status === "error" && !log) return { error: res.detail };
    if (res.status !== "error") await cacheLabel(db, setid, res);
    if (res.status === "not_found") return null;
  } else if (log.status === "not_found") {
    return null;
  }

  const [{ data: meta }, { data: fetchLog }, { data: sections }] = await Promise.all([
    db.from("label_documents").select("setid,title,labeler,effective_time,version_number").eq("setid", setid).maybeSingle(),
    db.from("label_fetch_log").select("application_number,brand_name,generic_name,fetched_at").eq("setid", setid).maybeSingle(),
    db.from("label_section_text").select("section_key,loinc_code,title,display_order,blocks,tables_html").eq("setid", setid).order("display_order"),
  ]);
  if (!sections || sections.length === 0) return null;

  return {
    label: {
      setid,
      title: displayTitle(meta?.title ?? null) ?? fetchLog?.brand_name ?? fetchLog?.generic_name ?? null,
      labeler: meta?.labeler ?? null,
      effective_time: meta?.effective_time ?? null,
      version: meta?.version_number ?? null,
      application_number: fetchLog?.application_number ?? null,
      brand_name: fetchLog?.brand_name ?? null,
      dailymed_url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`,
      fetched_at: fetchLog?.fetched_at ?? null,
    },
    sections: sections.map((s: Record<string, unknown>) => ({
      key: s.section_key,
      title: s.title,
      loinc: s.loinc_code,
      group: SECTION_BY_KEY.get(s.section_key as string)?.group ?? "reference",
      blocks: s.blocks,
      tables_html: s.tables_html,
    })),
  };
}

const json = (body: unknown, status = 200, cache = true) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      ...(cache && status === 200 ? { "Cache-Control": "public, max-age=3600" } : {}),
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let slug: string | null = null;
  let setid: string | null = null;
  const u = new URL(req.url);
  slug = u.searchParams.get("slug");
  setid = u.searchParams.get("setid");
  if (req.method === "POST") {
    try {
      const b = await req.json();
      slug = b?.slug ?? slug;
      setid = b?.setid ?? setid;
    } catch { /* empty body */ }
  }
  if (setid && !SETID_RE.test(setid)) return json({ error: "invalid setid" }, 400, false);
  if (!setid && (!slug || !SLUG_RE.test(slug))) return json({ error: "pass ?slug= or ?setid=" }, 400, false);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    let candidates: { setid: string; labeler: string | null; effective_time: string | null }[] = [];
    let nLabels = 0;

    if (setid) {
      const { data } = await db.from("label_documents").select("setid,labeler,effective_time").eq("setid", setid).maybeSingle();
      if (!data) return json({ error: "unknown setid" }, 404, false);
      candidates = [data];
    } else {
      const { data: ent } = await db.from("entities").select("pcid").eq("slug", slug).maybeSingle();
      if (!ent) return json({ error: "unknown slug" }, 404, false);
      const { data: ranked } = await db
        .from("entity_label_rank")
        .select("setid,labeler,effective_time,n_labels,rnk")
        .eq("pcid", ent.pcid)
        .order("rnk");
      candidates = ranked ?? [];
      nLabels = ranked?.[0]?.n_labels ?? 0;
      if (candidates.length === 0) return json({ label: null, sections: [], n_labels: 0, other_labels: [] });
    }

    let lastError: string | null = null;
    for (const c of candidates) {
      const got = await getLabel(db, c.setid);
      if (got && "error" in got) { lastError = got.error; continue; }
      if (got) {
        return json({
          ...got,
          n_labels: nLabels || 1,
          other_labels: candidates.filter((o) => o.setid !== c.setid),
        });
      }
    }
    if (lastError) return json({ error: "label source unavailable", detail: lastError }, 503, false);
    return json({
      label: null,
      sections: [],
      n_labels: nLabels,
      other_labels: candidates,
      note: "None of the top-ranked labels are available from openFDA; see DailyMed.",
    });
  } catch (e) {
    return json({ error: "internal", detail: String(e).slice(0, 300) }, 500, false);
  }
});
