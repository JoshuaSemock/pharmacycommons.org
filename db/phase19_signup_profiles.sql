-- Phase 19 — richer sign-up: account type, age gate (18+), claimed NPI, contact details.
-- Destination: db/phase19_signup_profiles.sql
--
-- NOT APPLIED as of writing. Apply AFTER the matching frontend is deployed: part 2
-- makes Supabase Auth reject any sign-up without a valid date of birth (18+), and the
-- previous Register form does not send one.
--
-- Part 1 (table) and part 2 (triggers) are separate migrations: 19a_account_profiles,
-- 19b_signup_gate. Run the gate last.
--
-- Data minimisation: no street address is collected. Postal code, phone, organisation
-- and research area are optional. Date of birth is required (to enforce 18+) and is
-- readable only by its owner (RLS) — it is never exposed through the public API.

-- ───────────── 19a: account_profiles ─────────────
create table if not exists public.account_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  account_type   text not null check (account_type in ('patient', 'practitioner', 'researcher')),
  first_name     text not null check (char_length(first_name) between 1 and 80),
  last_name      text not null check (char_length(last_name) between 1 and 80),
  date_of_birth  date not null check (date_of_birth >= date '1900-01-01'),
  age_confirmed_at timestamptz not null default now(),
  country        text check (country is null or country ~ '^[A-Z]{2}$'),
  postal_code    text check (postal_code is null or char_length(postal_code) <= 16),
  phone          text check (phone is null or char_length(phone) <= 32),
  npi_claimed    text check (npi_claimed is null or npi_claimed ~ '^\d{10}$'),
  profession     text check (profession is null or char_length(profession) <= 80),
  organization   text check (organization is null or char_length(organization) <= 160),
  research_area  text check (research_area is null or char_length(research_area) <= 160),
  created_at     timestamptz not null default now()
);

comment on table public.account_profiles is
  'Private sign-up details (phase 19). Owner-read only; written by the on_auth_user_created_profile trigger from auth.users.raw_user_meta_data. npi_claimed is a claim — provider_verifications is the verified record.';

alter table public.account_profiles enable row level security;

drop policy if exists account_profiles_select_own on public.account_profiles;
create policy account_profiles_select_own on public.account_profiles
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.account_profiles from anon, authenticated, public;
grant select on public.account_profiles to authenticated;

-- ───────────── 19b: sign-up gate + profile writer ─────────────
create or replace function public.signup_dob(meta jsonb)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  return (meta ->> 'date_of_birth')::date;
exception when others then
  return null;
end;
$$;

create or replace function public.enforce_signup_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dob  date  := public.signup_dob(meta);
begin
  if dob is null or dob < date '1900-01-01' or dob > current_date then
    raise exception 'signup_requires_valid_date_of_birth';
  end if;
  if age(current_date, dob) < interval '18 years' then
    raise exception 'signup_requires_age_18';
  end if;
  if (meta ->> 'age_confirmed') is distinct from 'true' then
    raise exception 'signup_requires_age_confirmation';
  end if;
  if (meta ->> 'account_type') not in ('patient', 'practitioner', 'researcher')
     or (meta ->> 'account_type') is null then
    raise exception 'signup_requires_account_type';
  end if;
  if nullif(btrim(meta ->> 'first_name'), '') is null
     or nullif(btrim(meta ->> 'last_name'), '') is null then
    raise exception 'signup_requires_name';
  end if;
  return new;
end;
$$;

create or replace function public.create_account_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  npi  text  := nullif(btrim(meta ->> 'npi'), '');
begin
  insert into public.account_profiles (
    user_id, account_type, first_name, last_name, date_of_birth,
    country, postal_code, phone, npi_claimed, profession, organization, research_area
  ) values (
    new.id,
    meta ->> 'account_type',
    left(btrim(meta ->> 'first_name'), 80),
    left(btrim(meta ->> 'last_name'), 80),
    public.signup_dob(meta),
    nullif(upper(btrim(meta ->> 'country')), ''),
    left(nullif(btrim(meta ->> 'postal_code'), ''), 16),
    left(nullif(btrim(meta ->> 'phone'), ''), 32),
    case when meta ->> 'account_type' = 'practitioner' and npi ~ '^\d{10}$' then npi end,
    left(nullif(btrim(meta ->> 'profession'), ''), 80),
    left(nullif(btrim(meta ->> 'organization'), ''), 160),
    left(nullif(btrim(meta ->> 'research_area'), ''), 160)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.enforce_signup_requirements() from public, anon, authenticated;
revoke execute on function public.create_account_profile()     from public, anon, authenticated;
revoke execute on function public.signup_dob(jsonb)            from public, anon, authenticated;

drop trigger if exists on_auth_user_signup_gate on auth.users;
create trigger on_auth_user_signup_gate
  before insert on auth.users
  for each row execute function public.enforce_signup_requirements();

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_account_profile();

-- Existing accounts (3 at 2026-10-18) predate the gate and have no profile row;
-- the app treats a missing row as "nothing on file".
