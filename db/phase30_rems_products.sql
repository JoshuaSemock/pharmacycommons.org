-- Phase 30: REMS products list (Active / Inactive) + Quick Facts "REMS" row (2026-11-03)
-- Source: REMS_Products.csv supplied by Joshua (FDA REMS@FDA product export: 1,048 rows, 6 blank, 1,042 products
-- in 333 REMS programs). Row data: db/seed/rems_programs.sql, db/seed/rems_products.sql.
--
-- Surfaces:
--   rems_programs              one row per REMS_ID (program name as exported, website, element flags)
--   rems_products              one row per REMS_Product_ID; moiety_pcids = the REMS-driving active moiety(ies)
--   lists 10000049/50/51       REMS Products (one row per generic moiety) + Active / Inactive sublists
--   get_rems(pcid)             Quick Facts "REMS" row (moiety page; brand/combination pages roll up to their moiety)
--   infobox_properties.rems    transcludable as {{rems}} (status: Active / Inactive)
-- Moiety status: Active when any of its products is Active; the Inactive sublist = moieties with no Active product.
-- After editing rems_products: select public.refresh_rems_lists();
-- Mapping rule for combination products: the REMS-driving ingredient only (acetaminophen/codeine -> codeine);
-- products where the REMS covers both components list both (emtricitabine+tenofovir, phentermine+topiramate,
-- sodium phosphate dibasic+monobasic, peginterferon alfa-2b+ribavirin). Held (moiety_pcids null, match_note says why):
-- HalfLytely and Suprep bowel-prep kits; Myobloc (rimabotulinumtoxinB has no moiety yet).

-- 30a ------------------------------------------------------------------------
create table public.rems_programs (
  rems_id               integer primary key,                -- REMS_ID in the export
  name                  text not null,                      -- REMS_Name as exported
  website               text,
  etasu                 boolean not null default false,     -- Elements to Assure Safe Use
  medication_guide      boolean not null default false,
  communication_plan    boolean not null default false,
  implementation_system boolean not null default false,
  shared_system         boolean not null default false
);
create table public.rems_products (
  product_id        integer primary key,                    -- REMS_Product_ID in the export
  rems_id           integer not null references public.rems_programs (rems_id),
  established_name  text not null,                          -- ingredient text, cleaned of typos and stray label text
  brand             text,                                   -- trade name; null for plain generics and program-level rows
  dosage_form       text,
  application_type  text,
  application_number text,
  added_date        date,
  approval_date     date,
  last_updated      date,
  withdrawal_date   date,
  dailymed_setid    text,
  status            text not null check (status in ('Active', 'Inactive')),
  moiety_pcids      bigint[],                               -- REMS-driving moiety PCID(s); null = held for review
  match_note        text
);
create index rems_products_rems_idx on public.rems_products (rems_id);
create index rems_products_moiety_idx on public.rems_products using gin (moiety_pcids);
alter table public.rems_programs enable row level security;
alter table public.rems_products enable row level security;
create policy public_read on public.rems_programs for select using (true);
create policy public_read on public.rems_products for select using (true);
grant select on public.rems_programs, public.rems_products to anon, authenticated;
comment on table public.rems_programs is 'FDA REMS programs (REMS@FDA export, phase 30). One row per REMS_ID; name as exported.';
comment on table public.rems_products is 'Products covered by a REMS (phase 30). moiety_pcids = REMS-driving active moiety(ies); null rows are held for review (see match_note). Edit, then run refresh_rems_lists().';

-- Program name for display: drop application numbers, "PS-" and "Shared System", end with REMS.
create or replace function public.rems_program_label(p_name text)
returns text language sql immutable set search_path = public as $$
  select case when t ~* 'rems$|ipledge$' then t else t || ' REMS' end
  from (select btrim(regexp_replace(regexp_replace(regexp_replace(
          p_name, '\s*\((anda|nda)[^)]*\)', '', 'i'), '^PS-', ''), '\s+shared system( rems)?$', '', 'i')) as t) s
$$;

-- 30b ------------------------------------------------------------------------
insert into public.entities (pcid, entity_type, slug, slug_uri, name) values
  (10000049, 'list', 'rems-products', 'pc:list:rems-products', 'REMS Products'),
  (10000050, 'list', 'rems-products-active', 'pc:list:rems-products-active', 'REMS Products: Active'),
  (10000051, 'list', 'rems-products-inactive', 'pc:list:rems-products-inactive', 'REMS Products: Inactive');
