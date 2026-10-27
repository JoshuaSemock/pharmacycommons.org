# Pharmacy Commons Learn — working specification (v3, 2026-10-27)

**Destination:** `docs/learn.md` in `JoshuaSemock/pharmacycommons.org`. This replaces the earlier "v2.0 Gemini Reviewed" draft.
**Owner / decisions:** Joshua Semock, PharmD. **Implementer:** Claude.

Learn (`/learn`) is a source-attributed study workspace: flashcards and single-best-answer questions, scheduled with spaced repetition, built mostly from data Pharmacy Commons already holds. It follows the platform principle humans → machines → humans: every official item points to a PCID and to its source, and the learner sees both.

---

## 0. Decisions for Joshua (ask before the phase that needs them)

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| D1 | **License of Learn content.** Site-authored content is CC0, but items built from third-party lists inherit those terms (Do Not Crush cites MPR and Pharmacist's Letter; ACB scale is from Indiana University; ATC and ChemOnt restrict commercial redistribution). Joshua also plans paid test prep. | Before Phase 1b publishes anything | Each item carries `license` and `third_party_sources`, copied from `lists.license` / `lists.source_citation`. Items with non-commercial or unclear terms stay out of any future paid tier until cleared. |
| D2 | **Item keys.** PCID is the only native key (CLAUDE.md). Items are not entities, so this spec gives them UUIDs and links to entities through a junction table. | Before Phase 1a | Keep UUIDs for items. Do not mint PCIDs for study items. |
| D3 | **Personal sets: private or public?** Joshua's lists feature is public-only. The earlier draft made personal study sets private. | Before Phase 2 | Private for now. Public sharing needs moderation, a PHI rule and a medical-accuracy review. |
| D4 | **LLM-drafted items.** The earlier draft banned them. | Before Phase 2 | Allow drafting only as `review_needed`, with a verbatim source quote that is machine-checked, and only publish after Joshua approves (section 8). No generation in the learner's path. |
| D5 | **Free vs paid tiers / scholarships.** | Before any launch announcement | The schema stays neutral. Do not build tiers now. Do not make choices that block them. |
| D6 | **FSRS: dependency or port.** `ts-fsrs` is MIT and compatible with GPL-3.0. | Before Phase 1c | Port or wrap; either way, verify against the reference implementation's test vectors. |
| D7 | **Privacy policy.** Study history is a new kind of user data. | Before Phase 1c ships | Review `docs/privacy-policy.md`. If the Effective Date changes, bump `LEGAL_VERSION` in `src/legal.ts`. |

---

## 1. Principles

1. **Provenance on every official item.** No item is published without `source_citation`. Where possible it also carries a list, label, statement or reference pointer.
2. **Generate from data, hand-write only what data can't give.** Thousands of recall items come from `lists`/`list_items`, classes and brands by SQL template. Reasoning-heavy items (vignettes, guidelines, calculations) are authored or drafted, then reviewed.
3. **Official content is immutable to learners.** Editing an official item forks it (fork-on-write).
4. **Study state belongs to the learner and the item,** not the collection.
5. **Zero-friction start.** Signed-out users can study official collections; progress lives in `localStorage` until sign-in.
6. **No PHI.** Personal authoring shows a clear warning not to enter patient identifiers.
7. **Derived data is rebuilt, not edited.** Template-generated items are regenerated from their sources (same rule as `moiety_hierarchy` and `class_members`).

## 2. Non-goals

Public or shared user sets; timed exam simulation; runtime LLM generation; paid tiers or scholarship logic; a WYSIWYG card editor (plain text plus the existing `[[link]]` style only); a second citation system.

---

## 3. Routes and UI

Register in `src/App.tsx` as `lazy()` routes and add `learn` to `scripts/postbuild.mjs` (static routes get `dist/<route>.html` and a sitemap entry). Add an entry to `src/updates.ts` when shipped.

| Route | File | Purpose |
|---|---|---|
| `/learn` | `src/pages/Learn.tsx` | Due-today card, official collections (filter by type, topic, list), My sets, weak-area table |
| `/learn/study/:collectionId` and `/learn/study/due` | `src/pages/LearnSession.tsx` | Study canvas. Modes: `due`, `flashcards`, `practice`. (`test` is Phase 3.) `due` is reserved and is never a collection id. |
| `/learn/build`, `/learn/build/:collectionId` | `src/pages/LearnBuilder.tsx` | Customize a set, author personal items (Phase 2) |

Drug pages and list pages get a pill, "Study this topic (N items)", only when published official items exist for that PCID or list (RPC in section 6).

**Conventions to follow (verify paths before writing):**
- Read `docs/design-system.md` first. Use the existing `Button`, `Card`, `Stamp`, `PaperSelect`. No native `<select>`, no new fonts or colors. IBM Plex Sans Condensed throughout; Mono only for codes and IDs.
- Match the mobile navigation spec (thumb-zone bottom nav). A sticky study action bar must sit above the bottom nav and not overflow horizontally. Tap targets are at least 44px.
- Import Supabase via `getSupabase()` (`src/db.ts`), never statically, so the SDK stays out of the first-load bundle.
- Code style: TypeScript, no `any`, default-export components, single quotes and no semicolons to match the repo, double quotes only for strings containing apostrophes. Do **not** run `pnpm format` (oxfmt 0.2 corrupts code).
- Learner code lives in `src/learn/` (`scheduler.ts`, `queue.ts`, `shuffle.ts`, `guest.ts`, `api.ts`, `types.ts`), with tests as `src/learn/*.test.ts`. Tests mock `@/supabaseClient` offline, as `tests/api.test.ts` does.

---

## 4. Study loop

**Flashcard:** prompt → Reveal (`Space`) → layered answer inside `aria-live="polite"`: answer, why it matters, caveats, source footer with entity chip → rate 1 Again / 2 Hard / 3 Good / 4 Easy (keys `1`–`4`), with the next interval shown on each button.

**Question (MCQ):** stem and 3–5 options, shuffled with a seeded PRNG (user id + item id + attempt number) so position can't be memorized. A "cover options until clicked" toggle forces recall first. Two submit buttons: **Submit** (`Enter`) and **Submit, unsure** (`Shift+Enter`). Feedback shows the keyed answer, the rationale, a rationale under *every* option (why it's wrong, or when it would be right), and the source footer.

