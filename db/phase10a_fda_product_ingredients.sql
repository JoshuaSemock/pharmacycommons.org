-- Phase 10a — FDA product → PCID linking (2026-09-25)
-- One row per active ingredient of a Drugs@FDA product, resolved to PCIDs.
-- (Table DDL as applied; the population/linking pass was run as data statements in the
--  previous session and is summarised in ROADMAP.md / CLAUDE.md.)
create table public.fda_product_ingredients (
  product_id      text not null references public.fda_products(product_id) on delete cascade,
  ingredient_no   smallint not null,              -- order in Drugs@FDA active_ingredients
  ingredient_name text not null,                  -- as Drugs@FDA writes it, e.g. 'METOPROLOL SUCCINATE'
  strength        text,
  unii            text,                           -- ingredient UNII (salt/ester level)
  moiety_unii     text,                           -- active-moiety UNII (DailyMed SPL)
  moiety_pcid     bigint references public.entities(pcid),
  form_pcid       bigint references public.entities(pcid),  -- precise form when the ingredient is a salt/ester we hold
  match_basis     text check (match_basis in ('dailymed_moiety_unii','dailymed_unii','openfda_unii','name')),
  primary key (product_id, ingredient_no)
);
create index fda_product_ingredients_moiety_idx on public.fda_product_ingredients(moiety_pcid);
comment on table public.fda_product_ingredients is 'Active ingredients of each Drugs@FDA product resolved to PCIDs. match_basis records how: DailyMed SPL active-moiety UNII (preferred), DailyMed ingredient UNII, openFDA application UNII, or name.';
alter table public.fda_product_ingredients enable row level security;
create policy public_read on public.fda_product_ingredients for select using (true);
