-- Phase 16b — publishing from the full-page editor (docs/page-editor.md §5–§7)
--
-- One Publish = one bundled page revision. The revision stores the parsed page
-- model (lead, sections with stable ids, section order, Quick Facts and brand
-- overrides, structured block lines), a community-only source text for diffs,
-- and what the text links to, pulls in and cites. Structured tables are kept in
-- step with the live revision by apply_page_revision(), so every row they hold
-- points back to the revision that wrote it.
--
-- Who calls what:
--   publish-page Edge Function (service_role) → publish_page()
--     It has already parsed the source with src/pageSource (the same code the
--     editor runs), merged it section by section, and resolved citations.
--     publish_page() re-checks everything about the person and the page.
--   accept_revision() / revert_page() (phase 15, redefined here) handle
--     format-2 revisions by calling apply_page_revision().
--
-- Additive except for the redefinition of accept_revision() and revert_page(),
-- whose format-1 behaviour is unchanged. Run after phase16a. Then
-- get_advisors(type: security): publish_page and apply_page_revision must NOT
-- be executable by anon or authenticated.
--
-- Apply as three migrations (constraint adds go on their own, per CLAUDE.md):
--   phase16b_1_tables       §1–§4  new tables, new columns, read access
--   phase16b_2_constraints  the two CHECK constraints below §4
--   phase16b_3_functions    §5–§9  functions and grants
-- Each part is wrapped in its own begin/commit so the file also runs top to
-- bottom in psql (db/phase15_test).

-- ═══ phase16b_1_tables ═══════════════════════════════════════════════════════
begin;

-- ── 1. Citations ──────────────────────────────────────────────────────────────
-- One row per source, reused by every page that cites it. Keys are the [@key]
-- text without brackets: pmid:26900641, doi:10.1210/jc.2015-3754,
-- dailymed:<set id>, url:https://…, or a short slug for curated references.
create table public.citation_sources (
  key          text primary key check (key ~ '^(pmid:\d{1,9}|doi:10\.\d{4,9}/\S+|dailymed:[0-9a-f-]{36}|url:https?://\S+|[a-z0-9][a-z0-9-]{1,80})$'),
  kind         text not null check (kind in ('pmid', 'doi', 'dailymed', 'url', 'ref')),
  title        text,
  authors      text,             -- "Aroda VR, Edelstein SL, Goldberg RB, et al."
  container    text,             -- journal, or "DailyMed" with the labeler
  year         integer,
  volume       text,
  issue        text,
  pages        text,
  doi          text,
  pmid         text,
  setid        text,
  url          text,
  resolved     boolean not null default false,
  retrieved_at timestamptz,
  created_at   timestamptz not null default now()
);
comment on table public.citation_sources is 'Sources cited with [@key] in page text and structured blocks (phase 16b). Metadata from PubMed, Crossref or DailyMed at first citation.';

create table public.page_citations (
  revision_id bigint not null references public.page_revisions (id) on delete cascade,
  ordinal     integer not null,             -- 1, 2, 3 … in page order: the number readers see
  ref_key     text not null references public.citation_sources (key),
  primary key (revision_id, ordinal),
  unique (revision_id, ref_key)
);
comment on table public.page_citations is 'The numbered reference list of each format-2 revision (phase 16b).';

-- ── 2. Bundled revisions ──────────────────────────────────────────────────────
alter table public.page_revisions
  add column format           smallint not null default 1 check (format in (1, 2)),
  add column model            jsonb,
  add column source_md        text,
  add column extracted        jsonb,
  add column changed_sections text[] not null default '{}';
comment on column public.page_revisions.format is '1 = phase-15 Overview (description + body_md); 2 = full-page editor (model).';
comment on column public.page_revisions.model is 'Parsed page model (src/pageSource/types.ts PageModel) for format 2.';
comment on column public.page_revisions.source_md is 'Community layer as page source, for history diffs (no ingested values).';
comment on column public.page_revisions.extracted is '{links:[{target}], properties:[{key,target}], citations:[{key,location}]} for format 2.';
comment on column public.page_revisions.changed_sections is 'Units this revision changed: lead, section ids, infobox:<key>, brands:<KEY>, order.';

