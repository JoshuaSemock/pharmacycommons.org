-- RECONSTRUCTED 2026-10-13 from the live Supabase catalog (project nenwovhyrdcdkhxzjiiv).
-- The originals were lost. Live migrations this stands in for:
--   20260923032644 class_membership_schema      20260923032707 rxclass_drug_staging
--   20260923032946 class_read_api               20260923115503 classyfire_lookup_staging
--   20260923115725 rebuild_classes_fn           20260923120503 class_rules_nomenclature
--   20260923120958 class_agent_review_staging   20260925193921 phase10f1_class_search_aliases
--   20260925193938 phase10f2_search_classes_fn  20260925194010 phase10f3_search_classes_alias_wins
--   (class_type_label / list_classes / class_api functions that already exist in later db/ files are not repeated)
-- This is the CURRENT definition, not the history: later edits (class_type 'community' from phase15i,
-- the search_classes alias-wins rule) are folded in. Function bodies are copied verbatim from pg_get_functiondef.
-- Design notes: db/phase8-drug-classes.md. Run after 01_core_schema_v2.sql and phase8a_history.sql. Idempotent.
-- Data (class_rules seed, class_search_aliases rows, rxclass_*/chemont_* staging) is NOT reproduced except
-- class_rules, which is configuration (see the INSERT at the end).

-- ─── Classes and membership ──────────────────────────────────────────────────
create table if not exists public.drug_classes (
  pcid bigint not null,
  moa text,
  pe text,
  cs text,
  source_agency text,
  source_ref text,
  class_type text,
  source_system text,
  source_code text,
  parent_pcid bigint,
  level smallint,
  description text,
  member_count integer default 0 not null,
  constraint drug_classes_pkey PRIMARY KEY (pcid),
  constraint drug_classes_class_type_chk CHECK (((class_type IS NULL) OR (class_type = ANY (ARRAY['epc'::text, 'moa'::text, 'pe'::text, 'chem'::text, 'atc'::text, 'va'::text, 'chemont'::text, 'curated'::text, 'community'::text]))))
);
create index if not exists drug_classes_type_idx on public.drug_classes using btree (class_type);
create index if not exists drug_classes_parent_idx on public.drug_classes using btree (parent_pcid);
create unique index if not exists drug_classes_source_uq on public.drug_classes using btree (source_system, source_code) where (source_code is not null);
do $$ begin
  alter table public.drug_classes add constraint drug_classes_parent_pcid_fkey FOREIGN KEY (parent_pcid) REFERENCES public.entities(pcid) ON DELETE SET NULL;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.drug_classes add constraint drug_classes_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
drop trigger if exists trg_log_change on public.drug_classes;
create trigger trg_log_change after insert or update or delete on public.drug_classes
  for each row execute function public.log_entity_change('pcid');

create table if not exists public.class_members (
  class_pcid bigint not null,
  member_pcid bigint not null,
  is_direct boolean default true not null,
  source_system text not null,
  match_basis text,
  created_at timestamp with time zone default now() not null,
  constraint class_members_pkey PRIMARY KEY (class_pcid, member_pcid)
);
create index if not exists class_members_member_idx on public.class_members using btree (member_pcid);
do $$ begin
  alter table public.class_members add constraint class_members_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.class_members add constraint class_members_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

create table if not exists public.class_rules (
  code text not null,
  name text not null,
  parent_code text,
  pattern text,
  exclude text,
  description text,
  sort integer,
  fallback_only boolean default false not null,
  constraint class_rules_pkey PRIMARY KEY (code)
);
do $$ begin
  alter table public.class_rules add constraint class_rules_parent_code_fkey FOREIGN KEY (parent_code) REFERENCES public.class_rules(code);
exception when duplicate_object then null; end $$;

