-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 15 — Community editing (open page text, infobox edits, new pages,
--            wiki links, property transclusion, patrol)
-- Destination: db/phase15_community_editing.sql
-- Status: DRAFT — not applied. Spec: docs/user-edits.md
--
-- Model: publish-then-patrol. A verified contributor's save is live at once;
-- patrollers mark revisions patrolled afterwards, and anyone verified can
-- revert. Exception: pages with protection = 'reviewed' (high-alert / NTI
-- drugs, seeded in phase15e) hold non-patroller saves as 'pending' until a
-- patroller accepts them; 'patrollers' locks a page to patrollers only. Every write goes through a SECURITY DEFINER RPC below — no table
-- here has an INSERT/UPDATE/DELETE policy for anon or authenticated.
--
-- Apply as separate migrations (project convention):
--   phase15a_roles_profiles  → sections 1–2
--   phase15b_pages           → sections 3–5
--   phase15c_infobox         → section 6
--   phase15d_rpcs            → sections 7–8
--   phase15e_seed            → section 9 (Joshua = admin, protected pages)
-- Also: redeploy verify-npi so it stores the NPI Registry credential.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Roles, blocks, contributor gate ─────────────────────────────────────
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('patroller', 'admin')),
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;
create policy read_own on public.user_roles for select using (auth.uid() = user_id);

create table public.contributor_blocks (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  reason     text not null,
  blocked_by uuid references auth.users (id),
  blocked_at timestamptz not null default now(),
  expires_at timestamptz            -- null = indefinite
);
alter table public.contributor_blocks enable row level security;
create policy read_own on public.contributor_blocks for select using (auth.uid() = user_id);

create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and (role = p_role or role = 'admin')
  )
$$;

create or replace function public.is_verified_contributor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from provider_verifications
           where user_id = auth.uid() and status = 'active')
     and not exists (
           select 1 from contributor_blocks
           where user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;

-- ── 2. Public handle (attribution in history) ──────────────────────────────
-- History shows "@handle · credential badge" (badge optional per contributor);
-- never the auth uuid, NPI number or NPI-verified legal name (spec §9).
create table public.contributor_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  handle     text not null unique check (handle ~ '^[A-Za-z0-9_.-]{3,30}$'),
  created_at timestamptz not null default now()
);
alter table public.contributor_profiles enable row level security;
create policy read_own on public.contributor_profiles for select using (auth.uid() = user_id);

-- Badge shown next to the handle ("@handle · PharmD"). The credential is the
-- NPI Registry's basic.credential (self-reported to NPPES); verify-npi stores
-- it from this phase on. Taxonomy ("Pharmacist") is the fallback.
alter table public.contributor_profiles add column display_credential boolean not null default true;
alter table public.provider_verifications add column if not exists credential text;

create or replace function public.pc_credential_badge(p_credential text, p_taxonomy text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    case upper(regexp_replace(split_part(regexp_replace(coalesce(p_credential, ''), '[;/]', ',', 'g'), ',', 1), '[^A-Za-z]', '', 'g'))
      when 'PHARMD' then 'PharmD'  when 'RPH' then 'RPh'      when 'BSPHARM' then 'RPh'
      when 'MD' then 'MD'          when 'DO' then 'DO'        when 'MBBS' then 'MBBS'
      when 'NP' then 'NP'          when 'FNP' then 'NP'       when 'APRN' then 'APRN'
      when 'CRNP' then 'NP'        when 'FNPC' then 'NP'      when 'DNP' then 'DNP'
      when 'PA' then 'PA'          when 'PAC' then 'PA'       when 'RN' then 'RN'
      when 'DDS' then 'DDS'        when 'DMD' then 'DMD'      when 'DPM' then 'DPM'
      when 'OD' then 'OD'          when 'CPHT' then 'CPhT'    when 'PHD' then 'PhD'
      else null
    end,
    nullif(trim(p_taxonomy), ''))
$$;