alter table public.infobox_edits
  add column is_null_override boolean not null default false,
  add column revision_id bigint references public.page_revisions (id);
comment on column public.infobox_edits.is_null_override is 'true = [NONE]: the source is wrong and there is no value. value is null.';

alter table public.brand_edits add column revision_id bigint references public.page_revisions (id);

-- ── 3. Structured blocks with the threshold grammar (renal dosing) ───────────
create table public.threshold_rules (
  id          bigint generated always as identity primary key,
  pcid        bigint not null references public.entities (pcid),
  block_name  text not null references public.block_schemas (name),
  measure     text not null,
  comparator  text not null check (comparator in ('<', '<=', '>', '>=', 'range', 'any')),
  low         numeric,
  high        numeric,
  action      text not null check (length(trim(action)) between 1 and 1000),
  citations   text[] not null check (cardinality(citations) > 0),
  position    integer not null,
  revision_id bigint not null references public.page_revisions (id),
  is_current  boolean not null default true,
  created_at  timestamptz not null default now(),
  check ((comparator = 'any') = (low is null)),
  check ((comparator = 'range') = (high is not null)),
  check (comparator <> 'range' or low < high)
);
create index threshold_rules_current on public.threshold_rules (block_name, measure, pcid) where is_current;
comment on table public.threshold_rules is 'Lines of :::renal-dosing (and future threshold blocks), one row per range (phase 16b). Current rows = the live page.';

-- ── 4. Read access ────────────────────────────────────────────────────────────
alter table public.citation_sources enable row level security;
alter table public.page_citations   enable row level security;
alter table public.threshold_rules  enable row level security;
create policy public_read on public.citation_sources for select using (true);
create policy public_read on public.page_citations   for select using (true);
create policy public_read on public.threshold_rules  for select using (true);
grant select on public.citation_sources, public.page_citations, public.threshold_rules to anon, authenticated;

-- New revision and override columns are public, like the rest (author ids stay withheld).
grant select (format, model, source_md, extracted, changed_sections) on public.page_revisions to anon, authenticated;
grant select (is_null_override, revision_id) on public.infobox_edits to anon, authenticated;
grant select (revision_id) on public.brand_edits to anon, authenticated;

commit;

-- ═══ phase16b_2_constraints ══════════════════════════════════════════════════
begin;

-- Every full-page revision carries its model, community source and extracted refs.
alter table public.page_revisions
  add constraint page_revisions_format2_model check (format = 1 or (model is not null and source_md is not null and extracted is not null));
-- [NONE] is a null value with the flag set; a flagged row never has a value.
alter table public.infobox_edits
  add constraint infobox_edits_null_override check (not is_null_override or value is null);

commit;

-- ═══ phase16b_3_functions ════════════════════════════════════════════════════
begin;

-- ── 5. Helpers that take the person explicitly (the Edge Function runs as service_role) ──
create or replace function public.pc_is_verified(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from provider_verifications where user_id = p_user and status = 'active')
     and not exists (select 1 from contributor_blocks
                     where user_id = p_user and (expires_at is null or expires_at > now()))
$$;

create or replace function public.pc_has_role(p_user uuid, p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = p_user and (role = p_role or role = 'admin'))
$$;

create or replace function public.pc_cite_text(p_citations jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg('[@' || (c ->> 'key') || ']', '' order by o), '')
  from jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) with ordinality as x(c, o)
$$;

