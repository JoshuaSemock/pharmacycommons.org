-- Phase 27: look-alike/sound-alike (LASA) drug names + Tall Man lettering (applied 2026-11-01)
-- Source: Joshua's TallMan.xlsx (1,077 rows: moiety, established_name, confused_with, has_TallMan).
-- Live migrations: phase27a_lasa_names, phase27b_lasa_moiety_rollup, phase27c_lasa_rpc_lists_infobox,
-- phase27d_refresh_lasa_lists, phase27e_lasa_list_note_by_name. Row data + PCID matching: db/seed/lasa_names.sql.
--
-- Surfaces:
--   lasa_names              one row per (name, confused_with) pair, casing as written; *_pcid link to entities
--   lasa_pairs_v            both directions of every pair
--   get_lasa(pcid)          Quick Facts "Look-alike/sound-alike" row (moiety page also gets its brands/forms)
--   lists 10000047/10000048 Look-Alike/Sound-Alike Drug Names (+ Tall Man Lettering sublist)
--   infobox_properties.lasa transcludable as {{lasa}}
-- After editing lasa_names: select public.refresh_lasa_lists();

-- 27a ------------------------------------------------------------------------
create table public.lasa_names (
  id                  integer primary key,              -- sheet ID
  sheet_moiety        text,                             -- sheet "moiety" column (only filled for IDs 1-257)
  name                text not null,                    -- established_name, casing as written (Tall Man where used)
  confused_with       text not null,
  has_tall_man        boolean not null,
  name_pcid           bigint references public.entities (pcid),
  confused_with_pcid  bigint references public.entities (pcid),
  name_match          text,                             -- how name_pcid was resolved
  confused_match      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index lasa_names_name_pcid_idx on public.lasa_names (name_pcid);
create index lasa_names_confused_pcid_idx on public.lasa_names (confused_with_pcid);
alter table public.lasa_names enable row level security;
create policy public_read on public.lasa_names for select using (true);
grant select on public.lasa_names to anon, authenticated;
comment on table public.lasa_names is
  'Look-alike/sound-alike drug name pairs with Tall Man lettering flag (phase 27a). name/confused_with keep the source casing; *_pcid link to entities.';

-- 27b ------------------------------------------------------------------------
alter table public.lasa_names
  add column name_moiety_pcid bigint references public.entities (pcid),
  add column confused_with_moiety_pcid bigint references public.entities (pcid);
create index lasa_names_name_moiety_idx on public.lasa_names (name_moiety_pcid);
create index lasa_names_cw_moiety_idx on public.lasa_names (confused_with_moiety_pcid);

-- Moiety for an entity: itself if a moiety; else moiety_hierarchy; else an RxNorm brand with the
-- same name (covers brand formulations not yet linked to a moiety, e.g. Klonopin, Xanax).
create or replace function public.lasa_moiety_of(p_pcid bigint, p_name text)
returns bigint language sql stable set search_path = public as $$
  select coalesce(
    (select e.pcid from entities e where e.pcid = p_pcid and e.entity_type = 'moiety'),
    (select h.moiety_pcid from moiety_hierarchy h where h.member_pcid = p_pcid order by h.moiety_pcid limit 1),
    (select b.pcid from rxnorm_brands b join entities e on e.pcid = b.pcid and e.entity_type = 'moiety'
       join entities f on f.pcid = p_pcid and f.entity_type = 'formulation'
      where lower(b.brand) = lower(f.name)
      group by b.pcid having count(*) >= 1 order by b.pcid limit 1)
  )
$$;

-- 27c ------------------------------------------------------------------------
create or replace view public.lasa_pairs_v with (security_invoker = true) as
  select l.id, l.name_pcid as pcid, l.name_moiety_pcid as moiety_pcid, l.name, l.has_tall_man,
         l.confused_with as other_name, l.confused_with_pcid as other_pcid, 'listed'::text as direction
  from public.lasa_names l where l.confused_with <> 'Not specified'
  union all
  select l.id, l.confused_with_pcid, l.confused_with_moiety_pcid, l.confused_with, false,
         l.name, l.name_pcid, 'reverse'
  from public.lasa_names l where l.confused_with <> 'Not specified';
grant select on public.lasa_pairs_v to anon, authenticated;

create or replace function public.get_lasa(p_pcid bigint)
returns table (name text, name_pcid bigint, has_tall_man boolean, confused_with text, confused_with_pcid bigint)
language sql stable set search_path = public as $$
  with members as (
    select p_pcid as pcid
    union select h.member_pcid from moiety_hierarchy h where h.moiety_pcid = p_pcid
  ),
  hits as (
    select v.* from lasa_pairs_v v
    where v.pcid in (select pcid from members) or v.moiety_pcid = p_pcid
  )
  select distinct on (lower(h.other_name), lower(h.name))
         h.name, h.pcid, bool_or(h.has_tall_man) over (partition by lower(h.name)), h.other_name, h.other_pcid
  from hits h
  order by lower(h.other_name), lower(h.name), (h.direction = 'listed') desc
$$;
grant execute on function public.get_lasa(bigint) to anon, authenticated;

insert into public.entities (pcid, entity_type, slug, slug_uri, name) values
  (10000047, 'list', 'look-alike-sound-alike', 'pc:list:look-alike-sound-alike', 'Look-Alike/Sound-Alike Drug Names'),
  (10000048, 'list', 'look-alike-sound-alike-tall-man', 'pc:list:look-alike-sound-alike-tall-man', 'Look-Alike/Sound-Alike Drug Names: Tall Man Lettering');
insert into public.lists (pcid, slug, title, description, kind, parent_pcid, source_citation, license, default_sort, status_label, published, sort_order)
values
  (10000047, 'look-alike-sound-alike', 'Look-Alike/Sound-Alike Drug Names',
   'Drug names that are often confused with one another, and the names each is confused with. Capitalized letters are Tall Man lettering, which highlights the parts of similar names that differ.',
   'curated', null, 'Semock, J. (2026). Look-Alike/Sound-Alike Drug Names and Tall Man Lettering. Pharmacy Commons.',
   'CC0-1.0', 'name', 'Tall Man lettering', true, 110),
  (10000048, 'look-alike-sound-alike-tall-man', 'Look-Alike/Sound-Alike Drug Names: Tall Man Lettering',
   'Drug names with recommended Tall Man lettering.',
   'curated', 10000047, 'Semock, J. (2026). Look-Alike/Sound-Alike Drug Names and Tall Man Lettering. Pharmacy Commons.',
   'CC0-1.0', 'name', 'Tall Man lettering', true, 111);
update public.pcid_blocks set next_pcid = 10000049 where block_id = 10;

insert into public.infobox_properties (key, label, entity_types, source_kind, source_ref, sort_order, transcludable)
values ('lasa', 'Look-alike/sound-alike', array['moiety','precise_form','combination','formulation'], 'list', 'look-alike-sound-alike#note', 110, true);

-- 27d/27e --------------------------------------------------------------------
-- List items: one per entity (its moiety when the name rolls up to one; otherwise the brand/combination).
-- legal_status = the Tall Man names; note = "KlonoPIN: cloNIDine · clonazePAM: ALPRAZolam, cloBAZam, ...".
create or replace function public.refresh_lasa_lists()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from list_items where list_pcid in (10000047, 10000048);

  with p as (
    select distinct coalesce(v.moiety_pcid, v.pcid) as member, v.name as nm, v.other_name as other
    from lasa_pairs_v v where coalesce(v.moiety_pcid, v.pcid) is not null
  ),
  tm as (
    select distinct coalesce(v.moiety_pcid, v.pcid) as member, v.name as nm
    from lasa_pairs_v v where coalesce(v.moiety_pcid, v.pcid) is not null and v.has_tall_man
  ),
  per_name as (
    select member, nm, string_agg(other, ', ' order by lower(other)) as others from p group by member, nm
  ),
  agg as (
    select n.member,
           (select string_agg(t.nm, '; ' order by lower(t.nm)) from tm t where t.member = n.member) as tall_man,
           string_agg(n.nm || ': ' || n.others, ' · ' order by lower(n.nm)) as note,
           string_agg(n.nm, '; ' order by lower(n.nm)) as names
    from per_name n group by n.member
  ),
  ranked as (
    select a.*, row_number() over (order by lower(e.name), a.member) as pos
    from agg a join entities e on e.pcid = a.member
  )
  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note)
  select 10000047, pos, member, names, tall_man, note from ranked;

  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note)
  select 10000048, row_number() over (order by i.position), i.member_pcid, i.source_name, i.legal_status, i.note
  from list_items i where i.list_pcid = 10000047 and i.legal_status is not null;

  update lists l set item_count = (select count(*) from list_items i where i.list_pcid = l.pcid), updated_at = now()
  where l.pcid in (10000047, 10000048);

  select item_count into v_count from lists where pcid = 10000047;
  return v_count;
end $$;
revoke execute on function public.refresh_lasa_lists() from public, anon, authenticated;