**Scheduler:** FSRS-5 with default weights, in `src/learn/scheduler.ts`, pure and unit-tested. Per `(user, item)`: state (`new|learning|review|relearning`), stability, difficulty, reps, lapses, due.

MCQ grade translation:
- wrong → Again
- right but unsure → Hard
- right and confident → Good
- Easy is not offered on an MCQ's first review

The 0.75× "recognition factor" on first-review MCQ stability is an **unvalidated heuristic.** Make it a named constant in one place, and log every event with `scheduler_version` and state before/after so it can be tuned from real data.

**Daily queue:** defaults 100 reviews and 20 new per day (user-adjustable). Order: learning/relearning due now → overdue reviews, most overdue first → new items interleaved. Cram mode is always available outside the queue.

**Guest mode:** state in `localStorage` key `pc_learn_guest_v1`. On sign-in, replay guest events in time order through `learn_record_review` (each has a `client_event_id`, so re-sync cannot double-count). Events older than the server's `last_reviewed_at` for that item are logged but do not change its state.

---

## 5. Content generation

### 5.1 Item sources and how they are made

| `generation_method` | Source | Rebuildable | Review needed before publish |
|---|---|---|---|
| `template` | SQL generator over `lists`, `list_items`, `class_members`, brand data | Yes | Sample audit per template (below) |
| `llm_draft` | `label_section_text` / `label_sections`, guidelines | No | Every item, by Joshua |
| `authored` | Joshua | No | Joshua is the author; second look optional |
| `user` | A learner (Phase 2) | n/a | Private to the owner |

### 5.2 Phase 1 template catalogue

Inspect each source's real shape before writing its generator, and report what you found. Known: `list_items` has `member_pcid`, `term_id`, `rank`, `position`, `value`, `legal_status`, `note`, `source_name`, `sources`; `lists` has `status_label`, `measure_label`, `license`, `source_citation`, `published`. Do Not Crush reasons are in `legal_status`; brand/form is in `note`. Joint Commission terms are `term_id` rows (no `member_pcid`).

| Template | Source | Card |
|---|---|---|
| `list_member_mcq` | Do Not Crush, Arrhythmia risk (Long QT, Brugada), Anticholinergic Burden | "Which of these is on {list}?" One member, three non-members. |
| `dnc_reason` | `do-not-crush` + 6 reason sub-lists | "Why shouldn't {drug/form} be crushed?" The options are the reason categories. |
| `acb_score` | `anticholinergic-burden-score-1/2/3` | "What is the ACB score of {drug}?" |
| `class_of` | `class_members` for core moieties (inspect `class_type` values first) | "{drug} belongs to which class?" Distractors are sibling classes of the same `class_type`. |
| `brand_generic` (both directions) | `rxnorm_brands` / `entity_brand_names`, scoped to Notable Drugs and Most-used | Single-ingredient brands only. |
| `jc_dnu` | `joint-commission-do-not-use` (19 terms) | Term → why it is unsafe and the preferred form (from `note`). |
| `mpje_controlled` | `georgia-mpje-controlled-substances` (405) | "What is the Georgia schedule for {drug}?" Items carry `jurisdiction = 'US-GA'`. Joshua's own compilation. |