-- ── 6. Apply a revision's structured data and links ──────────────────────────
-- Makes the live tables match revision p_rev: page_content, links and value
-- references, Quick Facts overrides, brand changes and threshold rules. Only
-- keys that actually differ get a new row, so per-row history stays readable.
create or replace function public.apply_page_revision(p_rev bigint, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r          page_revisions%rowtype;
  v_patrol   text;
  v_by       uuid;
  v_at       timestamptz;
  l          jsonb;
  v_key      text;
  v_desired  jsonb;
  v_cur      record;
  v_block    record;
  v_lines    jsonb;
  v_current  jsonb;
begin
  select * into r from page_revisions where id = p_rev;
  if not found or r.format <> 2 then raise exception 'not_a_page_model_revision'; end if;

  -- Rows written here inherit the revision's review state.
  v_patrol := case when r.patrol_status = 'patrolled' then 'patrolled' else 'unpatrolled' end;
  v_by := case when v_patrol = 'patrolled' then coalesce(r.patrolled_by, p_actor) end;
  v_at := case when v_patrol = 'patrolled' then coalesce(r.patrolled_at, now()) end;

  insert into page_content (pcid) values (r.pcid) on conflict (pcid) do nothing;
  update page_content
  set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
  where pcid = r.pcid;

  -- Links and value references, from what the parser extracted.
  delete from page_links where source_pcid = r.pcid;
  insert into page_links (source_pcid, target_text, target_pcid)
  select r.pcid, t, resolve_page_target(t)
  from (select distinct lower(trim(e ->> 'target')) as t from jsonb_array_elements(r.extracted -> 'links') e) x
  where t <> '';

  delete from page_property_refs where source_pcid = r.pcid;
  insert into page_property_refs (source_pcid, property_key, target_text, target_pcid)
  select r.pcid, k, tt, case when tt = '' then r.pcid else resolve_page_target(tt) end
  from (select distinct lower(e ->> 'key') as k, lower(trim(coalesce(e ->> 'target', ''))) as tt
        from jsonb_array_elements(r.extracted -> 'properties') e) x
  where exists (select 1 from infobox_properties p where p.key = x.k);

  -- Quick Facts: desired overrides vs current community rows, key by key.
  for v_key in
    select key from infobox_properties
  loop
    select e into v_desired
    from jsonb_array_elements(coalesce(r.model -> 'infobox' -> 'lines', '[]'::jsonb)) e
    where e ->> 'key' = v_key;
    select * into v_cur from infobox_edits
    where pcid = r.pcid and property_key = v_key and is_current
    order by id desc limit 1;

    if v_desired is null then
      -- No override in the page: clear an existing one.
      if v_cur.id is not null and (v_cur.value is not null or v_cur.is_null_override) then
        update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
        insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                                   patrol_status, patrolled_by, patrolled_at, revision_id)
        values (r.pcid, v_key, null, 'removed in page revision ' || r.id, r.summary, true, r.created_by,
                v_patrol, v_by, v_at, r.id);
      end if;
    elsif v_cur.id is null
       or v_cur.value is distinct from nullif(v_desired ->> 'value', '')
       or v_cur.is_null_override is distinct from (v_desired ->> 'isNull')::boolean
       or v_cur.citation is distinct from pc_cite_text(v_desired -> 'citations') then
      update infobox_edits set is_current = false where pcid = r.pcid and property_key = v_key and is_current;
      insert into infobox_edits (pcid, property_key, value, is_null_override, citation, summary, is_current,
                                 created_by, patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_key, nullif(v_desired ->> 'value', ''), (v_desired ->> 'isNull')::boolean,
              pc_cite_text(v_desired -> 'citations'), r.summary, true, r.created_by,
              v_patrol, v_by, v_at, r.id);
    end if;
    v_desired := null;
  end loop;

  -- Brands: add / hide lines vs current brand_edits, brand by brand.
  for v_cur in
    select coalesce(d.k, c.brand_key) as brand_key, d.line, c.id as cur_id, c.action as cur_action,
           c.citation as cur_citation, c.summary as cur_summary
    from (
      select pc_brand_key(e ->> 'brand') as k, e as line
      from jsonb_array_elements(coalesce(r.model -> 'brands' -> 'lines', '[]'::jsonb)) e
      where e ->> 'action' in ('add', 'hide')
    ) d
    full join (
      select * from brand_edits where pcid = r.pcid and is_current and action in ('add', 'hide')
    ) c on c.brand_key = d.k
  loop
    if v_cur.line is null then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      select r.pcid, v_cur.brand_key, b.brand_display, 'clear', 'removed in page revision ' || r.id, r.summary, true,
             r.created_by, v_patrol, v_by, v_at, r.id
      from brand_edits b where b.id = v_cur.cur_id;
    elsif v_cur.cur_id is null
       or v_cur.cur_action <> (v_cur.line ->> 'action')
       or v_cur.cur_citation <> pc_cite_text(v_cur.line -> 'citations')
       or (v_cur.line ->> 'action' = 'hide' and v_cur.cur_summary is distinct from (v_cur.line ->> 'reason')) then
      update brand_edits set is_current = false where pcid = r.pcid and brand_key = v_cur.brand_key and is_current;
      insert into brand_edits (pcid, brand_key, brand_display, action, citation, summary, is_current, created_by,
                               patrol_status, patrolled_by, patrolled_at, revision_id)
      values (r.pcid, v_cur.brand_key, trim(regexp_replace(v_cur.line ->> 'brand', '\s+', ' ', 'g')),
              v_cur.line ->> 'action', pc_cite_text(v_cur.line -> 'citations'),
              -- hide: the reason readers see is the summary of the row (as edit_brand stores it)
              case when v_cur.line ->> 'action' = 'hide' then coalesce(nullif(v_cur.line ->> 'reason', ''), r.summary) else r.summary end,
              true, r.created_by, v_patrol, v_by, v_at, r.id);
    end if;
  end loop;

  -- Threshold blocks: each block is replaced as a whole when its lines change.
  for v_block in
    select b.name from block_schemas b where b.grammar = 'threshold'
  loop
    select coalesce(jsonb_agg(line order by sec_ord, part_ord, line_ord), '[]'::jsonb) into v_lines
    from jsonb_array_elements(r.model -> 'main') with ordinality as s(item, sec_ord),
         jsonb_array_elements(coalesce(s.item -> 'parts', '[]'::jsonb)) with ordinality as p(part, part_ord),
         jsonb_array_elements(coalesce(p.part -> 'block' -> 'lines', '[]'::jsonb)) with ordinality as l(line, line_ord)
    where s.item ->> 'kind' = 'section' and p.part ->> 'kind' = 'block' and p.part -> 'block' ->> 'name' = v_block.name;

    select coalesce(jsonb_agg(jsonb_build_object(
             'measure', measure, 'comparator', comparator, 'low', low, 'high', high, 'action', action,
             'citations', to_jsonb(citations)) order by position), '[]'::jsonb)
    into v_current
    from threshold_rules where pcid = r.pcid and block_name = v_block.name and is_current;

    if v_current is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
                  'measure', x ->> 'measure', 'comparator', x ->> 'comparator',
                  'low', (x ->> 'low')::numeric, 'high', (x ->> 'high')::numeric, 'action', x ->> 'action',
                  'citations', (select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) from jsonb_array_elements(x -> 'citations') c))
                  order by o), '[]'::jsonb)
         from jsonb_array_elements(v_lines) with ordinality as t(x, o)) then
      update threshold_rules set is_current = false where pcid = r.pcid and block_name = v_block.name and is_current;
      insert into threshold_rules (pcid, block_name, measure, comparator, low, high, action, citations, position, revision_id)
      select r.pcid, v_block.name, x ->> 'measure', x ->> 'comparator', (x ->> 'low')::numeric, (x ->> 'high')::numeric,
             x ->> 'action', array(select c ->> 'key' from jsonb_array_elements(x -> 'citations') c), o::integer, r.id
      from jsonb_array_elements(v_lines) with ordinality as t(x, o);
    end if;
  end loop;
