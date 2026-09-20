// Pharmacy Commons — verify-npi edge function
//
// Called by an authenticated user from Account.tsx to attach a verified NPI
// to their account. Runs server-side deliberately: the CMS NPI Registry API
// (https://npiregistry.cms.hhs.gov) has no auth of its own, so trusting a
// client-side "yes it's valid" would let anyone spoof it by editing the JS
// or just typing someone else's NPI. This function is the only writer to
// `provider_verifications` (see db/phase5_provider_verification.sql) — it
// uses the service role key to bypass RLS, but only after it has actually
// confirmed the NPI against CMS and cross-checked the submitted last name.
//
// Already deployed directly to Supabase as the active `verify-npi` edge
// function on 2026-09-19 — this file mirrors it for the record. Future
// edits should be deployed again via the Supabase MCP/CLI, not assumed to
// auto-deploy from a git push (deploy.yml's scope is GitHub Pages only).
//
// Request:  POST { npi: string, last_name: string }
//   Authorization: Bearer <user's access token>  (verified via getUser())
// Response: { verified: true, status, name, taxonomy, enumeration_type }
//        or { verified: false, reason: string }  (still 200 — a failed
//        verification is an expected outcome, not a server error)
//
// Destination: supabase/functions/verify-npi/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2'

const NPI_API = 'https://npiregistry.cms.hhs.gov/api/?version=2.1'

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: { npi?: unknown; last_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const npi = typeof body.npi === 'string' ? body.npi.trim() : ''
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : ''

  if (!/^\d{10}$/.test(npi)) {
    return json({ verified: false, reason: 'NPI must be exactly 10 digits.' }, 200)
  }
  if (!lastName) {
    return json({ verified: false, reason: 'Last name is required to cross-check the registry record.' }, 200)
  }

  // Identify the calling user from their own JWT — this function only ever
  // verifies "the NPI belongs to the person making this request," never an
  // arbitrary user_id passed in the body.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return json({ error: 'Not authenticated.' }, 401)
  }

  // Query CMS. No API key, GET only, per npiregistry.cms.hhs.gov/api-docs.
  let registryResult: NpiRegistryResult
  try {
    const res = await fetch(`${NPI_API}&number=${encodeURIComponent(npi)}`)
    if (!res.ok) {
      return json({ verified: false, reason: 'NPI Registry lookup failed. Try again shortly.' }, 200)
    }
    registryResult = await res.json()
  } catch {
    return json({ verified: false, reason: 'Could not reach the NPI Registry. Try again shortly.' }, 200)
  }

  if (!registryResult.result_count || !registryResult.results?.length) {
    return json({ verified: false, reason: `No NPI Registry record found for ${npi}.` }, 200)
  }

  const record = registryResult.results[0]
  const basic = record.basic

  // Deactivated NPIs return a real record — status has to be checked
  // explicitly, "found" is not the same as "active."
  const isActive = !basic.deactivation_date
  if (!isActive) {
    return json(
      { verified: false, reason: `NPI ${npi} is on record but deactivated as of ${basic.deactivation_date}.` },
      200,
    )
  }

  // Cross-check the submitted last name against the registry's own name
  // field, so a valid-but-someone-else's NPI doesn't pass. Individual
  // (NPI-1) records use last_name; organization (NPI-2) records use
  // organization_name instead and have no personal name to check — allowed
  // through since there's nothing to spoof-check against a person.
  const enumerationType = record.enumeration_type // 'NPI-1' | 'NPI-2'
  if (enumerationType === 'NPI-1') {
    const registryLastName = (basic.last_name ?? '').trim().toLowerCase()
    if (registryLastName !== lastName.toLowerCase()) {
      return json(
        { verified: false, reason: 'The last name provided does not match the NPI Registry record.' },
        200,
      )
    }
  }

  const verifiedName =
    enumerationType === 'NPI-1'
      ? [basic.first_name, basic.middle_name, basic.last_name, basic.credential]
          .filter(Boolean)
          .join(' ')
      : (basic.organization_name ?? npi)

  const primaryTaxonomy =
    record.taxonomies?.find(t => t.primary)?.desc ?? record.taxonomies?.[0]?.desc ?? null

  // Service role client — the only path allowed to write this table (no
  // INSERT/UPDATE policy grants it to anon/authenticated; see the migration).
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error: writeError } = await adminClient
    .from('provider_verifications')
    .upsert(
      {
        user_id: user.id,
        npi,
        verified_name: verifiedName,
        enumeration_type: enumerationType,
        primary_taxonomy: primaryTaxonomy,
        status: 'active',
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (writeError) {
    // Most likely cause: the `npi` UNIQUE constraint — someone else already
    // verified with this NPI. Don't leak which account holds it.
    if (writeError.code === '23505') {
      return json({ verified: false, reason: 'This NPI is already verified on a different account.' }, 200)
    }
    return json({ verified: false, reason: 'Could not save verification. Try again.' }, 200)
  }

  return json({
    verified: true,
    status: 'active',
    name: verifiedName,
    taxonomy: primaryTaxonomy,
    enumeration_type: enumerationType,
  })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Minimal shape of what this function actually reads from the NPI Registry
// response — the real payload has many more fields.
type NpiRegistryResult = {
  result_count: number
  results?: {
    enumeration_type: 'NPI-1' | 'NPI-2'
    basic: {
      first_name?: string
      middle_name?: string
      last_name?: string
      credential?: string
      organization_name?: string
      deactivation_date?: string
    }
    taxonomies?: { desc: string; primary: boolean }[]
  }[]
}