### 5.3 Generator quality gates (each is an acceptance criterion)

1. **Negative-set validation.** No distractor may also satisfy the stem. Check the actual list or class membership by query, including sub-lists and synonyms. Fail the item, not the batch.
2. **Distractors are plausible.** Prefer same-`class_type` siblings or same-category drugs, not random drugs.
3. **Core moieties only.** Only moieties with `term_type = 'Core moiety'` that appear in `catalog_entries`. Skip salts, brands-as-moieties, combinations, and rows with a `synonym_of_pcid` that duplicates the answer.
4. **Published lists only** (`lists.published`).
5. **Idempotent.** Each item has a stable `natural_key` (e.g. `dnc_reason:{list_pcid}:{member_pcid}`). Re-running updates changed payloads, bumps `content_version`, and never duplicates.
6. **Provenance filled.** `source_citation` from `lists.source_citation`, falling back to "Pharmacy Commons list: {title}". `license` and `third_party_sources` copied from the list.
7. **Counts reported** per template: generated, rejected by each gate, published.
8. **Joshua's sample audit.** 50 random items per template exported to a sheet. A template publishes only after he approves the sample.

### 5.4 Initial official collections

One collection per list or template (Do Not Crush; Arrhythmia risk; Anticholinergic burden; Joint Commission Do Not Use; Georgia MPJE controlled substances; Brand ↔ Generic for Notable Drugs). Sub-lists become `section_label`s so learners can include or exclude them when customizing.

---

## 6. Database (`db/phase21*.sql`)

**Numbering:** phases 18–20 are used. Use `phase21a_learn_tables`, `21b_learn_rls_rpcs`, `21c_learn_generators`, `21d_learn_seed_collections`. Apply with `apply_migration`, mirror into `db/`, then **confirm in `supabase_migrations.schema_migrations` before writing "applied" anywhere.** Run `get_advisors` (security) after each DDL migration. Drop and add constraints in separate migrations. CHECK constraints cannot contain subqueries; use triggers.

**Pre-flight:** confirm these types against the live database. `entities.pcid`, `lists.pcid` and `list_items.member_pcid` are `bigint`; `clinical_statements.statement_id` is `bigint`; `references_resources.id` is `text`; `user_roles.role` is `text`; role helpers are `has_role(text)`, `pc_has_role(uuid, text)`, `pc_is_blocked()`.

```sql
-- db/phase21a_learn_tables.sql
create table if not exists public.learn_items (
  id uuid primary key default gen_random_uuid(),
  natural_key text unique,                      -- template items only; makes generators idempotent
  item_type text not null check (item_type in ('flashcard','mcq')),
  template_key text,
  generation_method text not null check (generation_method in ('template','llm_draft','authored','user')),

  owner_id uuid references auth.users(id) on delete cascade,   -- null = official
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
  jurisdiction text,                            -- e.g. 'US-GA' for MPJE items
  difficulty_level smallint default 2 check (difficulty_level between 1 and 3),
  learning_objective text,
  tags text[] not null default '{}',
  primary_pcid bigint references public.entities(pcid) on update cascade on delete set null,

  prompt text not null,
  concise_answer text not null,
  clinical_rationale text,
  clinical_caveats text,
  personal_note text,                           -- personal items only; no PHI
  mcq_options jsonb,                            -- [{id, text, is_correct, rationale}]

  -- provenance
  source_kind text not null check (source_kind in ('list','label','statement','reference','authored')),
  source_list_pcid bigint references public.lists(pcid) on delete set null,
  statement_id bigint references public.clinical_statements(statement_id) on delete set null,
  reference_id text references public.references_resources(id) on delete set null,
  label_setid text, label_loinc text, label_effective_time text,
  source_quote text,                            -- verbatim span; required for llm_draft
  source_agency text,
  source_citation text not null,
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
    or (jsonb_typeof(mcq_options) = 'array'
        and jsonb_array_length(mcq_options) between 2 and 6
        and jsonb_array_length(jsonb_path_query_array(mcq_options, '$[*] ? (@.is_correct == true)')) = 1)),
  constraint learn_items_review_chk check (
    not (is_official and status = 'published' and generation_method in ('llm_draft','authored') and reviewed_by is null)),
  constraint learn_items_quote_chk check (generation_method <> 'llm_draft' or source_quote is not null)
);
create index if not exists learn_items_pub_idx   on public.learn_items (is_official, status);
create index if not exists learn_items_owner_idx on public.learn_items (owner_id) where owner_id is not null;
create index if not exists learn_items_pcid_idx  on public.learn_items (primary_pcid) where primary_pcid is not null;
create index if not exists learn_items_topic_idx on public.learn_items (subject_area, topic);
create index if not exists learn_items_list_idx  on public.learn_items (source_list_pcid) where source_list_pcid is not null;

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
  source_list_pcid bigint references public.lists(pcid) on delete set null,   -- official, template-built sets
  template_keys text[] not null default '{}',
  forked_from_collection_id uuid references public.learn_collections(id) on delete set null,
  forked_from_version int,
  collection_version int not null default 1,
  excluded_item_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learn_collections_owner_chk check ((is_official and owner_id is null) or (not is_official and owner_id is not null))
);

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
```

