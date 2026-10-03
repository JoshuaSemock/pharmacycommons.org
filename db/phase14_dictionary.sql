-- =============================================================================
-- Phase 14 — Medical dictionary (/tools/dictionary) and term lists
-- Applied 2026-10-03 as migrations phase14a … phase14g (apply_migration).
-- Data loads (not migrations) are recorded at the bottom.
-- =============================================================================

-- ── 14a dictionary_terms ─────────────────────────────────────────────────────
create table public.dictionary_terms (
  id               integer primary key,              -- the source workbook's ID column
  term             text not null,
  definition       text,
  kind             text not null check (kind in ('Term', 'Abbreviation', 'Grammar')),
  term_type        text,                             -- generic / brand / Initialism / Acronym / Logograph / Other
  bucket           text not null,                    -- A–Z index key (same keys as browse: 'A'…'Z', '#', 'g:alpha'…, 'sym')
  sort_key         text not null,
  member_pcid      bigint references public.entities(pcid),  -- the drug this term names, when it names one
  pcid_match       text check (pcid_match in ('source', 'name', 'brand', 'definition')),
  source_pcid      bigint,                           -- PCID as given in the workbook, kept for audit
  source_letter    text,
  source_tjc_flag  boolean not null default false,  -- the workbook's "Do Not Use" column, as given
  in_dic           boolean not null default true,   -- contributes words to the .dic download
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.dictionary_terms is
  'Medical terminology, abbreviations and drug/brand names for the /tools/dictionary page and its Word .dic download. member_pcid links drug terms to their entity.';
comment on column public.dictionary_terms.in_dic is
  'False keeps a row out of the .dic download. Every row is true at load (Joshua, 2026-10-03: include everything, Do Not Use abbreviations too).';
create index dictionary_terms_bucket_idx on public.dictionary_terms (bucket, sort_key, id);
create index dictionary_terms_member_idx on public.dictionary_terms (member_pcid) where member_pcid is not null;
create index dictionary_terms_lower_term_idx on public.dictionary_terms (lower(term));
alter table public.dictionary_terms enable row level security;
create policy dictionary_terms_public_read on public.dictionary_terms for select to anon, authenticated using (true);
grant select on public.dictionary_terms to anon, authenticated;

-- ── 14b list_items may hold plain terms ──────────────────────────────────────
alter table public.list_items alter column member_pcid drop not null;
alter table public.list_items add column term_id integer references public.dictionary_terms(id);
comment on column public.list_items.term_id is
  'For entries that are not drug records: the dictionary term this entry is. member_pcid is then null and source_name is what the page shows.';
create index list_items_term_idx on public.list_items (term_id) where term_id is not null;

create or replace function public.get_list(p_slug text)
 returns jsonb language sql stable set search_path to 'public'
as $function$
  select jsonb_build_object(
    'pcid', l.pcid, 'pcid_code', 'PCID-' || l.pcid, 'slug', l.slug, 'title', l.title, 'description', l.description,
    'kind', l.kind, 'jurisdiction', l.jurisdiction, 'source_citation', l.source_citation, 'source_url', l.source_url,
    'license', l.license, 'measure_label', l.measure_label, 'measure_unit', l.measure_unit, 'rank_label', l.rank_label,
    'status_label', l.status_label,
    'default_sort', l.default_sort, 'item_count', l.item_count, 'updated_at', l.updated_at,
    'parent', (select jsonb_build_object('slug', p.slug, 'title', p.title) from lists p where p.pcid = l.parent_pcid),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'item_count', c.item_count) order by c.sort_order, c.title)
                          from lists c where c.parent_pcid = l.pcid), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'position', i.position, 'rank', i.rank, 'value', i.value, 'legal_status', i.legal_status, 'note', i.note,
                'sources', i.sources,
                'source_name', i.source_name, 'pcid', e.pcid, 'slug', e.slug,
                'name', coalesce(e.name, i.source_name), 'entity_type', coalesce(e.entity_type, 'term'),
                'term_id', i.term_id)
              order by i.position)
              from list_items i left join entities e on e.pcid = i.member_pcid where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$function$;

-- ── 14c (separate migration: constraint add) ─────────────────────────────────
alter table public.list_items add constraint list_items_member_or_term check (member_pcid is not null or term_id is not null);

-- ── 14d the .dic word list (as amended by 14f, 2026-10-03) ──────────────────
-- 14f: split where Word itself breaks words — brackets, commas, semicolons and colons as well
-- as spaces and slashes — so chemical names give whole words instead of fragments like "di(4".
create or replace function public.dictionary_words()
 returns table (word text) language sql stable security invoker set search_path to 'public'
