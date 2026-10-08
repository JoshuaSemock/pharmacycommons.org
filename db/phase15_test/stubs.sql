-- Local stand-in for the parts of the live schema phase 15 touches.
-- Column names/types copied from nenwovhyrdcdkhxzjiiv on 2026-10-04.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.pcid_blocks (
  block_id int primary key, label text, min_id bigint, max_id bigint, next_pcid bigint,
  entity_kind text unique, slug_prefix text);
insert into public.pcid_blocks values
 (1,'Active Moiety',1000001,1999999,1015681,'moiety','pc:moiety:'),
 (2,'Combination Product',2000001,2999999,2002591,'combination','pc:combination:'),
 (3,'Precise Form',3000001,3999999,3001452,'precise_form','pc:precise_form:'),
 (4,'Marketed Formulation',4000001,4999999,4006582,'formulation','pc:formulation:'),
 (5,'Pharmacologic Class',5000001,5999999,5004982,'class','pc:class:'),
 (6,'Clinical Concept',6000001,6999999,6000077,'clinical','pc:clinical:'),
 (7,'Measurement',7000001,7999999,7000014,'measurement','pc:measurement:'),
 (8,'Biological Target',8000001,8999999,8000028,'target','pc:target:'),
 (9,'Functional Group',9000001,9999999,9000060,'functional','pc:functional:'),
 (10,'List',10000001,10999999,10000039,'list','pc:list:');

create table public.entities (
  pcid bigint primary key, entity_type text not null references public.pcid_blocks(entity_kind),
  slug text not null unique, slug_uri text not null unique, name text not null,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table public.moieties (pcid bigint primary key, term_type text, origin text, unii text, cas text,
  primary_source text, rx_status text, legal_status text, fda_marketing_status text, description_text text);
create table public.precise_forms (pcid bigint primary key, origin text, unii text, cas text, primary_source text,
  rx_status text, legal_status text, fda_marketing_status text);
create table public.combinations (pcid bigint primary key, origin text, unii text, cas text, primary_source text,
  rx_status text, legal_status text, fda_marketing_status text);
create table public.formulations (pcid bigint primary key, origin text, unii text, cas text, primary_source text,
  rx_status text, legal_status text, fda_marketing_status text);
create table public.clinical_concepts (pcid bigint primary key, concept_type text, source_ref text);
create table public.measurements (pcid bigint primary key, measurement_type text, units text);
create table public.functional_groups (pcid bigint primary key, group_type text, common_name text);
create table public.biological_targets (pcid bigint primary key);
create table public.pcid_retired (pcid bigint primary key, retired_at timestamptz default now(), reason text);

create table public.provider_verifications (
  user_id uuid primary key references auth.users(id), npi text unique, verified_name text,
  enumeration_type text, primary_taxonomy text, status text, verified_at timestamptz default now(),
  last_checked_at timestamptz default now());

create table public.lists (pcid bigint primary key, slug text unique, title text);
create table public.list_items (list_pcid bigint, position int, member_pcid bigint, rank int, value numeric,
  legal_status text, note text);
create table public.moiety_hierarchy (moiety_pcid bigint, member_pcid bigint, relation text);

-- Users: Joshua (verified admin), Alice (verified), Bob (registered, not verified)
insert into auth.users values
 ('8464cf01-f9ea-4053-880c-9424f971a192','joshua'),
 ('aaaaaaaa-0000-0000-0000-000000000001','alice'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob');
insert into public.provider_verifications (user_id, npi, primary_taxonomy, status, enumeration_type) values
 ('8464cf01-f9ea-4053-880c-9424f971a192','1111111111','Pharmacist','active','NPI-1'),
 ('aaaaaaaa-0000-0000-0000-000000000001','2222222222','Internal Medicine','active','NPI-1');

insert into public.entities (pcid, entity_type, slug, slug_uri, name) values
 (1000001,'moiety','3-4-methylenedioxymethamphetamine','pc:moiety:3-4-methylenedioxymethamphetamine','3,4-Methylenedioxymethamphetamine'),
 (1001900,'moiety','metformin','pc:moiety:metformin','Metformin'),
 (1000500,'moiety','amitriptyline','pc:moiety:amitriptyline','Amitriptyline'),
 (1002962,'moiety','warfarin','pc:moiety:warfarin','Warfarin'),
 (3000900,'precise_form','warfarin-sodium','pc:precise_form:warfarin-sodium','Warfarin sodium'),
 (1001687,'moiety','insulin-glargine','pc:moiety:insulin-glargine','Insulin glargine'),
 (1009727,'moiety','insulin-like-growth-factor-ii','pc:moiety:insulin-like-growth-factor-ii','Insulin-like growth factor II'),
 (6000003,'clinical','hypertension','pc:clinical:hypertension','Hypertension');
insert into public.moieties (pcid, term_type, rx_status, legal_status, unii) values
 (1001900,'Core moiety','Rx','Legend','9100L32L2N'),(1000500,'Core moiety','Rx','Legend',null),
 (1002962,'Core moiety','Rx',null,null),(1001687,'Core moiety','Rx',null,null),(1009727,'Core moiety',null,null,null),(1000001,'Core moiety',null,'CS-I',null);
insert into public.precise_forms (pcid) values (3000900);
insert into public.clinical_concepts values (6000003,'Indication',null);
insert into public.moiety_hierarchy values (1002962,3000900,'precise_form');
insert into public.lists values (10000034,'anticholinergic-burden','ACB'),(10000001,'most-used-drugs-us','MEPS');
insert into public.list_items (list_pcid, position, member_pcid, value, rank) values
 (10000034,1,1000500,3,null),(10000001,1,1001900,9876543,4);

-- Brand names (matview live; a plain table here) for phase 15h.
create table public.entity_brand_names (pcid bigint, brand_key text, brand_display text, marketed boolean,
  appl_nos text[], brand_rxcui text, sources text[]);
insert into public.entity_brand_names (pcid, brand_key, brand_display, sources) values
 (1001900, 'GLUCOPHAGE', 'Glucophage', '{drugsfda,rxnorm}'),
 (1001900, 'FORTAMET', null, '{drugsfda}'),
 (1002962, 'COUMADIN', 'Coumadin', '{drugsfda,rxnorm}');
