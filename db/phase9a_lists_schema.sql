-- Phase 9a — Lists (2026-09-25)
-- Mirror of the Supabase migration `phase9a_lists_schema` (applied via apply_migration).
--
-- A list is a purposeful collection of drugs (an exam list, a usage ranking),
-- separate from classes. Pharmacy Commons lists get PCIDs in a new block 10.
-- Data load notes (Top_Drugs.xlsx → 22 lists) are in db/phase9-lists.md.

insert into public.pcid_blocks(block_id, entity_kind, label, min_id, max_id, slug_prefix, next_pcid)
values (10, 'list', 'List', 10000001, 10999999, 'pc:list:', 10000001)
on conflict do nothing;

create table public.lists (
  pcid            bigint primary key references public.entities(pcid),
  slug            text not null unique,
  title           text not null,
  description     text,
  kind            text not null default 'curated' check (kind in ('curated','authority','community')),
  parent_pcid     bigint references public.lists(pcid),
  jurisdiction    text,                    -- e.g. 'US', 'US-GA'
  source_citation text not null,
  source_url      text,
  license         text not null default 'CC0-1.0',
  measure_label   text,                    -- what list_items.value means, e.g. 'Mean people per year with ≥1 fill'
  measure_unit    text,
  rank_label      text,                    -- what list_items.rank means
  default_sort    text not null default 'rank' check (default_sort in ('rank','value_desc','name','position')),
  published       boolean not null default false,
  item_count      int not null default 0,
  sort_order      int not null default 0,  -- order on the /lists index
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.lists is 'Purposeful drug lists (exam lists, usage rankings). Separate from drug_classes. One row per list; PCIDs from block 10.';

create table public.list_items (
  list_pcid    bigint not null references public.lists(pcid) on delete cascade,
  position     int not null,               -- 1-based order within the list
  member_pcid  bigint not null references public.entities(pcid),
  rank         int,                        -- rank as the list defines it (null when the list is unranked)
  value        numeric,                    -- measured value, see lists.measure_label
  source_name  text not null,              -- the name exactly as written in the source
  legal_status text,                       -- e.g. CS-2, Legend (jurisdiction from lists.jurisdiction)
  note         text,
  primary key (list_pcid, position)
);
create index list_items_member_idx on public.list_items(member_pcid);
comment on table public.list_items is 'Members of a list. A drug may appear more than once when the source lists it twice (kept for fidelity).';

alter table public.lists enable row level security;
alter table public.list_items enable row level security;
create policy public_read on public.lists for select using (published);
create policy public_read on public.list_items for select using (exists (select 1 from public.lists l where l.pcid = list_pcid and l.published));

-- Read API (security invoker: RLS decides visibility)
create or replace function public.list_lists()
returns table(pcid bigint, slug text, title text, description text, kind text, parent_slug text,
              jurisdiction text, item_count int, measure_label text, default_sort text, sort_order int)
language sql stable security invoker set search_path = public as $$
  select l.pcid, l.slug, l.title, l.description, l.kind, p.slug, l.jurisdiction, l.item_count, l.measure_label, l.default_sort, l.sort_order
  from lists l left join lists p on p.pcid = l.parent_pcid
  order by l.sort_order, l.title
$$;

create or replace function public.get_list(p_slug text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'pcid', l.pcid, 'pcid_code', 'PCID-' || l.pcid, 'slug', l.slug, 'title', l.title, 'description', l.description,
    'kind', l.kind, 'jurisdiction', l.jurisdiction, 'source_citation', l.source_citation, 'source_url', l.source_url,
    'license', l.license, 'measure_label', l.measure_label, 'measure_unit', l.measure_unit, 'rank_label', l.rank_label,
    'default_sort', l.default_sort, 'item_count', l.item_count, 'updated_at', l.updated_at,
    'parent', (select jsonb_build_object('slug', p.slug, 'title', p.title) from lists p where p.pcid = l.parent_pcid),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'item_count', c.item_count) order by c.sort_order, c.title)
                          from lists c where c.parent_pcid = l.pcid), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'position', i.position, 'rank', i.rank, 'value', i.value, 'legal_status', i.legal_status, 'note', i.note,
                'source_name', i.source_name, 'pcid', e.pcid, 'slug', e.slug, 'name', e.name, 'entity_type', e.entity_type)
              order by i.position)
              from list_items i join entities e on e.pcid = i.member_pcid where i.list_pcid = l.pcid), '[]'::jsonb)
  )
  from lists l where l.slug = p_slug
$$;

-- Lists a drug appears on. For a moiety, also counts its precise forms and combinations.
create or replace function public.get_entity_lists(p_pcid bigint)
returns table(slug text, title text, kind text, rank int, value numeric, legal_status text, via_pcid bigint, via_name text)
language sql stable security invoker set search_path = public as $$
  with members as (
    select p_pcid as pcid
    union
    select h.member_pcid from moiety_hierarchy h where h.moiety_pcid = p_pcid
  )
  select distinct on (l.pcid) l.slug, l.title, l.kind, i.rank, i.value, i.legal_status,
         nullif(i.member_pcid, p_pcid), case when i.member_pcid <> p_pcid then e.name end
  from list_items i join members m on m.pcid = i.member_pcid
  join lists l on l.pcid = i.list_pcid join entities e on e.pcid = i.member_pcid
  order by l.pcid, (i.member_pcid = p_pcid) desc, i.rank nulls last
$$;

grant execute on function public.list_lists(), public.get_list(text), public.get_entity_lists(bigint) to anon, authenticated;