**RLS and access** (`phase21b`). RLS on all tables.
- **Read:** `learn_items` and `learn_collections` are readable by `anon` and `authenticated` where `is_official and status = 'published'`, or `owner_id = auth.uid()`. `learn_collection_items` and `learn_item_entities` follow the parent item or collection. `learn_user_item_state`, `learn_review_events` and `learn_user_settings` are owner-only.
- **Personal writes:** direct owner-only policies, with `WITH CHECK (not is_official and owner_id = auth.uid())`. This follows the `saved_entities` precedent, since the data is purely personal. Also block users for whom `pc_is_blocked()` is true. Add a trigger capping personal items per user (default 2,000) and a plain-text check that rejects HTML tags.
- **Official writes:** no policy for anyone. Generators, publishing and review run as SECURITY DEFINER functions gated by `has_role('admin')`, or by the service role.
- **Every SECURITY DEFINER function:** `set search_path = public`, and `revoke execute ... from public, anon, authenticated` unless it is a deliberate public RPC. Treat new advisor findings as blocking.

**RPCs** (`phase21b`):
- `learn_record_review(...)`, SECURITY INVOKER, owner-only. In one transaction: insert the event (idempotent on `client_event_id`), upsert `learn_user_item_state`, return the new state. The client computes the FSRS result; the server records it, with `scheduler_version`.
- `learn_items_for_pcid(p_pcid bigint)` and `learn_items_for_list(p_slug text)`: public, return counts of published official items for the study pill.
- `learn_collection_counts` view, `security_invoker = true`: flashcard and MCQ counts per collection.
- `learn_publish_items(p_ids uuid[])`, `learn_review_items(...)`: admin only.
- (Phase 2) `learn_fork_item(p_item uuid, p_collection uuid, p_changes jsonb)`, SECURITY INVOKER: clones an official item into a personal one and swaps it into the learner's collection.

---

## 7. Phases

**Step 0: pre-flight (report before coding).** Read `CLAUDE.md`, `docs/design-system.md`, the newest `db/phase*.sql`. Verify live row counts with `count(*)` (not `list_tables`) for `lists`, `list_items`, `class_members`, `entities`. Check `list_migrations`, `get_advisors`. Confirm the column types in section 6. Inspect the actual values of `class_members.class_type`, `list_items.legal_status`, and the contents of the Georgia MPJE "Exceptions" list. Report anything that disagrees with this spec.

**Phase 1a: schema.** 21a/21b, advisors clean, SQL tests in `db/learn_test/` (RLS isolation, constraints, `learn_record_review` idempotency, official rows unwritable by users).
**Phase 1b: generators.** 21c: one SQL function per template, then the audit sheet per 5.3. Do not publish until Joshua approves each sample.

