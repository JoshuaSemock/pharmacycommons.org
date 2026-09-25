-- Phase 10e — covering index for fda_product_ingredients.form_pcid FK (performance advisor) (2026-09-25)
create index if not exists fda_product_ingredients_form_idx on public.fda_product_ingredients(form_pcid);
analyze public.fda_product_ingredients;
analyze public.clinical_statements;