-- ── 3. Open page text: current content + full revision history ─────────────
create table public.page_revisions (
  id           bigint generated always as identity primary key,
  pcid         bigint not null references public.entities (pcid),
  parent_id    bigint references public.page_revisions (id),
  description  text not null default '',
  body_md      text not null default '',
  summary      text not null check (length(trim(summary)) between 1 and 500),
  size_delta   integer not null,
  kind         text not null default 'edit' check (kind in ('create', 'edit', 'revert', 'seed')),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  -- unpatrolled/patrolled/reverted: live edits. pending → accepted (patrolled)
  -- or rejected: edits held on 'reviewed' pages.
  patrol_status text not null default 'unpatrolled'
               check (patrol_status in ('unpatrolled', 'patrolled', 'reverted', 'pending', 'rejected')),
  patrolled_by uuid references auth.users (id),
  patrolled_at timestamptz,
  review_note  text
);
create index page_revisions_pcid_idx on public.page_revisions (pcid, id desc);
create index page_revisions_queue_idx on public.page_revisions (created_at desc)
  where patrol_status in ('unpatrolled', 'pending');
create index page_revisions_author_idx on public.page_revisions (created_by, created_at desc);

create table public.page_content (
  pcid                bigint primary key references public.entities (pcid),
  description         text not null default '',   -- lead / one-line description
  body_md             text not null default '',   -- open markdown body
  current_revision_id bigint references public.page_revisions (id),
  protection          text not null default 'open' check (protection in ('open', 'reviewed', 'patrollers')),
  updated_at          timestamptz not null default now()
);

comment on table public.page_content is
  'Community-editable text for any PCID page: description (lead) and markdown body. '
  'Written only by save_page()/revert_page(). Licensed CC BY-SA 4.0 (spec §8).';

-- ── 4. Wiki links and property references, rebuilt on every save ───────────
create table public.page_links (
  source_pcid bigint not null references public.entities (pcid) on delete cascade,
  target_text text not null,                       -- as written, lowercased
  target_pcid bigint references public.entities (pcid),  -- null = red link
  primary key (source_pcid, target_text)
);
create index page_links_target_idx on public.page_links (target_pcid);

create table public.page_property_refs (
  source_pcid  bigint not null references public.entities (pcid) on delete cascade,
  property_key text not null,
  target_text  text not null default '',           -- '' = this page
  target_pcid  bigint references public.entities (pcid),
  primary key (source_pcid, property_key, target_text)
);

-- ── 5. Community-created pages; retirement with redirect ───────────────────
create table public.community_pages (
  pcid          bigint primary key references public.entities (pcid),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  patrol_status text not null default 'unpatrolled'
                check (patrol_status in ('unpatrolled', 'patrolled', 'merged')),
  patrolled_by  uuid references auth.users (id),
  patrolled_at  timestamptz
);

-- Duplicates are never deleted: the PCID is retired and points at the keeper.
alter table public.pcid_retired add column if not exists replaced_by_pcid bigint
  references public.entities (pcid);

-- ── 6. Infobox: property registry + community values ───────────────────────
create table public.infobox_properties (
  key           text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label         text not null,
  entity_types  text[] not null,
  source_kind   text not null check (source_kind in ('label', 'list', 'attribute', 'class', 'community')),
  source_ref    text,          -- list: '<slug>#<field>'; attribute: comma list of columns
  sort_order    integer not null,
  transcludable boolean not null default true
);

