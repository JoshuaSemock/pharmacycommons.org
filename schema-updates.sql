-- ============================================================================
-- Pharmacy Commons — Schema updates reconciling Drug_Matrix with the Figma UI
-- Companion to docs/data-model-decisions.md
--
-- These are additive ALTER/CREATE statements meant to run against the
-- existing pharmacy_commons_schema.sql base. Table/column names referencing
-- the existing schema (api, pin, frm, frm_api_junction, etc.) are written
-- generically — adjust to match your actual table names before running.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Decision 4: UID → slug mapping layer
-- ----------------------------------------------------------------------------
-- Add a stable, unique, URL-safe slug to each UID tier so the frontend never
-- has to expose or route on raw API-XXXX / PIN-XXXX / FRM-XXXX values.

ALTER TABLE api ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE pin ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE frm ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Recommended: generate slugs via application code (name → kebab-case, with
-- a numeric suffix appended on collision) rather than a DB trigger, so
-- collision handling and stopword rules are easy to evolve. Enforce
-- NOT NULL once backfilled:
-- ALTER TABLE api ALTER COLUMN slug SET NOT NULL;
-- ALTER TABLE pin ALTER COLUMN slug SET NOT NULL;
-- ALTER TABLE frm ALTER COLUMN slug SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_slug ON api (slug);
CREATE INDEX IF NOT EXISTS idx_pin_slug ON pin (slug);
CREATE INDEX IF NOT EXISTS idx_frm_slug ON frm (slug);


-- ----------------------------------------------------------------------------
-- Decision 1: Combination products — multi-ingredient formulations
-- ----------------------------------------------------------------------------
-- If a many-to-many FRM↔API junction table doesn't already exist, add one.
-- Each row represents one active ingredient within one formulation, so
-- combination products list every component instead of a single parent.

CREATE TABLE IF NOT EXISTS frm_api_junction (
    frm_uid     TEXT NOT NULL REFERENCES frm (uid) ON DELETE CASCADE,
    api_uid     TEXT NOT NULL REFERENCES api (uid) ON DELETE CASCADE,
    role_note   TEXT, -- e.g. 'Beta-lactamase inhibitor', 'Abuse-deterrent additament'
    PRIMARY KEY (frm_uid, api_uid)
);

CREATE INDEX IF NOT EXISTS idx_frm_api_junction_api ON frm_api_junction (api_uid);
CREATE INDEX IF NOT EXISTS idx_frm_api_junction_frm ON frm_api_junction (frm_uid);

-- Query pattern for the API layer: given an API uid, find every formulation
-- (and its co-ingredients) that references it, so both diphenoxylate's page
-- and atropine's page can show the shared Lomotil formulation reciprocally:
--
-- SELECT f.*, j2.api_uid AS co_ingredient_uid, a2.name AS co_ingredient_name
-- FROM frm_api_junction j1
-- JOIN frm f ON f.uid = j1.frm_uid
-- JOIN frm_api_junction j2 ON j2.frm_uid = f.uid AND j2.api_uid != j1.api_uid
-- JOIN api a2 ON a2.uid = j2.api_uid
-- WHERE j1.api_uid = :target_api_uid;


-- ----------------------------------------------------------------------------
-- Decision 2: Drug-to-drug interactions as linked records
-- ----------------------------------------------------------------------------
-- Interactions link two Drug_Matrix entries (drugs OR substances — see the
-- entry_type column below). Interactions described at the level of a drug
-- CLASS (e.g. "NSAIDs") are NOT modeled here; they remain free text in the
-- clinical data layer since a drug class isn't a single API/PIN/FRM record.

CREATE TABLE IF NOT EXISTS drug_interactions (
    id              BIGSERIAL PRIMARY KEY,
    api_uid_1       TEXT NOT NULL REFERENCES api (uid) ON DELETE CASCADE,
    api_uid_2       TEXT NOT NULL REFERENCES api (uid) ON DELETE CASCADE,
    severity        TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major')),
    mechanism       TEXT NOT NULL,
    source_citation_id BIGINT, -- FK into the existing polymorphic source citations table
    CHECK (api_uid_1 <> api_uid_2),
    -- Prevent storing both (A,B) and (B,A) as separate rows.
    CONSTRAINT unique_interaction_pair UNIQUE (
        LEAST(api_uid_1, api_uid_2),
        GREATEST(api_uid_1, api_uid_2)
    )
);

CREATE INDEX IF NOT EXISTS idx_drug_interactions_1 ON drug_interactions (api_uid_1);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_2 ON drug_interactions (api_uid_2);

-- Query pattern: interactions for a given drug, regardless of which side of
-- the pair it was stored on:
--
-- SELECT di.*, 
--        CASE WHEN di.api_uid_1 = :target THEN di.api_uid_2 ELSE di.api_uid_1 END AS other_uid
-- FROM drug_interactions di
-- WHERE :target IN (di.api_uid_1, di.api_uid_2);


-- ----------------------------------------------------------------------------
-- Decision 2 (cont.): Distinguish prescribable drugs from modeled substances
-- ----------------------------------------------------------------------------
-- Alcohol, iodinated contrast media, etc. are added as real API entries so
-- interactions can link to them, but they aren't prescribable and shouldn't
-- appear in general browse/search or carry a schedule badge like Rx/OTC.

ALTER TABLE api ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'drug'
    CHECK (entry_type IN ('drug', 'substance'));

CREATE INDEX IF NOT EXISTS idx_api_entry_type ON api (entry_type);

-- The API layer should filter entry_type = 'substance' out of default
-- search/browse queries (already done client-side in SearchView.tsx as an
-- interim measure; move this filter server-side once the API layer exists).


-- ----------------------------------------------------------------------------
-- Decision 3: Chemical classification stays multi-valued; extensible tags
-- ----------------------------------------------------------------------------
-- No change needed if chemical_class was already modeled as M2M alongside
-- mechanism and physiologic_effect. If it was previously a single FK/column
-- on the API table, migrate it to a junction table:

-- CREATE TABLE IF NOT EXISTS api_chemical_class_junction (
--     api_uid           TEXT NOT NULL REFERENCES api (uid) ON DELETE CASCADE,
--     chemical_class_id BIGINT NOT NULL REFERENCES chemical_class (id) ON DELETE CASCADE,
--     PRIMARY KEY (api_uid, chemical_class_id)
-- );

-- Escape hatch for drug classes needing more than the 3 core dimensions.
-- Lightweight free-text tags; promote to a first-class dimension only if a
-- real pattern of use emerges (no current entry needs this yet).

CREATE TABLE IF NOT EXISTS api_additional_tags (
    api_uid TEXT NOT NULL REFERENCES api (uid) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (api_uid, tag)
);