create table if not exists public.class_search_aliases (
  alias_key text not null,
  class_pcid bigint not null,
  alias text not null,
  source text default 'curated'::text not null,
  constraint class_search_aliases_pkey PRIMARY KEY (alias_key, class_pcid)
);
create index if not exists class_search_aliases_class_idx on public.class_search_aliases using btree (class_pcid);
do $$ begin
  alter table public.class_search_aliases add constraint class_search_aliases_class_pcid_fkey FOREIGN KEY (class_pcid) REFERENCES public.drug_classes(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

-- ─── Source staging: ChemOnt / ClassyFire / RxClass ──────────────────────────
create table if not exists public.chemont_terms (
  chemont_id text not null,
  name text not null,
  parent_id text,
  definition text,
  constraint chemont_terms_pkey PRIMARY KEY (chemont_id)
);
create table if not exists public.chemont_links (
  pcid bigint not null,
  chemont_id text not null,
  ord smallint not null,
  constraint chemont_links_pkey PRIMARY KEY (pcid, chemont_id)
);
create index if not exists idx_chemont_links_chemont_id on public.chemont_links using btree (chemont_id);
do $$ begin
  alter table public.chemont_links add constraint chemont_links_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

create table if not exists public.classyfire_lookup (
  pcid bigint not null,
  inchi_key text,
  key_basis text,
  status text not null,
  n_terms integer,
  detail text,
  fetched_at timestamp with time zone default now() not null,
  constraint classyfire_lookup_pkey PRIMARY KEY (pcid)
);
do $$ begin
  alter table public.classyfire_lookup add constraint classyfire_lookup_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

create table if not exists public.rxclass_classes (
  class_id text not null,
  rela_source text not null,
  class_type text not null,
  class_name text not null,
  parent_class_id text,
  members_fetched boolean default false not null,
  fetch_error text,
  constraint rxclass_classes_pkey PRIMARY KEY (class_id, rela_source)
);
create table if not exists public.rxclass_drug (
  pcid bigint not null,
  class_id text not null,
  rela_source text not null,
  rela text not null,
  class_type text not null,
  class_name text not null,
  constraint rxclass_drug_pkey PRIMARY KEY (pcid, class_id, rela_source, rela)
);
do $$ begin
  alter table public.rxclass_drug add constraint rxclass_drug_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
create table if not exists public.rxclass_lookup (
  pcid bigint not null,
  rxcui text,
  rxcui_basis text,
  status text not null,
  n_classes integer,
  detail text,
  fetched_at timestamp with time zone default now() not null,
  constraint rxclass_lookup_pkey PRIMARY KEY (pcid)
);
do $$ begin
  alter table public.rxclass_lookup add constraint rxclass_lookup_pcid_fkey FOREIGN KEY (pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
create table if not exists public.rxclass_va_products (
  class_id text not null,
  product text not null,
  constraint rxclass_va_products_pkey PRIMARY KEY (class_id, product)
);

-- ─── Agent-review staging (pharmacist-agent classification of unclassified moieties) ─────
create table if not exists public.class_review_queue (
  pcid bigint not null,
  name text,
  unii text,
  drugbank_id text,
  cas text,
  primary_brand text,
  batch integer,
  constraint class_review_queue_pkey PRIMARY KEY (pcid)
);
create table if not exists public.class_agent_review (
  member_pcid bigint not null,
  class_slug text not null,
  confidence text not null,
  basis text,
  source_url text,
  batch integer,
  created_at timestamp with time zone default now() not null,
  constraint class_agent_review_pkey PRIMARY KEY (member_pcid, class_slug),
  constraint class_agent_review_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text])))
);
do $$ begin
  alter table public.class_agent_review add constraint class_agent_review_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;
create table if not exists public.class_agent_skip (
  member_pcid bigint not null,
  reason text,
  batch integer,
  created_at timestamp with time zone default now() not null,
  constraint class_agent_skip_pkey PRIMARY KEY (member_pcid)
);
do $$ begin
  alter table public.class_agent_skip add constraint class_agent_skip_member_pcid_fkey FOREIGN KEY (member_pcid) REFERENCES public.entities(pcid) ON DELETE CASCADE;
