-- ============================================================================
-- Pharmacy Commons — NPI provider verification
--
-- Gates CONTRIBUTION, not registration: any authenticated user can sign in,
-- but submitting a revision now requires a verified, active NPI on file.
-- Registration itself stays open per Joshua's call (2026-09-19) — this does
-- not touch account creation.
--
-- Rows in this table are never written directly by the client. The
-- 'verify-npi' edge function is the only writer, using the service role
-- key after it has actually confirmed the NPI against the CMS NPI Registry
-- API (npiregistry.cms.hhs.gov) — same pattern as approve_revision() being
-- the only path onto live entity tables. No INSERT/UPDATE policy exists for
-- anon/authenticated on purpose.
--
-- Already applied directly to Supabase as migration
-- `phase5_provider_verification` on 2026-09-19 — this file mirrors it for
-- the record (per this project's existing db/ convention). Do not re-run
-- unless the live migration is somehow missing.
-- ============================================================================

CREATE TABLE provider_verifications (
    user_id             UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    npi                 TEXT NOT NULL UNIQUE,
    verified_name       TEXT,
    enumeration_type    TEXT,          -- 'NPI-1' (individual) or 'NPI-2' (organization)
    primary_taxonomy    TEXT,
    status              TEXT NOT NULL CHECK (status IN ('active', 'deactivated')),
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE provider_verifications IS
    'One row per user who has verified an NPI against the CMS NPI Registry. '
    'Written only by the verify-npi edge function (service role), never by '
    'direct client INSERT/UPDATE. Gates revisions.submit_own below.';

ALTER TABLE provider_verifications ENABLE ROW LEVEL SECURITY;

-- A user can see their own verification status (e.g. to show "Verified as
-- Jane Doe, PharmD" on their account page) but cannot write to it.
CREATE POLICY read_own ON provider_verifications FOR SELECT
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Re-gate revisions.submit_own: was `auth.uid() = submitted_by` only; now
-- also requires an active provider_verifications row.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS submit_own ON revisions;

CREATE POLICY submit_own ON revisions FOR INSERT
    WITH CHECK (
        auth.uid() = submitted_by
        AND EXISTS (
            SELECT 1 FROM provider_verifications pv
            WHERE pv.user_id = auth.uid() AND pv.status = 'active'
        )
    );