insert into public.infobox_properties (key, label, entity_types, source_kind, source_ref, sort_order) values
  ('indications',       'Indications',               '{moiety,precise_form,combination,formulation}', 'label',     'indications_and_usage',     10),
  ('dosing',            'Dosing',                    '{moiety,precise_form,combination,formulation}', 'label',     'dosage_and_administration', 20),
  ('contraindications', 'Contraindications',         '{moiety,precise_form,combination,formulation}', 'label',     'contraindications',         30),
  ('boxed_warning',     'Boxed warning',             '{moiety,precise_form,combination,formulation}', 'label',     'boxed_warning',             40),
  ('epc_class',         'Pharmacologic class (FDA)', '{moiety,precise_form,combination,formulation}', 'class',     'epc',                       50),
  ('legal_status',      'Legal status',              '{moiety,precise_form,combination,formulation}', 'attribute', 'rx_status,legal_status,fda_marketing_status', 60),
  ('most_used',         'Most used',                 '{moiety,precise_form,combination,formulation}', 'list',      'most-used-drugs-us#rank',   70),
  ('do_not_crush',      'Do not crush',              '{moiety,precise_form,combination,formulation}', 'list',      'do-not-crush#legal_status', 80),
  ('acb_score',         'ACB score',                 '{moiety,precise_form,combination,formulation}', 'list',      'anticholinergic-burden#value', 90),
  ('qtc_risk',          'QTc risk',                  '{moiety,precise_form,combination,formulation}', 'list',      'arrhythmia-risk#legal_status', 100);

create table public.infobox_edits (
  id            bigint generated always as identity primary key,
  pcid          bigint not null references public.entities (pcid),
  property_key  text not null references public.infobox_properties (key),
  value         text,          -- null = clear the community value, show the source value again
  citation      text not null check (length(trim(citation)) > 0),
  summary       text not null check (length(trim(summary)) between 1 and 500),
  is_current    boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  patrol_status text not null default 'unpatrolled'
                check (patrol_status in ('unpatrolled', 'patrolled', 'reverted', 'pending', 'rejected')),
  patrolled_by  uuid references auth.users (id),
  patrolled_at  timestamptz,
  review_note   text
);
create unique index infobox_edits_current_idx on public.infobox_edits (pcid, property_key) where is_current;

-- ── Read access ────────────────────────────────────────────────────────────
-- Public tables are readable; author uuids are withheld by column grants and
-- exposed only as handles through page_history().
alter table public.page_content       enable row level security;
alter table public.page_revisions     enable row level security;
alter table public.page_links         enable row level security;
alter table public.page_property_refs enable row level security;
alter table public.community_pages    enable row level security;
alter table public.infobox_properties enable row level security;
alter table public.infobox_edits      enable row level security;

create policy public_read on public.page_content       for select using (true);
create policy public_read on public.page_revisions     for select using (true);
create policy public_read on public.page_links         for select using (true);
create policy public_read on public.page_property_refs for select using (true);
create policy public_read on public.community_pages    for select using (true);
create policy public_read on public.infobox_properties for select using (true);
create policy public_read on public.infobox_edits      for select using (true);

grant select on public.page_content, public.page_links, public.page_property_refs,
                public.infobox_properties to anon, authenticated;
revoke select on public.page_revisions, public.infobox_edits, public.community_pages from anon, authenticated;
grant select (id, pcid, parent_id, description, body_md, summary, size_delta, kind,
              created_at, patrol_status, patrolled_at, review_note)
  on public.page_revisions to anon, authenticated;
grant select (id, pcid, property_key, value, citation, summary, is_current,
              created_at, patrol_status, patrolled_at, review_note)
  on public.infobox_edits to anon, authenticated;
grant select (pcid, created_at, patrol_status, patrolled_at)
  on public.community_pages to anon, authenticated;