end $$;

-- ── 7. Publish ────────────────────────────────────────────────────────────────
-- p_payload (built by publish-page from the parsed, merged model):
--   summary, kind ('edit' | 'create' | 'revert'), model, source_md, description, body_md,
--   extracted, changed_sections, citations: [{key, kind, title, authors, container, year,
--   volume, issue, pages, doi, pmid, setid, url, resolved}] in reference-list order.
create or replace function public.publish_page(
  p_user uuid,
  p_pcid bigint,
  p_current_revision_id bigint,   -- the live revision publish-page merged against
  p_parent_revision_id bigint,    -- the revision the contributor started from (for history)
  p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cur       page_content%rowtype;
  v_patroller boolean := pc_has_role(p_user, 'patroller');
  v_held      boolean := false;
  v_rev       bigint;
  v_old_len   integer := 0;
  v_len       integer;
  v_summary   text := trim(coalesce(p_payload ->> 'summary', ''));
  v_kind      text := coalesce(p_payload ->> 'kind', 'edit');
  c           jsonb;
  n           integer := 0;
begin
  if p_user is null or not pc_is_verified(p_user) then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = p_user) then raise exception 'handle_required'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if v_summary = '' then raise exception 'summary_required'; end if;
  if length(v_summary) > 500 then raise exception 'summary_too_long'; end if;
  if v_kind not in ('edit', 'create', 'revert') then raise exception 'bad_kind'; end if;
  if p_payload -> 'model' is null or p_payload ->> 'source_md' is null then raise exception 'bad_payload'; end if;
  v_len := length(p_payload ->> 'source_md');
  if v_len > 200000 then raise exception 'too_long'; end if;
  if not v_patroller and (select count(*) from page_revisions
       where created_by = p_user and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;

  select * into v_cur from page_content where pcid = p_pcid for update;
  if found then
    if v_cur.protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
    v_held := v_cur.protection = 'reviewed' and not v_patroller;
    if v_cur.current_revision_id is distinct from p_current_revision_id then
      -- Someone published between publish-page's merge and now; it merges again.
      raise exception 'edit_conflict' using detail = coalesce(v_cur.current_revision_id::text, '');
    end if;
    v_old_len := coalesce((select length(coalesce(source_md, description || body_md)) from page_revisions
                           where id = v_cur.current_revision_id), 0);
  else
    if p_current_revision_id is not null then raise exception 'edit_conflict'; end if;
    insert into page_content (pcid) values (p_pcid);
  end if;

  -- Sources: insert new ones; fill in metadata for ones that weren't resolved before.
  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'citations', '[]'::jsonb))
  loop
    insert into citation_sources (key, kind, title, authors, container, year, volume, issue, pages, doi, pmid, setid, url,
                                  resolved, retrieved_at)
    values (c ->> 'key', c ->> 'kind', c ->> 'title', c ->> 'authors', c ->> 'container', (c ->> 'year')::integer,
            c ->> 'volume', c ->> 'issue', c ->> 'pages', c ->> 'doi', c ->> 'pmid', c ->> 'setid', c ->> 'url',
            coalesce((c ->> 'resolved')::boolean, false), case when (c ->> 'resolved')::boolean then now() end)
    on conflict (key) do update
      set title = excluded.title, authors = excluded.authors, container = excluded.container, year = excluded.year,
          volume = excluded.volume, issue = excluded.issue, pages = excluded.pages, doi = excluded.doi,
          pmid = excluded.pmid, setid = excluded.setid, url = excluded.url, resolved = true, retrieved_at = now()
      where not citation_sources.resolved and excluded.resolved;
  end loop;

  insert into page_revisions (pcid, parent_id, description, body_md, summary, size_delta, kind, created_by,
                              patrol_status, patrolled_by, patrolled_at,
                              format, model, source_md, extracted, changed_sections)
  values (p_pcid, coalesce(p_current_revision_id, p_parent_revision_id),
          coalesce(p_payload ->> 'description', ''), coalesce(p_payload ->> 'body_md', ''),
          v_summary, v_len - v_old_len,
          case when p_current_revision_id is null and v_kind = 'edit' then 'create' else v_kind end,
          p_user,
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then p_user end,
          case when v_patroller then now() end,
          2, p_payload -> 'model', p_payload ->> 'source_md', coalesce(p_payload -> 'extracted', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p_payload -> 'changed_sections')), '{}'))
  returning id into v_rev;

  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'citations', '[]'::jsonb))
  loop
    n := n + 1;
    insert into page_citations (revision_id, ordinal, ref_key) values (v_rev, n, c ->> 'key');
  end loop;

  if not v_held then
    perform apply_page_revision(v_rev, p_user);
  end if;
  return jsonb_build_object('revision_id', v_rev, 'status', case when v_held then 'pending' else 'live' end);
