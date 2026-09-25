-- Phase 10b — pharmacist-record moiety rule for fda_product_ingredients (2026-09-25)
-- Approved by Joshua 2026-09-25: moiety_pcid = the record a pharmacist would look up;
-- the FDA active moiety is kept separately in active_moiety_pcid.
-- Applied as three migrations: 10b1 (column + drop check), 10b2 (add check), 10b3 (data).

-- 10b1 --------------------------------------------------------------------
alter table public.fda_product_ingredients
  add column if not exists active_moiety_pcid bigint references public.entities(pcid);
comment on column public.fda_product_ingredients.active_moiety_pcid is
  'FDA active moiety (DailyMed SPL active-moiety UNII). May differ from moiety_pcid: esters/prodrugs resolve to the parent, inorganic salts to the ion.';
comment on column public.fda_product_ingredients.moiety_pcid is
  'Pharmacist-facing moiety: exact core-moiety name > salt-stripped core-moiety name (never a bare element/ion) > exact non-core name > salt-stripped name > UNII.';
create index if not exists fda_product_ingredients_active_moiety_idx on public.fda_product_ingredients(active_moiety_pcid);
alter table public.fda_product_ingredients drop constraint fda_product_ingredients_match_basis_check;

-- 10b2 --------------------------------------------------------------------
alter table public.fda_product_ingredients add constraint fda_product_ingredients_match_basis_check
  check (match_basis in ('dailymed_moiety_unii','dailymed_unii','openfda_unii','name','name_exact','name_salt_stripped'));

-- 10b3 --------------------------------------------------------------------
-- 1) Preserve the FDA answer (only UNII-derived active moieties).
update public.fda_product_ingredients
   set active_moiety_pcid = moiety_pcid
 where active_moiety_pcid is null and match_basis = 'dailymed_moiety_unii';

-- 2) Re-resolve moiety_pcid by the approved rule.
with salt as (select '\s+(hydrochloride|dihydrochloride|hcl|hydrobromide|sulfate|sulphate|bisulfate|hemisulfate|maleate|phosphate|sodium|disodium|potassium|dipotassium|calcium|magnesium|citrate|tartrate|bitartrate|succinate|mesylate|dimesylate|fumarate|hemifumarate|acetate|besylate|benzoate|gluconate|lactate|nitrate|oxalate|palmitate|pamoate|decanoate|enanthate|valerate|propionate|lauroxil|anhydrous|monohydrate|dihydrate|trihydrate|hemihydrate|sesquihydrate|hydrate|chloride|bromide|iodide|carbonate|bicarbonate|tosylate|edisylate|napsylate|xinafoate|tromethamine|meglumine|malate|stearate|hyclate|lysine|arginine|monosodium|trisodium|hemipentahydrate|pentahydrate|heptahydrate)\s*$' re),
blocked as (
  select pcid from public.entities
   where entity_type = 'moiety'
     and (lower(name) ~ '(cation|anion|\mion)$'
          or lower(name) in ('sodium','potassium','calcium','magnesium','zinc','iron','ferrous','ferric','cupric','copper',
                             'aluminum','aluminium','ammonium','chloride','bromide','iodide','fluoride','phosphate','sulfate',
                             'citrate','acetate','carbonate','bicarbonate','hydrogen','silver','bismuth','barium','strontium',
                             'manganese','gadolinium','hydroxide','oxide','nitrate','gluconate','lactate'))),
n as (
  select i.product_id, i.ingredient_no,
         lower(regexp_replace(trim(i.ingredient_name), '\s+', ' ', 'g')) as n0
    from public.fda_product_ingredients i),
s as (
  select n.*, regexp_replace(regexp_replace(regexp_replace(n0, (select re from salt), ''), (select re from salt), ''), (select re from salt), '') as n1
    from n),
m as (
  select s.product_id, s.ingredient_no,
         x1.pcid as p_exact, x1.pref as exact_pref,
         case when x2.pcid in (select pcid from blocked) then null else x2.pcid end as p_strip,
         case when x2.pcid in (select pcid from blocked) then null else x2.pref end as strip_pref,
         xf.pcid as p_form
    from s
    left join public.stg_name_index x1 on x1.nn = s.n0 and x1.entity_type = 'moiety'
    left join public.stg_name_index x2 on x2.nn = s.n1 and x2.entity_type = 'moiety' and s.n1 <> s.n0
    left join public.stg_name_index xf on xf.nn = s.n0 and xf.entity_type = 'precise_form'),
r as (
  select product_id, ingredient_no, p_form,
         coalesce(case when exact_pref = 1 then p_exact end,
                  case when strip_pref = 1 then p_strip end,
                  p_exact, p_strip) as new_pcid,
         case when exact_pref = 1 then 'name_exact'
              when strip_pref = 1 then 'name_salt_stripped'
              when p_exact is not null then 'name_exact'
              when p_strip is not null then 'name_salt_stripped' end as new_basis
    from m)
update public.fda_product_ingredients i
   set moiety_pcid = coalesce(r.new_pcid, i.moiety_pcid),
       match_basis = coalesce(r.new_basis, i.match_basis),
       form_pcid   = coalesce(i.form_pcid, r.p_form)
  from r
 where r.product_id = i.product_id and r.ingredient_no = i.ingredient_no
   and (r.new_pcid is not null or (i.form_pcid is null and r.p_form is not null));