insert into public.lists (pcid, slug, title, description, kind, parent_pcid, jurisdiction, source_citation, source_url, license, default_sort, status_label, published, sort_order)
values
  (10000049, 'rems-products', 'REMS Products',
   'Drugs that FDA requires a Risk Evaluation and Mitigation Strategy (REMS) for, one row per generic moiety with the affected brand names alongside. Active means at least one product still has a REMS; Inactive means every REMS for the drug has been withdrawn or released.',
   'authority', null, 'US',
   'U.S. Food and Drug Administration. Approved Risk Evaluation and Mitigation Strategies (REMS), REMS@FDA product listing. Compiled for Pharmacy Commons.',
   'https://www.accessdata.fda.gov/scripts/cder/rems/', 'Public domain (U.S. FDA)', 'name', 'Status', true, 120),
  (10000050, 'rems-products-active', 'REMS Products: Active',
   'Drugs with at least one product under an active REMS.',
   'authority', 10000049, 'US',
   'U.S. Food and Drug Administration. Approved Risk Evaluation and Mitigation Strategies (REMS), REMS@FDA product listing. Compiled for Pharmacy Commons.',
   'https://www.accessdata.fda.gov/scripts/cder/rems/', 'Public domain (U.S. FDA)', 'name', 'Status', true, 121),
  (10000051, 'rems-products-inactive', 'REMS Products: Inactive',
   'Drugs whose REMS products have all been withdrawn or released.',
   'authority', 10000049, 'US',
   'U.S. Food and Drug Administration. Approved Risk Evaluation and Mitigation Strategies (REMS), REMS@FDA product listing. Compiled for Pharmacy Commons.',
   'https://www.accessdata.fda.gov/scripts/cder/rems/', 'Public domain (U.S. FDA)', 'name', 'Status', true, 122);
update public.pcid_blocks set next_pcid = 10000052 where block_id = 10;

insert into public.infobox_properties (key, label, entity_types, source_kind, source_ref, sort_order, transcludable)
values ('rems', 'REMS', array['moiety','precise_form','combination','formulation'], 'list', 'rems-products#legal_status', 120, true);

-- List rows: one per moiety. legal_status = Active / Inactive; note = affected brands (active, then
-- "Inactive: …" for brands with no active product); source_name = REMS program names.
create or replace function public.refresh_rems_lists()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from list_items where list_pcid in (10000049, 10000050, 10000051);

  with prod as (
    select unnest(p.moiety_pcids) as m, p.* from rems_products p where p.moiety_pcids is not null
  ),
  brand_state as (
    select m, brand, bool_or(status = 'Active') as active from prod where brand is not null group by m, brand
  ),
  agg as (
    select m,
           case when bool_or(status = 'Active') then 'Active' else 'Inactive' end as st,
           (select string_agg(distinct rems_program_label(rp.name), '; ')
              from prod x join rems_programs rp using (rems_id) where x.m = prod.m) as programs
    from prod group by m
  ),
  brands as (
    select m,
           string_agg(brand, ', ' order by lower(brand)) filter (where active) as act,
           string_agg(brand, ', ' order by lower(brand)) filter (where not active) as inact
    from brand_state group by m
  ),
  ranked as (
    select a.m, a.st, a.programs,
           nullif(concat_ws(' · ', b.act, case when b.inact is not null then 'Inactive: ' || b.inact end), '') as note,
           row_number() over (order by lower(e.name), a.m) as pos
    from agg a join entities e on e.pcid = a.m left join brands b on b.m = a.m
  )
  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
  select 10000049, pos, m, programs, st, note, array['FDA REMS@FDA'] from ranked;

  insert into list_items (list_pcid, position, member_pcid, source_name, legal_status, note, sources)
  select case i.legal_status when 'Active' then 10000050 else 10000051 end,
         row_number() over (partition by i.legal_status order by i.position),
         i.member_pcid, i.source_name, i.legal_status, i.note, i.sources
  from list_items i where i.list_pcid = 10000049;

  update lists l set item_count = (select count(*) from list_items i where i.list_pcid = l.pcid), updated_at = now()
  where l.pcid in (10000049, 10000050, 10000051);

  select item_count into v_count from lists where pcid = 10000049;
  return v_count;
end $$;
revoke execute on function public.refresh_rems_lists() from public, anon, authenticated;

-- Quick Facts row. A moiety page returns its own programs; a brand, precise form or combination page rolls up
-- to its moiety through moiety_hierarchy (as get_lasa does). One row per REMS program.
create or replace function public.get_rems(p_pcid bigint)
returns table (rems_id integer, program text, status text, etasu boolean, medication_guide boolean,
               communication_plan boolean, implementation_system boolean, shared_system boolean,
               website text, brands text, inactive_brands text)
language sql stable set search_path = public as $$
  with moieties_of as (
    select p_pcid as m where exists (select 1 from moieties where pcid = p_pcid)
    union select h.moiety_pcid from moiety_hierarchy h where h.member_pcid = p_pcid
  ),
  prod as (
    select p.* from rems_products p
    where p.moiety_pcids && (select coalesce(array_agg(m), '{}') from moieties_of)
  ),
  per_brand as (
    select rems_id, brand, bool_or(status = 'Active') as active from prod where brand is not null group by rems_id, brand
  )
  select rp.rems_id,
         rems_program_label(rp.name),
         case when bool_or(pr.status = 'Active') then 'Active' else 'Inactive' end,
         rp.etasu, rp.medication_guide, rp.communication_plan, rp.implementation_system, rp.shared_system,
         rp.website,
         (select string_agg(b.brand, ', ' order by lower(b.brand)) from per_brand b where b.rems_id = rp.rems_id and b.active),
         (select string_agg(b.brand, ', ' order by lower(b.brand)) from per_brand b where b.rems_id = rp.rems_id and not b.active)
  from prod pr join rems_programs rp using (rems_id)
  group by rp.rems_id, rp.name, rp.etasu, rp.medication_guide, rp.communication_plan, rp.implementation_system, rp.shared_system, rp.website
  order by bool_or(pr.status = 'Active') desc, lower(rems_program_label(rp.name))
$$;
grant execute on function public.get_rems(bigint) to anon, authenticated;