exception when duplicate_object then null; end $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Public read: drug_classes, class_members, class_rules, class_search_aliases, chemont_terms, chemont_links.
-- RLS on with NO policy (service role only): classyfire_lookup, rxclass_*, class_review_queue, class_agent_*.
do $$
declare t text;
begin
  foreach t in array array['drug_classes','class_members','class_rules','class_search_aliases','chemont_terms','chemont_links'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='public_read') then
      execute format('create policy public_read on public.%I for select to public using (true)', t);
    end if;
  end loop;
  foreach t in array array['classyfire_lookup','rxclass_classes','rxclass_drug','rxclass_lookup','rxclass_va_products','class_review_queue','class_agent_review','class_agent_skip'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─── Functions ───────────────────────────────────────────────────────────────
create or replace function public.class_display_name(p text)
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog', 'public'
as $function$
declare s text; w text;
begin
  if p is null or p <> upper(p) then return p; end if;
  s := regexp_replace(lower(p), ',(\S)', ', \1', 'g');
  s := upper(left(s,1)) || substr(s,2);
  foreach w in array array['hiv','ace','hmg','cns','nsaid','nsaids','gi','dna','rna','mao','cox','acth','hcv','hbv','ii','iii','iv','b12','b1','b6','d','k','h2','5-ht3','cd20','egfr','vegf','tnf','ppi','gnrh','lhrh','sglt2','dpp-4','glp-1','cftr','pde5','cgrp','jak','bcr-abl','alk','parp','mtor','il'] loop
    s := regexp_replace(s, '(^|[^a-z0-9])' || replace(w,'-','\-') || '($|[^a-z0-9])', '\1' || upper(w) || '\2', 'g');
  end loop;
  return s;
end $function$;

create or replace function public.classyfire_todo(p_limit integer)
 returns table(pcid bigint, inchi_key text, name text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select e.pcid, nullif(m.inchi_key,''), e.name
  from entities e join moieties m using(pcid)
  where e.entity_type='moiety'
    and not exists(select 1 from chemont_links c where c.pcid=e.pcid)
    and not exists(select 1 from classyfire_lookup l where l.pcid=e.pcid)
  order by exists(select 1 from class_members cm where cm.member_pcid=e.pcid),
           (m.inchi_key is null or m.inchi_key=''), e.pcid
  limit p_limit $function$;

create or replace function public.rxclass_todo(p_limit integer)
 returns table(pcid bigint, unii text, base_name text, name text, rxcui text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select e.pcid, nullif(m.unii,''), m.base_name, e.name, r.rxcui
  from entities e join moieties m using(pcid)
  left join rxnorm_lookup r on r.pcid=e.pcid and r.status='ok'
  where e.entity_type='moiety'
    and not exists (select 1 from rxclass_lookup l where l.pcid=e.pcid)
  order by (r.rxcui is null), (m.unii is null or m.unii=''), e.pcid
  limit p_limit $function$;

create or replace function public.mint_class(p_name text, p_type text, p_system text, p_code text, p_level smallint DEFAULT NULL::smallint)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_pcid bigint; v_slug text; v_base text; n int := 1;
begin
  select pcid into v_pcid from drug_classes where source_system=p_system and source_code=p_code;
  if v_pcid is not null then return v_pcid; end if;
  v_base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := v_base;
  if exists(select 1 from entities where slug=v_slug) then
    v_base := v_base || '-' || lower(p_type); v_slug := v_base;
  end if;
  while exists(select 1 from entities where slug=v_slug) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  update pcid_blocks set next_pcid = next_pcid + 1 where block_id = 5 returning next_pcid - 1 into v_pcid;
  insert into entities(pcid, entity_type, slug, slug_uri, name) values (v_pcid,'class',v_slug,'pc:class:'||v_slug,p_name);
  insert into drug_classes(pcid, class_type, source_system, source_code, level, source_agency)
    values (v_pcid, p_type, p_system, p_code, p_level, p_system);
  return v_pcid;
end $function$;

create or replace function public.rebuild_classes()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record; v_pcid bigint; n_claimed int := 0; n_minted int := 0;
begin
  -- ChemOnt ancestor closure (root CHEMONTID:9999999 and kingdoms excluded from classes)
  create temp table co_anc on commit drop as
  with recursive a(term, anc, dist) as (
    select chemont_id, parent_id, 1 from chemont_terms where parent_id is not null
    union all select a.term, t.parent_id, a.dist+1 from a join chemont_terms t on t.chemont_id=a.anc
    where t.parent_id is not null and a.dist < 20)
  select * from a;
  create temp table co_depth on commit drop as
    select t.chemont_id, count(a.anc)::smallint as depth  -- kingdom = 1 (its only ancestor is root)
    from chemont_terms t left join co_anc a on a.term=t.chemont_id group by 1;

  -- 1. Candidate classes --------------------------------------------------
  create temp table cand(system text, code text, ctype text, name text, parent_code text,
                         level smallint, descr text, prio int) on commit drop;
  insert into cand
    select distinct on (class_id) 'DAILYMED', class_id, lower(class_type), class_name, null, null, null,
           case class_type when 'EPC' then 1 when 'MOA' then 2 when 'PE' then 3 else 4 end
    from rxclass_drug where rela_source='DAILYMED' order by class_id, class_type;
  insert into cand
    with recursive u(code) as (
      select distinct class_id from rxclass_drug where rela_source='ATC'
      union select c.parent_class_id from u join rxclass_classes c on c.class_id=u.code and c.rela_source='ATC'
      where c.parent_class_id is not null)
    select 'ATC', c.class_id, 'atc', class_display_name(c.class_name), c.parent_class_id,
           case length(c.class_id) when 1 then 1 when 3 then 2 when 4 then 3 else 4 end, null, 5
    from u join rxclass_classes c on c.class_id=u.code and c.rela_source='ATC';
  insert into cand
    with recursive u(code) as (
      select distinct class_id from rxclass_drug where rela_source='VA'
      union select c.parent_class_id from u join rxclass_classes c on c.class_id=u.code and c.rela_source='VA'
      where c.parent_class_id is not null)
    select 'VA', c.class_id, 'va', class_display_name(c.class_name), c.parent_class_id,
           case when c.parent_class_id is null then 1 else 2 end, null, 6
    from u join rxclass_classes c on c.class_id=u.code and c.rela_source='VA';
  insert into cand
    select 'ChemOnt', t.chemont_id, 'chemont', t.name,
           case when d.depth > 2 then t.parent_id end, (d.depth-1)::smallint, t.definition, 7
    from chemont_terms t join co_depth d using(chemont_id)
    where d.depth >= 2
      and exists(select 1 from chemont_links l where l.chemont_id=t.chemont_id
                 union all select 1 from co_anc a join chemont_links l on l.chemont_id=a.term where a.anc=t.chemont_id limit 1);

  insert into cand
    select 'PharmacyCommons', code, 'curated', name, parent_code,
           (case when parent_code is null then 1 when (select parent_code from class_rules p where p.code=r0.parent_code) is null then 2 else 3 end)::smallint,
           description, 8
    from class_rules r0;

  -- 2. Claim pre-existing untyped classes with the same name (keeps their PCIDs/slugs stable)
  for r in
    select distinct on (d.pcid) d.pcid, c.* from cand c
    join entities e on e.entity_type='class' and lower(e.name)=lower(c.name)
    join drug_classes d on d.pcid=e.pcid and d.source_code is null
    where not exists(select 1 from drug_classes x where x.source_system=c.system and x.source_code=c.code)
    order by d.pcid, c.prio
  loop
    if not exists(select 1 from drug_classes x where x.source_system=r.system and x.source_code=r.code) then
      update drug_classes set class_type=r.ctype, source_system=r.system, source_code=r.code, level=r.level,
             description=coalesce(description, r.descr) where pcid=r.pcid;
      n_claimed := n_claimed + 1;
    end if;
  end loop;

  -- 3. Mint the rest
  for r in select c.* from cand c
           where not exists(select 1 from drug_classes x where x.source_system=c.system and x.source_code=c.code)
           order by c.prio, c.level nulls first, c.code
  loop
    v_pcid := mint_class(r.name, r.ctype, r.system, r.code, r.level);
    update drug_classes set description=r.descr where pcid=v_pcid and r.descr is not null;
    n_minted := n_minted + 1;
  end loop;

  -- 4. Parents
  update drug_classes d set parent_pcid = p.pcid, level = c.level
  from cand c join drug_classes p on p.source_system=c.system and p.source_code=c.parent_code
  where d.source_system=c.system and d.source_code=c.code and d.parent_pcid is distinct from p.pcid;

  -- 5. Memberships (everything except curated is rebuilt from source)
  delete from class_members where source_system <> 'curated';

  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select distinct d.pcid, rd.pcid, true, rd.rela_source, 'rxcui'
  from rxclass_drug rd join drug_classes d on d.source_system=rd.rela_source and d.source_code=rd.class_id
  join entities me on me.pcid=rd.pcid
  where
    -- VA classes are assigned to products: keep only when a single-ingredient product of this drug is in the class
    (rd.rela_source <> 'VA'
     or exists(select 1 from rxclass_classes vc where vc.class_id=rd.class_id and vc.rela_source='VA'
               and (not vc.members_fetched or vc.fetch_error is not null))
     or exists(select 1 from rxclass_va_products vp where vp.class_id=rd.class_id
               and vp.product ~ ('\m' || regexp_replace(lower(me.name), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M')))
    -- ATC "combinations of ..." codes only when the drug has no single-agent ATC code
    and (rd.rela_source <> 'ATC' or rd.class_name !~* 'combination'
         or not exists(select 1 from rxclass_drug r2 where r2.pcid=rd.pcid and r2.rela_source='ATC' and r2.class_name !~* 'combination'))
  on conflict do nothing;

  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'name_pattern'
  from class_rules cr
  join drug_classes d on d.source_system='PharmacyCommons' and d.source_code=cr.code
  join entities e on e.entity_type='moiety' and lower(e.name) ~ cr.pattern
                  and (cr.exclude is null or lower(e.name) !~ cr.exclude)
  where cr.pattern is not null and not cr.fallback_only
  on conflict do nothing;

  -- Reviewed assignments (pharmacist-agent review, class_agent_review)
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select e.pcid, ar.member_pcid, true, 'agent_review', 'agent_review:' || ar.confidence
  from class_agent_review ar join entities e on e.slug=ar.class_slug and e.entity_type='class'
  on conflict do nothing;

  -- ATC / VA / rule ancestors (inherited)
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  with recursive up(member, cls) as (
    select m.member_pcid, d.parent_pcid from class_members m join drug_classes d on d.pcid=m.class_pcid
    where m.source_system in ('ATC','VA','rule','agent_review') and d.parent_pcid is not null
    union select up.member, d.parent_pcid from up join drug_classes d on d.pcid=up.cls where d.parent_pcid is not null)
  select distinct cls, member, false, d.source_system, 'hierarchy' from up join drug_classes d on d.pcid=up.cls
  on conflict do nothing;

  -- ChemOnt: most specific linked terms are direct; terms that are ancestors of another linked term are inherited
  create temp table co_inh on commit drop as
    select distinct l2.pcid, a.anc as chemont_id from chemont_links l2 join co_anc a on a.term=l2.chemont_id;
  create index on co_inh(pcid, chemont_id);
  analyze co_inh;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, l.pcid, (i.pcid is null), 'ChemOnt', 'chemont_link'
  from chemont_links l join entities e on e.pcid=l.pcid and e.entity_type='moiety'
  join drug_classes d on d.source_system='ChemOnt' and d.source_code=l.chemont_id
  left join co_inh i on i.pcid=l.pcid and i.chemont_id=l.chemont_id
  on conflict do nothing;

  -- Curated statements already in the knowledge graph
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select s.object_pcid, s.subject_pcid, true, 'curated', 'clinical_statement'
  from clinical_statements s join entities o on o.pcid=s.object_pcid and o.entity_type='class'
  join entities su on su.pcid=s.subject_pcid and su.entity_type='moiety'
  where s.predicate='member_of'
  on conflict do nothing;

  -- Name-root inheritance: "X (exception)", "X, (R)-", "X free base", "X hydrochloride" or synonym_of
  create temp table root_map on commit drop as
  select e.pcid child, p.pcid parent
  from entities e join moieties m on m.pcid=e.pcid
  join lateral (select trim(regexp_replace(lower(e.name),
        '(\s*\(exception\)|\s*\(analogs?\)|,?\s*\((r|s|e|z|\+|-|\+/-|rs|r,r|s,s|1r|1s|2r|2s|3r|3s)\)-?|,\s*(cis|trans|d|l|dl)-|\s+(free base|base|mixture|active metabolite|anhydrous|hydrochloride|hcl|dihydrochloride|hydrobromide|sodium|disodium|potassium|calcium|magnesium|sulfate|mesylate|maleate|fumarate|tartrate|citrate|acetate|phosphate|bromide|chloride|succinate|besylate|tosylate|hyclate|monohydrate|dihydrate|hemihydrate))+$', '', 'g')) as root) rt on true
  join entities p on p.entity_type='moiety' and p.pcid<>e.pcid and lower(p.name)=rt.root
  where e.entity_type='moiety' and rt.root<>lower(e.name)
  union
  select m.pcid, m.synonym_of_pcid from moieties m where m.synonym_of_pcid is not null;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select distinct on (cm.class_pcid, rm.child) cm.class_pcid, rm.child, cm.is_direct, cm.source_system,
         'parent:' || rm.parent
  from root_map rm join class_members cm on cm.member_pcid=rm.parent
  where not exists(select 1 from class_members x where x.member_pcid=rm.child and x.source_system not in ('rule','PharmacyCommons'))
    and cm.match_basis <> 'name_pattern_fallback'
  on conflict do nothing;

  -- Fallback rules: only for moieties still in no class at all
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'name_pattern_fallback'
  from class_rules cr
  join drug_classes d on d.source_system='PharmacyCommons' and d.source_code=cr.code
  join entities e on e.entity_type='moiety' and lower(e.name) ~ cr.pattern
                  and (cr.exclude is null or lower(e.name) !~ cr.exclude)
  where cr.fallback_only and cr.code <> 'REVIEW' and not exists(select 1 from class_members x where x.member_pcid=e.pcid)
  on conflict do nothing;
  insert into class_members(class_pcid, member_pcid, is_direct, source_system, match_basis)
  select d.pcid, e.pcid, true, 'rule', 'awaiting_review'
  from drug_classes d join entities e on e.entity_type='moiety'
  where d.source_system='PharmacyCommons' and d.source_code='REVIEW'
    and not exists(select 1 from class_members x where x.member_pcid=e.pcid)
  on conflict do nothing;

  update drug_classes d set member_count = coalesce(c.n,0)
  from (select d2.pcid, (select count(*) from class_members m where m.class_pcid=d2.pcid) n from drug_classes d2) c
  where c.pcid=d.pcid and d.member_count is distinct from coalesce(c.n,0);

  return jsonb_build_object('claimed', n_claimed, 'minted', n_minted,
    'classes_with_members', (select count(distinct class_pcid) from class_members),
    'memberships', (select count(*) from class_members),
    'moieties', (select count(*) from entities where entity_type='moiety'),
    'moieties_classified', (select count(distinct member_pcid) from class_members m join entities e on e.pcid=m.member_pcid and e.entity_type='moiety'));
end $function$;

create or replace function public.get_class(p_slug text)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with c as (
    select e.pcid, e.slug, e.name, d.class_type, d.source_system, d.source_code, d.level,
           d.description, d.parent_pcid, d.member_count
    from entities e join drug_classes d using(pcid) where e.slug = p_slug and e.entity_type='class'),
  anc as (
    with recursive a(pcid, depth) as (
      select parent_pcid, 1 from c where parent_pcid is not null
      union all select d.parent_pcid, a.depth+1 from a join drug_classes d on d.pcid=a.pcid
      where d.parent_pcid is not null and a.depth < 12)
    select a.depth, e.slug, e.name, d.source_code from a join entities e using(pcid) join drug_classes d using(pcid))
  select case when not exists(select 1 from c) then null else jsonb_build_object(
    'pcid', c.pcid, 'slug', c.slug, 'name', c.name,
    'class_type', c.class_type, 'class_type_label', class_type_label(c.class_type),
    'source_system', c.source_system, 'source_code', c.source_code, 'level', c.level,
    'description', c.description,
    'ancestors', coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'name',name,'source_code',source_code) order by depth desc) from anc), '[]'),
    'children', coalesce((select jsonb_agg(jsonb_build_object('slug',e.slug,'name',e.name,'source_code',d.source_code,
                    'member_count',d.member_count) order by d.source_code, e.name)
                  from drug_classes d join entities e using(pcid) where d.parent_pcid=c.pcid and d.member_count > 0), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('pcid',e.pcid,'slug',e.slug,'name',e.name,
                    'entity_type',e.entity_type,'is_direct',m.is_direct) order by lower(e.name))
                  from class_members m join entities e on e.pcid=m.member_pcid where m.class_pcid=c.pcid), '[]'),
    'member_count', c.member_count
  ) end from c $function$;

create or replace function public.get_entity_classes(p_pcid bigint, p_include_inherited boolean DEFAULT false)
 returns table(slug text, name text, class_type text, class_type_label text, source_code text, is_direct boolean, level smallint)
 language sql
 stable
 set search_path to 'public'
as $function$
  with target as (
    select p_pcid as pcid
    union
    select h.moiety_pcid from moiety_hierarchy h
    where h.member_pcid = p_pcid and h.relation = 'precise_form'
      and not exists (select 1 from class_members x where x.member_pcid = p_pcid)),
  rows as (
    select distinct on (m.class_pcid) e.slug, e.name, d.class_type, d.source_code, m.is_direct, d.level
    from target t join class_members m on m.member_pcid=t.pcid
    join entities e on e.pcid=m.class_pcid join drug_classes d on d.pcid=m.class_pcid
    where (m.is_direct or p_include_inherited)
    order by m.class_pcid, m.is_direct desc)
  select slug, name, class_type, class_type_label(class_type), source_code, is_direct, level from rows
  order by array_position(array['atc','va','epc','moa','pe','chem','chemont','curated'], class_type), level nulls first, name $function$;

create or replace function public.search_classes(p_q text, p_limit integer DEFAULT 3)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with q as (
    select trim(regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9]+', ' ', 'g')) as w
  ), qk as (
    select w,
           replace(w, ' ', '')                                   as k,
           regexp_replace(replace(w, ' ', ''), 's$', '')         as ks,
           array(select regexp_replace(x, '(.{3,})s$', '\1')
                   from unnest(string_to_array(w, ' ')) x where x <> '') as words
      from q
  ), cls as (
    select d.pcid, e.slug, e.name, d.class_type, d.source_code, d.member_count,
           ' ' || trim(regexp_replace(lower(e.name), '[^a-z0-9]+', ' ', 'g')) || ' ' as nn
      from drug_classes d join entities e using (pcid)
     where d.member_count > 0
       and d.class_type in ('epc', 'curated', 'atc', 'va', 'moa')
  ), hits as (
    select c.pcid, 1 as rnk, 'alias' as how
      from qk join class_search_aliases a on a.alias_key in (qk.k, qk.ks)
      join cls c on c.pcid = a.class_pcid
     where length(qk.k) >= 2
    union all
    select c.pcid, 2, 'paren'
      from qk, cls c
     cross join lateral regexp_matches(c.name, '\(([^)]+)\)', 'g') m(g)
     where length(qk.k) >= 2
       and regexp_replace(regexp_replace(lower(m.g[1]), '[^a-z0-9]+', '', 'g'), 's$', '') in (qk.k, qk.ks)
    union all
    select c.pcid, 2, 'initialism'
      from qk, cls c
     where length(qk.k) between 3 and 6 and position(' ' in qk.w) = 0
       and (select string_agg(left(x, 1), '' order by o)
              from unnest(string_to_array(trim(c.nn), ' ')) with ordinality u(x, o)
             where x not in ('and', 'of', 'the', 'for', 'with', 'in', 'or', 'to', 'excl', 'plain'))
           in (qk.k, qk.ks)
    union all
    select c.pcid, 3, 'name'
      from qk, cls c
     where length(qk.k) >= 4
       and cardinality(qk.words) > 0
       and not exists (select 1 from unnest(qk.words) x where position(' ' || x in c.nn) = 0)
  ), best as (
    select distinct on (pcid) pcid, rnk, how from hits
     where rnk <= 2 and how <> 'initialism'
        or not exists (select 1 from hits h where h.how = 'alias')
     order by pcid, rnk
  ), ranked as (
    select c.*, b.rnk, b.how
      from best b join cls c using (pcid)
     order by b.rnk,
              array_position(array['epc', 'curated', 'atc', 'va', 'moa'], c.class_type),
              c.member_count desc, c.name
     limit greatest(coalesce(p_limit, 3), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', r.slug, 'name', r.name, 'class_type', r.class_type,
           'class_type_label', class_type_label(r.class_type),
           'source_code', r.source_code, 'match', r.how,
           'members', coalesce((
             select jsonb_agg(jsonb_build_object('pcid', e.pcid, 'slug', e.slug, 'name', e.name)
                              order by lower(e.name))
               from (select distinct member_pcid from class_members where class_pcid = r.pcid) m
               join entities e on e.pcid = m.member_pcid and e.entity_type = 'moiety'), '[]'::jsonb))
         order by r.rnk,
                  array_position(array['epc', 'curated', 'atc', 'va', 'moa'], r.class_type),
                  r.member_count desc, r.name), '[]'::jsonb)
    from ranked r
$function$;

-- Privileges: ETL / maintenance functions are service_role only; read functions are public RPCs.
revoke execute on function public.classyfire_todo(integer) from public, anon, authenticated;
revoke execute on function public.rxclass_todo(integer) from public, anon, authenticated;
revoke execute on function public.mint_class(text, text, text, text, smallint) from public, anon, authenticated;
revoke execute on function public.rebuild_classes() from public, anon, authenticated;

-- ─── Catalog view ────────────────────────────────────────────────────────────
create or replace view public.class_catalog as
 SELECT e.slug,
    e.name,
    d.class_type,
    d.source_code,
    d.level,
    ( SELECT count(*) AS count
           FROM class_members m
          WHERE m.class_pcid = d.pcid) AS members
   FROM drug_classes d
     JOIN entities e USING (pcid)
  WHERE d.class_type = ANY (ARRAY['atc'::text, 'epc'::text, 'moa'::text, 'pe'::text, 'chem'::text, 'va'::text, 'curated'::text, 'chemont'::text]);