end $$;

-- ── 8. Accept and revert understand format-2 revisions ────────────────────────
create or replace function public.accept_revision(p_revision_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into r from page_revisions where id = p_revision_id and patrol_status = 'pending' for update;
  if not found then raise exception 'not_pending'; end if;
  if r.created_by = auth.uid() then raise exception 'cannot_review_own'; end if;
  select current_revision_id into v_cur from page_content where pcid = r.pcid for update;
  -- A format-2 edit that is no longer based on the live page is rebased by
  -- publish-page (action 'accept'), which merges it section by section first.
  if v_cur is distinct from r.parent_id then raise exception 'stale_revision' using detail = coalesce(v_cur::text, ''); end if;

  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
  where id = r.id;
  if r.format = 2 then
    perform apply_page_revision(r.id, auth.uid());
  else
    update page_content
    set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
    where pcid = r.pcid;
    perform refresh_page_links(r.pcid);
  end if;
end $$;

-- Rebase a held format-2 edit onto the live page, then accept it. publish-page
-- (service_role) calls this after merging; p_payload has the merged model etc.
create or replace function public.accept_rebased_revision(p_reviewer uuid, p_revision_id bigint,
                                                          p_current_revision_id bigint, p_payload jsonb,
                                                          p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
begin
  if not pc_has_role(p_reviewer, 'patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into r from page_revisions where id = p_revision_id and patrol_status = 'pending' and format = 2 for update;
  if not found then raise exception 'not_pending'; end if;
  if r.created_by = p_reviewer then raise exception 'cannot_review_own'; end if;
  select current_revision_id into v_cur from page_content where pcid = r.pcid for update;
  if v_cur is distinct from p_current_revision_id then raise exception 'edit_conflict'; end if;

  update page_revisions
  set parent_id = v_cur, model = p_payload -> 'model', source_md = p_payload ->> 'source_md',
      extracted = p_payload -> 'extracted', description = coalesce(p_payload ->> 'description', ''),
      body_md = coalesce(p_payload ->> 'body_md', ''),
      changed_sections = coalesce(array(select jsonb_array_elements_text(p_payload -> 'changed_sections')), '{}'),
      patrol_status = 'patrolled', patrolled_by = p_reviewer, patrolled_at = now(), review_note = p_note
  where id = r.id;
  perform apply_page_revision(r.id, p_reviewer);
end $$;

create or replace function public.revert_page(p_pcid bigint, p_to_revision_id bigint, p_summary text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  r page_revisions%rowtype;
  v_cur bigint;
  v_new bigint;
begin
  select * into r from page_revisions
  where id = p_to_revision_id and pcid = p_pcid and patrol_status not in ('pending', 'rejected');
  if not found then raise exception 'no_such_revision'; end if;
  select current_revision_id into v_cur from page_content where pcid = p_pcid;

  if r.format = 2 then
    if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
    v_new := (publish_page(auth.uid(), p_pcid, v_cur, v_cur, jsonb_build_object(
      'summary', coalesce(nullif(trim(p_summary), ''), 'Revert to revision ' || r.id),
      'kind', 'revert', 'model', r.model, 'source_md', r.source_md, 'extracted', r.extracted,
      'description', r.description, 'body_md', r.body_md,
      'changed_sections', to_jsonb(array['revert']),
      'citations', (select coalesce(jsonb_agg(jsonb_build_object('key', pc.ref_key, 'kind', s.kind) order by pc.ordinal), '[]'::jsonb)
                    from page_citations pc join citation_sources s on s.key = pc.ref_key where pc.revision_id = r.id)
    )) ->> 'revision_id')::bigint;
  else
    v_new := save_page(p_pcid, v_cur, r.description, r.body_md,
                       coalesce(nullif(trim(p_summary), ''), 'Revert to revision ' || r.id), 'revert');
  end if;

  if (select current_revision_id from page_content where pcid = p_pcid) = v_new then
    update page_revisions set patrol_status = 'reverted'
    where pcid = p_pcid and id > p_to_revision_id and id < v_new
      and patrol_status in ('unpatrolled', 'patrolled');
  end if;
  return v_new;
end $$;

-- ── 9. Who may run what ───────────────────────────────────────────────────────
revoke execute on function public.publish_page(uuid, bigint, bigint, bigint, jsonb),
                           public.apply_page_revision(bigint, uuid),
                           public.accept_rebased_revision(uuid, bigint, bigint, jsonb, text),
                           public.pc_is_verified(uuid), public.pc_has_role(uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_page(uuid, bigint, bigint, bigint, jsonb),
                          public.accept_rebased_revision(uuid, bigint, bigint, jsonb, text)
  to service_role;
grant execute on function public.pc_cite_text(jsonb) to anon, authenticated;
-- accept_revision and revert_page keep their phase-15 grants (authenticated).

commit;