-- ── 7. Helpers ─────────────────────────────────────────────────────────────
create or replace function public.pc_slugify(p text)
returns text language sql immutable set search_path = public as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Resolve a link/reference target: PCID-n, exact slug, slugified text, then a
-- unique case-insensitive name. Returns null when unresolved or ambiguous.
create or replace function public.resolve_page_target(p_text text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  t text := lower(trim(p_text));
  v bigint;
begin
  if t ~ '^pcid-[0-9]+$' then
    select pcid into v from entities where pcid = substring(t from 6)::bigint;
    return v;
  end if;
  select pcid into v from entities where slug = t;
  if found then return v; end if;
  select pcid into v from entities where slug = pc_slugify(t);
  if found then return v; end if;
  select min(pcid) into v from entities where lower(name) = t having count(*) = 1;
  return v;
end $$;

create or replace function public.refresh_page_links(p_pcid bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_text text;
begin
  select description || E'\n' || body_md into v_text from page_content where pcid = p_pcid;

  delete from page_links where source_pcid = p_pcid;
  insert into page_links (source_pcid, target_text, target_pcid)
  select p_pcid, t, resolve_page_target(t)
  from (
    select distinct lower(trim(split_part(m[1], '|', 1))) as t
    from regexp_matches(coalesce(v_text, ''), '\[\[([^\[\]\n]{1,200})\]\]', 'g') as m
  ) x
  where t <> '';

  delete from page_property_refs where source_pcid = p_pcid;
  insert into page_property_refs (source_pcid, property_key, target_text, target_pcid)
  select p_pcid, k, tt, case when tt = '' then p_pcid else resolve_page_target(tt) end
  from (
    select distinct lower(m[1]) as k, lower(trim(coalesce(m[2], ''))) as tt
    from regexp_matches(coalesce(v_text, ''), '\{\{([A-Za-z][A-Za-z0-9_]*)(?::([^{}\n]{1,200}))?\}\}', 'g') as m
  ) x
  where exists (select 1 from infobox_properties p where p.key = x.k);
end $$;

-- Value for one property on one page: community value first, else source.
-- 'label' and 'class' sources are computed by the client from the label text
-- and class data it already loads; this returns resolve = 'client' for those.
create or replace function public.resolve_property(p_key text, p_pcid bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p infobox_properties%rowtype;
  e infobox_edits%rowtype;
  v_slug text; v_field text; v_val text; v_row jsonb; c text; v_parts text[] := '{}';
begin
  select * into p from infobox_properties where key = lower(p_key);
  if not found then return jsonb_build_object('error', 'unknown_property'); end if;

  select * into e from infobox_edits
  where pcid = p_pcid and property_key = p.key and is_current and value is not null;
  if found then
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', e.value,
      'origin', 'community', 'citation', e.citation, 'patrol_status', e.patrol_status);
  end if;

  if p.source_kind = 'list' then
    v_slug := split_part(p.source_ref, '#', 1);
    v_field := split_part(p.source_ref, '#', 2);
    select case v_field
             when 'value' then li.value::text
             when 'rank' then li.rank::text
             when 'legal_status' then li.legal_status
             when 'note' then li.note
           end
      into v_val
    from list_items li join lists l on l.pcid = li.list_pcid
    where l.slug = v_slug and li.member_pcid = p_pcid
    limit 1;
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', v_val,
      'origin', 'list', 'list_slug', v_slug);
  elsif p.source_kind = 'attribute' then
    select to_jsonb(x) into v_row from (
      select * from moieties where pcid = p_pcid
    ) x;
    if v_row is null then select to_jsonb(x) into v_row from (select * from precise_forms where pcid = p_pcid) x; end if;
    if v_row is null then select to_jsonb(x) into v_row from (select * from combinations  where pcid = p_pcid) x; end if;
    if v_row is null then select to_jsonb(x) into v_row from (select * from formulations  where pcid = p_pcid) x; end if;
    foreach c in array string_to_array(p.source_ref, ',') loop
      if v_row ->> trim(c) is not null and not (v_row ->> trim(c) = any (v_parts)) then
        v_parts := v_parts || (v_row ->> trim(c));
      end if;
    end loop;
    return jsonb_build_object('key', p.key, 'label', p.label,
      'value', nullif(array_to_string(v_parts, '; '), ''), 'origin', 'attribute');
  else
    return jsonb_build_object('key', p.key, 'label', p.label, 'value', null,
      'origin', p.source_kind, 'resolve', 'client', 'source_ref', p.source_ref);
  end if;
end $$;

-- ── 8. Write RPCs ──────────────────────────────────────────────────────────
create or replace function public.set_contributor_handle(p_handle text, p_display_credential boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  insert into contributor_profiles (user_id, handle, display_credential)
  values (auth.uid(), p_handle, coalesce(p_display_credential, true))
  on conflict (user_id) do update
    set handle = excluded.handle, display_credential = excluded.display_credential;
end $$;

-- Live on open pages; held as 'pending' on 'reviewed' pages unless the editor
-- is a patroller. Returns the new revision id either way.
create or replace function public.save_page(
  p_pcid bigint,
  p_base_revision_id bigint,     -- revision the editor started from; null for a page with no text yet
  p_description text,
  p_body_md text,
  p_summary text,
  p_kind text default 'edit'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_cur page_content%rowtype;
  v_rev bigint;
  v_old_len integer := 0;
  v_patroller boolean := has_role('patroller');
  v_held boolean := false;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then
    raise exception 'handle_required';
  end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if length(coalesce(p_description, '')) > 2000 or length(coalesce(p_body_md, '')) > 200000 then
    raise exception 'too_long';
  end if;
  if not v_patroller and (select count(*) from page_revisions
       where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;

  select * into v_cur from page_content where pcid = p_pcid for update;
  if found then
    if v_cur.protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
    v_held := v_cur.protection = 'reviewed' and not v_patroller;
    if v_cur.current_revision_id is distinct from p_base_revision_id then
      raise exception 'edit_conflict' using detail = coalesce(v_cur.current_revision_id::text, '');
    end if;
    v_old_len := length(v_cur.description) + length(v_cur.body_md);
  else
    if p_base_revision_id is not null then raise exception 'edit_conflict'; end if;
    insert into page_content (pcid) values (p_pcid);
  end if;

  insert into page_revisions (pcid, parent_id, description, body_md, summary, size_delta, kind,
                              created_by, patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, p_base_revision_id, coalesce(p_description, ''), coalesce(p_body_md, ''), trim(p_summary),
          length(coalesce(p_description, '')) + length(coalesce(p_body_md, '')) - v_old_len,
          case when p_base_revision_id is null and p_kind = 'edit' then 'create' else p_kind end,
          auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_rev;

  if not v_held then
    update page_content
    set description = coalesce(p_description, ''), body_md = coalesce(p_body_md, ''),
        current_revision_id = v_rev, updated_at = now()
    where pcid = p_pcid;
    perform refresh_page_links(p_pcid);
  end if;
  return v_rev;
end $$;

-- Accept a held revision. It must still be based on the live revision;
-- otherwise it is stale (someone else's change was accepted first).
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
  if v_cur is distinct from r.parent_id then raise exception 'stale_revision' using detail = coalesce(v_cur::text, ''); end if;

  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
  where id = r.id;
  update page_content
  set description = r.description, body_md = r.body_md, current_revision_id = r.id, updated_at = now()
  where pcid = r.pcid;
  perform refresh_page_links(r.pcid);
end $$;

create or replace function public.reject_revision(p_revision_id bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
  update page_revisions
  set patrol_status = 'rejected', patrolled_by = auth.uid(), patrolled_at = now(), review_note = trim(p_note)
  where id = p_revision_id and patrol_status = 'pending';
  if not found then raise exception 'not_pending'; end if;
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

  v_new := save_page(p_pcid, v_cur, r.description, r.body_md,
                     coalesce(nullif(trim(p_summary), ''), 'Revert to revision ' || r.id), 'revert');

  -- On a 'reviewed' page a non-patroller's revert is itself held; only mark
  -- the undone revisions once the revert is live.
  if (select current_revision_id from page_content where pcid = p_pcid) = v_new then
    update page_revisions set patrol_status = 'reverted'
    where pcid = p_pcid and id > p_to_revision_id and id < v_new
      and patrol_status in ('unpatrolled', 'patrolled');
  end if;
  return v_new;
end $$;

create or replace function public.patrol_revision(p_revision_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  update page_revisions
  set patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now()
  where id = p_revision_id and patrol_status = 'unpatrolled' and created_by is distinct from auth.uid();
  if not found then raise exception 'cannot_patrol'; end if;
end $$;

create or replace function public.edit_infobox(
  p_pcid bigint, p_key text, p_value text, p_citation text, p_summary text
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_patroller boolean := has_role('patroller');
  v_protection text;
  v_held boolean;
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if not exists (select 1 from infobox_properties where key = lower(p_key)) then raise exception 'unknown_property'; end if;
  if not exists (select 1 from entities where pcid = p_pcid) then raise exception 'no_such_page'; end if;
  if length(coalesce(p_value, '')) > 2000 then raise exception 'too_long'; end if;

  select protection into v_protection from page_content where pcid = p_pcid;
  if v_protection = 'patrollers' and not v_patroller then raise exception 'protected'; end if;
  v_held := v_protection = 'reviewed' and not v_patroller;

  if not v_held then
    update infobox_edits set is_current = false
    where pcid = p_pcid and property_key = lower(p_key) and is_current;
  end if;

  insert into infobox_edits (pcid, property_key, value, citation, summary, is_current, created_by,
                             patrol_status, patrolled_by, patrolled_at)
  values (p_pcid, lower(p_key), nullif(trim(p_value), ''), trim(p_citation), trim(p_summary), not v_held, auth.uid(),
          case when v_held then 'pending' when v_patroller then 'patrolled' else 'unpatrolled' end,
          case when v_patroller then auth.uid() end,
          case when v_patroller then now() end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.review_infobox_edit(p_edit_id bigint, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  e infobox_edits%rowtype;
begin
  if not has_role('patroller') then raise exception 'not_patroller' using errcode = '42501'; end if;
  select * into e from infobox_edits where id = p_edit_id and patrol_status = 'pending' for update;
  if not found then raise exception 'not_pending'; end if;
  if e.created_by = auth.uid() then raise exception 'cannot_review_own'; end if;
  if p_accept then
    update infobox_edits set is_current = false
    where pcid = e.pcid and property_key = e.property_key and is_current;
    update infobox_edits
    set is_current = true, patrol_status = 'patrolled', patrolled_by = auth.uid(), patrolled_at = now(), review_note = p_note
    where id = e.id;
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'note_required'; end if;
    update infobox_edits
    set patrol_status = 'rejected', patrolled_by = auth.uid(), patrolled_at = now(), review_note = trim(p_note)
    where id = e.id;
  end if;
end $$;

create or replace function public.create_page(
  p_entity_kind  text,
  p_name         text,
  p_summary      text,
  p_description  text default '',
  p_body_md      text default '',
  p_subtype      text default null,    -- clinical: concept_type; functional: group_type; measurement: measurement_type
  p_identifiers  jsonb default '{}'::jsonb   -- {"unii": "...", "cas": "..."} for drug kinds
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b pcid_blocks%rowtype;
  v_pcid bigint;
  v_slug text := pc_slugify(p_name);
  v_dup bigint;
  v_unii text := nullif(upper(trim(p_identifiers ->> 'unii')), '');
  v_cas  text := nullif(trim(p_identifiers ->> 'cas'), '');
begin
  if not is_verified_contributor() then raise exception 'not_verified' using errcode = '42501'; end if;
  if not exists (select 1 from contributor_profiles where user_id = auth.uid()) then raise exception 'handle_required'; end if;
  if p_entity_kind not in ('moiety', 'combination', 'precise_form', 'formulation',
                           'clinical', 'measurement', 'target', 'functional') then
    raise exception 'kind_not_creatable';   -- class and list pages are curated
  end if;
  if v_slug = '' or length(p_name) > 200 then raise exception 'bad_name'; end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'summary_required'; end if;
  if not has_role('patroller') and (select count(*) from community_pages
       where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;

  -- Duplicate guards: same slug, same name, or (drug kinds) same UNII/CAS.
  select pcid into v_dup from entities
  where slug = v_slug or lower(name) = lower(trim(p_name)) limit 1;
  if found then raise exception 'page_exists' using detail = v_dup::text; end if;
  if v_unii is not null or v_cas is not null then
    select pcid into v_dup from (
      select pcid, unii, cas from moieties
      union all select pcid, unii, cas from precise_forms
      union all select pcid, unii, cas from combinations
    ) d
    where (v_unii is not null and upper(d.unii) = v_unii) or (v_cas is not null and d.cas = v_cas)
    limit 1;
    if found then raise exception 'identifier_exists' using detail = v_dup::text; end if;
  end if;

  -- Mint from the block (row lock serialises concurrent creates).
  select * into b from pcid_blocks where entity_kind = p_entity_kind for update;
  v_pcid := b.next_pcid;
  if v_pcid > b.max_id then raise exception 'block_full'; end if;
  update pcid_blocks set next_pcid = next_pcid + 1 where block_id = b.block_id;

  perform set_config('pc.change_source', 'community-create', true);
  perform set_config('pc.actor', auth.uid()::text, true);

  insert into entities (pcid, entity_type, slug, slug_uri, name)
  values (v_pcid, p_entity_kind, v_slug, b.slug_prefix || v_slug, trim(p_name));

  case p_entity_kind
    when 'moiety' then
      insert into moieties (pcid, term_type, origin, unii, cas, primary_source)
      values (v_pcid, 'Core moiety', 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'precise_form' then
      insert into precise_forms (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'combination' then
      insert into combinations (pcid, origin, unii, cas, primary_source)
      values (v_pcid, 'community', v_unii, v_cas, 'Pharmacy Commons contributors');
    when 'formulation' then
      insert into formulations (pcid, origin, primary_source)
      values (v_pcid, 'community', 'Pharmacy Commons contributors');
    when 'clinical' then
      insert into clinical_concepts (pcid, concept_type, source_ref) values (v_pcid, p_subtype, 'community');
    when 'measurement' then
      insert into measurements (pcid, measurement_type) values (v_pcid, p_subtype);
    when 'functional' then
      insert into functional_groups (pcid, group_type, common_name) values (v_pcid, p_subtype, trim(p_name));
    when 'target' then
      insert into biological_targets (pcid) values (v_pcid);
  end case;

  insert into community_pages (pcid, created_by) values (v_pcid, auth.uid());

  if coalesce(trim(p_description), '') <> '' or coalesce(trim(p_body_md), '') <> '' then
    perform save_page(v_pcid, null, p_description, p_body_md, p_summary, 'create');
  end if;

  return jsonb_build_object('pcid', v_pcid, 'pcid_code', 'PCID-' || v_pcid,
                            'slug', v_slug, 'entity_type', p_entity_kind);
end $$;

-- ── Admin RPCs ─────────────────────────────────────────────────────────────
create or replace function public.grant_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if not exists (select 1 from provider_verifications where user_id = p_user_id and status = 'active') then
    raise exception 'not_verified';
  end if;
  insert into user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.revoke_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_user_id = auth.uid() and p_role = 'admin' then raise exception 'cannot_revoke_own_admin'; end if;
  delete from user_roles where user_id = p_user_id and role = p_role;
end $$;

create or replace function public.set_page_protection(p_pcid bigint, p_protection text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  insert into page_content (pcid, protection) values (p_pcid, p_protection)
  on conflict (pcid) do update set protection = excluded.protection;
end $$;

create or replace function public.block_contributor(p_user_id uuid, p_reason text, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  insert into contributor_blocks (user_id, reason, blocked_by, expires_at)
  values (p_user_id, p_reason, auth.uid(), p_expires_at)
  on conflict (user_id) do update
    set reason = excluded.reason, blocked_by = excluded.blocked_by,
        blocked_at = now(), expires_at = excluded.expires_at;
end $$;

-- ── Public read RPCs ───────────────────────────────────────────────────────
-- History with "@handle · badge". Never returns the uuid, NPI or legal name.
create or replace function public.page_history(p_pcid bigint, p_limit integer default 50)
returns table (id bigint, created_at timestamptz, handle text, credential text, summary text,
               size_delta integer, kind text, patrol_status text)
language sql stable security definer set search_path = public as $$
  select r.id, r.created_at,
         coalesce(cp.handle, 'maintainer'),
         case when coalesce(cp.display_credential, true)
              then pc_credential_badge(pv.credential, pv.primary_taxonomy) end,
         r.summary, r.size_delta, r.kind, r.patrol_status
  from page_revisions r
  left join contributor_profiles cp on cp.user_id = r.created_by
  left join provider_verifications pv on pv.user_id = r.created_by
  where r.pcid = p_pcid
  order by r.id desc
  limit least(greatest(p_limit, 1), 500)
$$;

-- ── Execute grants ─────────────────────────────────────────────────────────
revoke execute on function
  public.has_role(text), public.is_verified_contributor(), public.refresh_page_links(bigint),
  public.set_contributor_handle(text, boolean),
  public.save_page(bigint, bigint, text, text, text, text),
  public.accept_revision(bigint, text), public.reject_revision(bigint, text),
  public.revert_page(bigint, bigint, text), public.patrol_revision(bigint),
  public.edit_infobox(bigint, text, text, text, text), public.review_infobox_edit(bigint, boolean, text),
  public.create_page(text, text, text, text, text, text, jsonb),
  public.grant_role(uuid, text), public.revoke_role(uuid, text),
  public.set_page_protection(bigint, text), public.block_contributor(uuid, text, timestamptz)
from public, anon;

grant execute on function
  public.has_role(text), public.is_verified_contributor(),
  public.set_contributor_handle(text, boolean),
  public.save_page(bigint, bigint, text, text, text, text),
  public.accept_revision(bigint, text), public.reject_revision(bigint, text),
  public.revert_page(bigint, bigint, text), public.patrol_revision(bigint),
  public.edit_infobox(bigint, text, text, text, text), public.review_infobox_edit(bigint, boolean, text),
  public.create_page(text, text, text, text, text, text, jsonb),
  public.grant_role(uuid, text), public.revoke_role(uuid, text),
  public.set_page_protection(bigint, text), public.block_contributor(uuid, text, timestamptz)
to authenticated;

revoke execute on function public.refresh_page_links(bigint) from authenticated;

grant execute on function public.resolve_property(text, bigint), public.resolve_page_target(text),
  public.page_history(bigint, integer), public.pc_slugify(text), public.pc_credential_badge(text, text)
to anon, authenticated;

-- ── 9. Seed (phase15e_seed) ────────────────────────────────────────────────
-- Joshua (the only verified account, 2026-10-04) is admin; nobody else holds a
-- role at launch. Further patrollers are granted by Joshua via grant_role().
insert into public.user_roles (user_id, role)
values ('8464cf01-f9ea-4053-880c-9424f971a192', 'admin')
on conflict do nothing;

-- High-alert / narrow-therapeutic-index pages start 'reviewed': edits from
-- non-patrollers wait for acceptance. Covers the moiety plus every precise
-- form, brand formulation and combination under it (moiety_hierarchy).
-- Chemotherapy beyond methotrexate and fluorouracil needs a defined rule
-- (e.g. a hazardous-drug list) before it is added — Joshua decides.
with base as (
  select pcid from public.entities
  where entity_type = 'moiety'
    and (slug in (
          -- anticoagulants and thrombolytics
          'warfarin', 'heparin', 'enoxaparin', 'dalteparin', 'fondaparinux',
          'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban',
          'alteplase', 'tenecteplase', 'reteplase',
          -- high-potency opioids
          'fentanyl', 'methadone', 'hydromorphone',
          -- narrow therapeutic index
          'digoxin', 'lithium', 'phenytoin', 'fosphenytoin', 'carbamazepine',
          'theophylline', 'tacrolimus', 'cyclosporine',
          -- sulfonylureas
          'glipizide', 'glyburide', 'glimepiride',
          -- cytotoxic chemotherapy (initial)
          'methotrexate', 'fluorouracil')
         or (slug like 'insulin%' and slug <> 'insulin-like-growth-factor-ii'))
), targets as (
  select pcid from base
  union
  select h.member_pcid from public.moiety_hierarchy h join base b on b.pcid = h.moiety_pcid
)
insert into public.page_content (pcid, protection)
select pcid, 'reviewed' from targets
on conflict (pcid) do update set protection = 'reviewed';