*Status 2026-10-27:* 21c (generators), 21d (draft collections), 21e (audit fixes) applied. Built: `dnc_member`, `dnc_reason` (+`_mcq`), `acb_score`, `acb_highest`, `arrhythmia_condition`, `mpje_schedule`, `jc_dnu` = 1,334 draft items in 5 official collections, all `draft`. `class_of` (581) and `brand_generic` (465) added 2026-10-27 (21f/21g; 21f's functions were applied by migration and its seed block run via SQL, 21g supersedes both functions), bringing the total to 2,380 draft items in 7 collections. Remaining ambiguity to audit: EPC superclass pairs whose names do not nest (e.g. nicotine: Cholinergic Nicotinic Agonist vs Cholinergic Receptor Agonist). Known limits for the audit: (1) Do Not Crush distractors are checked against the list, not against pharmacology, so hazardous drugs missing from the list (e.g. methotrexate) can appear as "wrong" options; (2) the ACB and Joint Commission items carry `third_party_sources` (D1); (3) some arrhythmia rows look questionable at source (e.g. diltiazem under Long QT) and should be checked in the list, not in the generator. Tests: `db/learn_test/tests_21c.sql`.
**Phase 1c: study loop.** `src/learn/*`, `LearnSession.tsx`, guest mode and sync.

*Status 2026-10-27 (1c built, unpublished):* `src/learn/` holds `scheduler.ts` (FSRS-5 port, checked against py-fsrs 5.1.0 fixtures in `fsrs.fixtures.ts`), `queue.ts`, `shuffle.ts`, `guest.ts`, `api.ts`, `useProgress.ts`; pages `Learn.tsx` and `LearnSession.tsx`; routes `/learn`, `/learn/study/:collectionId` (`due` = cross-collection review queue). `db/phase21h_learn_step.sql` (applied; adds `learn_user_item_state.step` and stores it in `learn_record_review`). Regenerate the fixtures with `scripts/gen-fsrs-fixtures.py` (`pip install fsrs==5.1.0`; it prints the JSON that becomes `fsrs.fixtures.ts`). Study links (`src/components/StudyLinks.tsx`) now show on drug pages (Lists section) and list pages once a collection is published. Not built yet, from sections 3 and 4: next-interval preview on the rating buttons, the "cover options" toggle, Shift+Enter "submit, unsure" (the session has an "I'm not sure" checkbox instead), cram mode, session seed from user id + attempt (a per-session random seed is used), the test-mode path. **Nothing is visible to learners until a collection is published** (`/learn` says none are published); the nav link and the What's new entry wait for that.
**Phase 1d: hub and integration.** `Learn.tsx`, study pills on drug and list pages, nav entry, `postbuild.mjs`, `src/updates.ts`, this doc, `CLAUDE.md` routes and status, `docs/design-system.md` if new components are added, privacy-policy review (D7).

**Phase 2:** builder (include/exclude by section, topic or item type); personal authoring with the PHI warning; fork-on-write with `forked_from_version`; label-derived LLM drafts with the review workflow (section 8); a small authored clinical-reasoning set (e.g. type 2 diabetes pharmacotherapy). Weak-area view by pharmacologic class using `learn_item_entities` and `class_members`.

**Phase 3:** timed test mode with deferred feedback; upstream-change badges ("N new items in the official set", "official item updated since you customized it"), driven by `collection_version` and `content_version`.

**Later, needs Joshua:** public sets (D3), tiers or scholarships (D5).

## 8. LLM-draft workflow (Phase 2)

1. Choose scope: core moieties on Notable Drugs, and label sections such as Indications, Boxed Warning, Contraindications.
2. Draft in a working session, not at runtime. Each draft supplies stem, answer, per-option rationales, and a `source_quote`.
3. A script verifies that `source_quote` appears verbatim in the stored section text, records `label_setid`, `label_loinc` and `label_effective_time`, and rejects anything that fails.
4. Rows land as `review_needed`. Joshua reviews batches in a sheet (approve / edit / reject); Claude loads the decisions and calls `learn_publish_items`.
5. When a label's effective time changes, affected items go back to `review_needed`.

## 9. Acceptance criteria

- `pnpm test` and `pnpm build` pass; `/learn` returns HTTP 200 from a static `dist/learn.html`.
- **Scheduler:** Again lowers stability and gives a short interval; Easy > Good > Hard intervals; repeated Good reviews raise stability monotonically; MCQ wrong → Again, right-unsure → Hard; results match the reference implementation's vectors.
- **Isolation:** a user cannot read another user's items, state or events, cannot write an official row, and cannot set `is_official`; official items never change when a personal copy is edited.
- **Generators:** every gate in 5.3 holds on every published item; re-running creates no duplicates; per-template counts reported.
- **Sync:** replaying the same guest events twice changes nothing.
- **Provenance:** every published official item has a non-empty `source_citation`; every `llm_draft` has a verified `source_quote`.
- **UI:** study flow works by keyboard alone; answer reveal is announced to screen readers; no horizontal overflow at 375px; action bar clears the bottom nav.
