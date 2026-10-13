-- db/phase18_product_packaging.sql
-- Phase 18: curated packaging facts for the days supply calculator (2026-10-13).
--
-- STATUS: written, NOT applied (the apply_migration call was cancelled 2026-10-13).
-- Apply with apply_migration, then confirm it in supabase_migrations.schema_migrations
-- before changing this line. Seed rows: db/phase18b_product_packaging_seed.sql.
--
-- Why: the calculator needs facts the FDA NDC Directory does not carry: drops per
-- mL, priming, use-within days after opening, doses per pen. These are curated
-- by hand, one row per product per source, so disagreements are stored and shown
-- (project principle) instead of one value being picked. Example: a 5 mL bottle
-- counted at 20 drops/mL by the manufacturer and 16 drops/mL by a payer is two rows.
--
-- Keyed to a PCID (a moiety, or a marketed formulation / brand), not to an NDC;
-- an NDC may be recorded as well once the NDC package ingest exists. Package size
-- from the NDC Directory ("200 AEROSOL, METERED in 1 INHALER") will come from that
-- ingest, not from this table.
--
-- Read: public (like every reference table). Write: none from the client; rows are
-- added by the maintainer with the service role or the SQL editor.
-- Frontend: src/tools/dayssupply/packaging.ts + PackagingPicker.tsx read it; with no rows, or no table yet,
-- the picker simply does not appear and the Package fields are typed in as before.
-- Design: docs/days-supply.md, "Package facts table".

create table if not exists public.product_packaging (
  id                    bigint generated always as identity primary key,
  entity_pcid           bigint not null references public.entities (pcid),
  product_name          text,                         -- label name as printed, e.g. "ProAir HFA"
  ndc                   text check (ndc is null or ndc ~ '^[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}$'),
  -- Which calculator basis these facts feed (dayssupply/calc.ts Basis).
  basis                 text not null check (basis in ('count', 'liquid', 'drops', 'spray', 'inhaler', 'insulin', 'injection')),
  container             text check (container is null or container in ('pen', 'vial')),   -- insulin and injections
  package_size          numeric check (package_size > 0),          -- tablets per package, or mL per bottle
  volume_ml             numeric check (volume_ml > 0),             -- drops: bottle size
  drops_per_ml          numeric check (drops_per_ml > 0),
  actuations            numeric check (actuations > 0),            -- puffs or sprays per device
  prime_actuations      numeric check (prime_actuations >= 0),     -- spent priming before first use
  units_per_container   numeric check (units_per_container > 0),   -- insulin units per pen or vial
  prime_units           numeric check (prime_units >= 0),          -- insulin units primed per injection
  doses_per_container   numeric check (doses_per_container > 0),   -- as labeled
  containers_per_box    numeric check (containers_per_box > 0),
  in_use_days           integer check (in_use_days > 0),           -- days a container may be used once opened
  -- Where the value comes from. Several rows per product are allowed, one per source.
  value_source          text not null check (value_source in ('manufacturer', 'payer', 'general_default')),
  payer_name            text,
  source_name           text not null,                             -- e.g. "Prescribing information, section 16"
  source_url            text check (source_url is null or source_url ~ '^https?://'),
  source_checked        date,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint product_packaging_payer_named check (value_source <> 'payer' or payer_name is not null),
  -- At least one packaging fact must be present, or the row says nothing.
  constraint product_packaging_has_fact check (
    num_nonnulls(package_size, volume_ml, drops_per_ml, actuations, prime_actuations,
                 units_per_container, prime_units, doses_per_container, containers_per_box, in_use_days) > 0)
);

-- One row per product, basis and source. coalesce() so NULL names still collide.
create unique index if not exists product_packaging_one_per_source
  on public.product_packaging (entity_pcid, coalesce(product_name, ''), coalesce(ndc, ''), basis, value_source, coalesce(payer_name, ''));
create index if not exists product_packaging_pcid_idx on public.product_packaging (entity_pcid);

alter table public.product_packaging enable row level security;
revoke all on public.product_packaging from public, anon, authenticated;
grant select on public.product_packaging to anon, authenticated;
drop policy if exists product_packaging_public_read on public.product_packaging;
create policy product_packaging_public_read on public.product_packaging for select to anon, authenticated using (true);

comment on table public.product_packaging is
  'Curated packaging facts for the days supply calculator (drops per mL, priming, in-use days, doses per pen). One row per product per source so manufacturer and payer values sit side by side. Phase 18.';
