-- Phase 21a — Learn: tables (docs/learn.md §6)
-- Destination: db/phase21a_learn_tables.sql
-- Study items (flashcards, MCQs), collections, per-learner scheduling state, review log.
-- Official content is written only by SECURITY DEFINER generators / admin RPCs (21b, 21c).

create table if not exists public.learn_items (
  id uuid primary key default gen_random_uuid(),
  natural_key text unique,
  item_type text not null check (item_type in ('flashcard','mcq')),
  template_key text,
  generation_method text not null check (generation_method in ('template','llm_draft','authored','user')),

  owner_id uuid references auth.users(id) on delete cascade,
  is_official boolean not null default false,
  status text not null default 'draft' check (status in ('draft','review_needed','published','archived')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  forked_from_item_id uuid references public.learn_items(id) on delete set null,
  forked_from_version int,
  content_version int not null default 1,
  version_change_note text,

  subject_area text not null,
  topic text not null,
  subtopic text,
  jurisdiction text,
  difficulty_level smallint default 2 check (difficulty_level between 1 and 3),
  learning_objective text,
  tags text[] not null default '{}',
  primary_pcid bigint references public.entities(pcid) on update cascade on delete set null,

  prompt text not null,
  concise_answer text not null,
  clinical_rationale text,
  clinical_caveats text,
  personal_note text,
  mcq_options jsonb,

  source_kind text not null check (source_kind in ('list','label','statement','reference','authored')),
  source_list_pcid bigint references public.lists(pcid) on delete set null,
  statement_id bigint references public.clinical_statements(statement_id) on delete set null,
  reference_id text references public.references_resources(id) on delete set null,
  label_setid text,
  label_loinc text,
  label_effective_time text,
  source_quote text,
  source_agency text,
  source_citation text not null check (length(btrim(source_citation)) > 0),
  source_section text,
  source_url text,
  last_verified_at date default current_date,
  license text not null default 'CC0-1.0',
  third_party_sources text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learn_items_owner_chk check ((is_official and owner_id is null) or (not is_official and owner_id is not null)),
  constraint learn_items_method_chk check ((is_official and generation_method <> 'user') or (not is_official and generation_method = 'user')),
  constraint learn_items_mcq_chk check (
    item_type = 'flashcard'
    or coalesce(
         jsonb_typeof(mcq_options) = 'array'
         and jsonb_array_length(mcq_options) between 2 and 6
         and jsonb_array_length(jsonb_path_query_array(mcq_options, '$[*] ? (@.is_correct == true)')) = 1,
         false)),
  constraint learn_items_review_chk check (
    not (is_official and status = 'published' and generation_method in ('llm_draft','authored') and reviewed_by is null)),
  constraint learn_items_quote_chk check (generation_method <> 'llm_draft' or source_quote is not null)
);
create index if not exists learn_items_pub_idx   on public.learn_items (is_official, status);
create index if not exists learn_items_owner_idx on public.learn_items (owner_id) where owner_id is not null;
create index if not exists learn_items_pcid_idx  on public.learn_items (primary_pcid) where primary_pcid is not null;
create index if not exists learn_items_topic_idx on public.learn_items (subject_area, topic);
create index if not exists learn_items_list_idx  on public.learn_items (source_list_pcid) where source_list_pcid is not null;
create index if not exists learn_items_template_idx on public.learn_items (template_key) where template_key is not null;

create table if not exists public.learn_item_entities (
  item_id uuid not null references public.learn_items(id) on delete cascade,
  pcid bigint not null references public.entities(pcid) on update cascade on delete cascade,
  role text not null default 'related' check (role in ('primary','related')),
  primary key (item_id, pcid)
);
create index if not exists learn_item_entities_pcid_idx on public.learn_item_entities (pcid);

create table if not exists public.learn_collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  description text,
  subject_area text not null,
  topic text,
  owner_id uuid references auth.users(id) on delete cascade,
  is_official boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_list_pcid bigint references public.lists(pcid) on delete set null,
  template_keys text[] not null default '{}',
  sort_order int not null default 0,
  forked_from_collection_id uuid references public.learn_collections(id) on delete set null,
  forked_from_version int,
  collection_version int not null default 1,
  excluded_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learn_collections_owner_chk check ((is_official and owner_id is null) or (not is_official and owner_id is not null))
);
create index if not exists learn_collections_pub_idx   on public.learn_collections (is_official, status);
create index if not exists learn_collections_owner_idx on public.learn_collections (owner_id) where owner_id is not null;
create index if not exists learn_collections_list_idx  on public.learn_collections (source_list_pcid) where source_list_pcid is not null;

create table if not exists public.learn_collection_items (
  collection_id uuid not null references public.learn_collections(id) on delete cascade,
  item_id uuid not null references public.learn_items(id) on delete cascade,
  sort_order int not null default 0,
  section_label text,
  added_at timestamptz not null default now(),
  primary key (collection_id, item_id)
);
create index if not exists learn_collection_items_item_idx on public.learn_collection_items (item_id);

create table if not exists public.learn_user_item_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.learn_items(id) on delete cascade,
  state text not null default 'new' check (state in ('new','learning','review','relearning')),
  stability double precision not null default 0,
  difficulty double precision not null default 5,
  reps int not null default 0,
  lapses int not null default 0,
  mcq_attempts int not null default 0,
  mcq_correct int not null default 0,
  last_rating smallint check (last_rating between 1 and 4),
  last_reviewed_at timestamptz,
  due_at timestamptz not null default now(),
  last_seen_item_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists learn_state_due_idx on public.learn_user_item_state (user_id, due_at);

create table if not exists public.learn_review_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.learn_items(id) on delete cascade,
  collection_id uuid references public.learn_collections(id) on delete set null,
  client_event_id uuid not null,
  study_mode text not null check (study_mode in ('due_queue','flashcard','mcq_practice','mcq_test')),
  rating smallint not null check (rating between 1 and 4),
  is_correct boolean,
  selected_option_id text,
  was_unsure boolean not null default false,
  duration_ms int,
  scheduler_version text not null default 'fsrs-5.0',
  state_before jsonb,
  state_after jsonb,
  item_version_seen int not null default 1,
  reviewed_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);
create index if not exists learn_events_user_time_idx on public.learn_review_events (user_id, reviewed_at desc);
create index if not exists learn_events_item_idx on public.learn_review_events (item_id);

create table if not exists public.learn_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_new_per_day int not null default 20 check (max_new_per_day between 0 and 500),
  max_reviews_per_day int not null default 100 check (max_reviews_per_day between 0 and 2000),
  cover_options boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.learn_items is 'Learn flashcards and MCQs. Official rows (is_official) are written only by SECURITY DEFINER generators / admin RPCs; template rows are rebuildable from lists/classes/brands via natural_key. Personal rows are owner-only. docs/learn.md.';
comment on table public.learn_user_item_state is 'Per-learner FSRS scheduling state, keyed (user_id, item_id) — never by collection.';
comment on table public.learn_review_events is 'Append-only review log; replayable. client_event_id makes guest-progress sync idempotent.';

alter table public.learn_items            enable row level security;
alter table public.learn_item_entities    enable row level security;
alter table public.learn_collections      enable row level security;
alter table public.learn_collection_items enable row level security;
alter table public.learn_user_item_state  enable row level security;
alter table public.learn_review_events    enable row level security;
alter table public.learn_user_settings    enable row level security;