as $function$
  with raw as (
    select regexp_split_to_table(term, '[\s/(){}\[\],;:<>]+') as tok from dictionary_terms where in_dic
  ),
  parts as (
    select tok from raw
    union all
    select regexp_split_to_table(tok, '-') from raw where tok like '%-%'
  ),
  trimmed as (
    select regexp_replace(regexp_replace(tok, '^["''“‘.\-]+', ''), '["''”’!?\-]+$', '') as tok from parts
  ),
  cleaned as (
    -- a lone trailing period is sentence punctuation; keep it when the word has others (q.d., e.g.)
    select case when tok ~ '\.$' and tok !~ '\..*\.$' then left(tok, -1) else tok end as tok from trimmed
  ),
  words as (
    select distinct tok from cleaned
    where char_length(tok) between 2 and 64
      and tok ~ '[A-Za-z\u00C0-\u024F\u0370-\u03FF]'
  ),
  grouped as (
    -- An all-lower-case entry already covers Capitalised and UPPER-CASE spellings in Word.
    select tok, bool_or(tok = lower(tok)) over (partition by lower(tok)) as has_lower from words
  )
  select tok from grouped where tok = lower(tok) or not has_lower
  order by lower(tok), tok
$function$;

create or replace function public.dictionary_dic()
 returns text language sql stable security invoker set search_path to 'public'
as $function$
  select string_agg(word, E'\r\n') || E'\r\n' from public.dictionary_words()
$function$;
comment on function public.dictionary_dic() is
  'The Pharmacy Commons medical dictionary as a Word custom dictionary body: one word per CRLF line. The site adds the UTF-8 byte-order mark and saves it as .dic.';
grant execute on function public.dictionary_words() to anon, authenticated;
grant execute on function public.dictionary_dic() to anon, authenticated;

-- ── 14e letter counts ────────────────────────────────────────────────────────
create or replace function public.dictionary_buckets()
 returns table (bucket text, n integer) language sql stable security invoker set search_path to 'public'
as $function$
  select bucket, count(*)::int from dictionary_terms group by bucket
$function$;
grant execute on function public.dictionary_buckets() to anon, authenticated;

-- ── 14g which lists hold terms ───────────────────────────────────────────────
-- The Lists index says "19 entries" (not "19 drugs") for lists of plain terms.
create or replace function public.list_term_counts()
 returns table (slug text, term_count integer) language sql stable security invoker set search_path to 'public'
as $function$
  select l.slug, count(*)::int
  from lists l join list_items i on i.list_pcid = l.pcid
  where i.term_id is not null
  group by l.slug
$function$;
grant execute on function public.list_term_counts() to anon, authenticated;

-- =============================================================================
-- Data loads, 2026-10-03 (execute_sql; change_source tags in entity_changes)
-- =============================================================================
-- dictionary-import-2026-10-03
--   53,928 rows from db/data/dictionary_2026-10-03.json (Dictionary.xlsx cleaned by
--   scripts/dictionary_clean.py; one source row with a blank term, "Master of Science",
--   was dropped). Fetched into Postgres with pg_net from the feat/dictionary-tool commit
--   9abfa61, md5 1d352d889630b128dc9cd9abeb14be9e checked before loading.
--   member_pcid: 33,016 'source' (every workbook PCID matched its entity), 791 'definition'
--   (brand rows resolved through "The brand drug form of X", by exact name, salt-stripped
--   ingredient set, or a hand-checked map), 210 'name' (word pieces such as "detemir"
--   linked to the one record they belong to, plus hand-checked synonyms such as
--   Cortisol → hydrocortisone, Apap → acetaminophen, Midozalam → midazolam).
--   37 drug-type rows left unlinked on purpose (words shared by many records:
--   lactobacillus, bismuth, botulinum, edetate …; FDA-name fragments such as
--   "Sulfate-Dexamethasone").
-- dictionary-import-2026-10-03-mint (Joshua approved, 2026-10-03)
--   60 moieties 1015621–1015680 and 120 combinations 2002471–2002590,
--   primary_source 'Pharmacy Commons dictionary import 2026-10-03 (Dictionary.xlsx)'.
--   Brand generics with no record (e.g. Excedrin → acetaminophen/aspirin/caffeine — only
--   when no existing record matched), plus 18 genuinely new substances (aldioxa, calamine,
--   pamabrom, pancreatin …). levoisomethadone has synonym_of_pcid → 1000416 (isomethadone).
--   34,017 of 53,928 rows end up linked to a record.
--   Seven in-batch duplicates merged before minting (e.g. the two Tdap descriptions).
--   pcid_blocks.next_pcid: block 1 → 1015681, block 2 → 2002591.
-- lists-joint-commission-do-not-use-2026-10-03
--   List PCID 10000038 'joint-commission-do-not-use' (kind authority, status_label 'Source'),
--   19 term items: the Joint Commission's official set (U, u, IU, Q.D./QD/q.d./qd,
--   Q.O.D./QOD/q.o.d./qod, trailing zero, lack of leading zero, MS, MSO4, MgSO4) plus
--   DOR, TAF, TDF marked 'ISMP addition' (Joshua's choice). Created with published = false;
--   publish after the frontend that understands term items is deployed:
--     update lists set published = true where slug = 'joint-commission-do-not-use';
--   block 10 next_pcid → 10000039.
