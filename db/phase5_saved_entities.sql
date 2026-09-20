-- ============================================================================
-- Pharmacy Commons — saved PCID pages
--
-- Lets a signed-in user bookmark a drug page (any PCID entity: moiety,
-- precise form, combination) for quick return later. Purely a per-user
-- reading-list feature — it does not touch entities, revisions, or anything
-- else in the moderation pipeline, and it is not gated on NPI verification
-- (bookmarking is not contribution).
--
-- Denormalizes name/slug/entity_type alongside pcid_code so the account
-- page's saved list can render without a join back to entities on every
-- load, and still shows something sensible if a slug is ever renamed
-- (though the app should keep this row's slug in sync when that happens).
--
-- Already applied directly to Supabase as migration `phase5_saved_entities`
-- on 2026-09-20 — this file mirrors it for the record, per this project's
-- existing db/ convention. Do not re-run unless the live migration is
-- somehow missing.
-- ============================================================================

CREATE TABLE saved_entities (
    user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    pcid_code       TEXT NOT NULL,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    entity_type     TEXT,
    saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, pcid_code)
);

COMMENT ON TABLE saved_entities IS
    'Per-user bookmarks of PCID pages. Not gated on NPI verification — '
    'saving a page is not contribution. Fully owned by the client: RLS '
    'lets a user read/insert/delete only their own rows.';

CREATE INDEX saved_entities_user_saved_at_idx ON saved_entities (user_id, saved_at DESC);

ALTER TABLE saved_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_own ON saved_entities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY insert_own ON saved_entities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY delete_own ON saved_entities FOR DELETE
    USING (auth.uid() = user_id);
