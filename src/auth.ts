/**
 * Pharmacy Commons — auth session hook
 *
 * Thin wrapper around Supabase Auth so Account.tsx (sign in / register / sign
 * out) and Nav.tsx (showing who's signed in) share one source of truth
 * instead of each calling supabase.auth.getSession() separately.
 *
 * Scope note: this only covers identity (sign up / sign in / sign out,
 * session state), NPI provider verification, saved-page bookmarks, and
 * basic account settings (email/password change). It does not add a
 * `user_roles` table, a "propose an edit" UI, or anything else from the
 * moderation pipeline in docs/phase5-community-moderation-workflow.md —
 * that doc's own suggested build order puts those first, and they're a
 * separate schema decision for Joshua.
 *
 * Destination: src/auth.ts
 */

import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from './db'

export function useSession(): { session: Session | null; user: User | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    // The Supabase client (~55 KB gzipped) is fetched on demand rather than as
    // part of the first page load, so the header renders without waiting on
    // it. Until it arrives, `loading` stays true (the account button shows
    // its neutral state).
    getSupabase().then(supabase => {
      if (cancelled) return

      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return
        setSession(data.session)
        setLoading(false)
      })

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next)
      })
      unsubscribe = () => subscription.subscription.unsubscribe()
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}

/** Supabase's error messages are already user-safe; this just normalizes non-Error throws. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

/**
 * Clickwrap consent recorded with each new account, stored by Supabase in
 * auth.users.raw_user_meta_data. `version` is the Effective Date of the
 * documents agreed to (LEGAL_VERSION in src/legal.ts).
 *
 * `legal_agreements_accepted_at` is the browser's clock; auth.users.created_at
 * is the server-side timestamp for the same signup.
 */
export type LegalAgreementMetadata = {
  legal_agreements_accepted: true
  legal_agreements_version: string
  legal_agreements_accepted_at: string
}

export function legalAgreementMetadata(version: string, now: Date = new Date()): LegalAgreementMetadata {
  return {
    legal_agreements_accepted: true,
    legal_agreements_version: version,
    legal_agreements_accepted_at: now.toISOString(),
  }
}

/**
 * Where Supabase sends people after they click an emailed link (signup
 * confirmation, password reset, email change). Without it Supabase falls back
 * to the project's Site URL, which was still the default http://localhost:3000.
 * The URL must also be allow-listed under Authentication → URL Configuration →
 * Redirect URLs, or Supabase ignores it and uses the Site URL anyway.
 */
export function authRedirectUrl(): string {
  return `${window.location.origin}/account`
}

/**
 * Supabase reports a failed email link by redirecting with
 * #error=…&error_code=…&error_description=… (or the same in the query string).
 * Returns a message to show, or null when the URL carries no auth error.
 */
export function authRedirectError(hash: string, search = ''): string | null {
  for (const raw of [hash.replace(/^#/, ''), search.replace(/^\?/, '')]) {
    if (!raw) continue
    const params = new URLSearchParams(raw)
    if (!params.has('error') && !params.has('error_code')) continue
    const code = params.get('error_code')
    if (code === 'otp_expired') {
      return 'That email link has already been used or has expired. If you already confirmed your email, just sign in below; otherwise register again to get a new link.'
    }
    return params.get('error_description') ?? 'That email link could not be used. Please try again.'
  }
  return null
}

export async function signUpWithPassword(
  email: string,
  password: string,
  consent: LegalAgreementMetadata,
) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: consent, emailRedirectTo: authRedirectUrl() },
  })
  if (error) throw error
  return data
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function sendPasswordReset(email: string) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl(),
  })
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// Account settings — change email / change password
//
// Both go through supabase.auth.updateUser(), which requires an existing
// session (the user is already signed in — no separate re-auth flow here).
// A changed email sends a confirmation link to the *new* address before it
// takes effect (Supabase default: "Secure email change" — confirms both old
// and new inboxes if that project setting is on); the client can't skip that.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateEmail(newEmail: string) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: authRedirectUrl() },
  )
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// NPI provider verification
//
// Gates CONTRIBUTION, not registration (Joshua's call, 2026-09-19): anyone
// can have an account, but revisions.submit_own's RLS policy requires a row
// here with status = 'active' — see db/phase5_provider_verification.sql.
// The actual CMS lookup happens server-side in the verify-npi edge function;
// this is just the client call plus reading your own row back.
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderVerification = {
  npi: string
  verified_name: string | null
  enumeration_type: string | null
  primary_taxonomy: string | null
  status: 'active' | 'deactivated'
  verified_at: string
}

export type VerifyNpiResult =
  | { verified: true; status: 'active'; name: string; taxonomy: string | null; enumeration_type: string }
  | { verified: false; reason: string }

/** Reads the caller's own verification row, if any. Null means "not verified yet." */
export async function getMyProviderVerification(): Promise<ProviderVerification | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('provider_verifications')
    .select('npi, verified_name, enumeration_type, primary_taxonomy, status, verified_at')
    .maybeSingle()

  if (error) throw new Error(`Failed to load verification status: ${error.message}`)
  return data
}

/**
 * Submits an NPI + last name to the verify-npi edge function. Returns the
 * result rather than throwing on a failed-but-well-formed verification
 * (wrong NPI, name mismatch, deactivated) — those are user-correctable, not
 * exceptions. Throws only on a genuine transport/auth failure.
 */
export async function verifyNpi(npi: string, lastName: string): Promise<VerifyNpiResult> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.functions.invoke<VerifyNpiResult>('verify-npi', {
    body: { npi, last_name: lastName },
  })
  if (error) throw error
  if (!data) throw new Error('No response from verification service.')
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved PCID pages
//
// A per-user bookmark list (db/phase5_saved_entities.sql). Not gated on NPI
// verification — bookmarking a page is reading, not contributing. RLS scopes
// every row to auth.uid(), so these calls never pass user_id explicitly for
// reads by design, but do for writes (the table has no default-to-caller
// trigger, so the client supplies it; RLS still rejects any other value).
// ─────────────────────────────────────────────────────────────────────────────

export type SavedEntity = {
  pcid_code: string
  slug: string
  name: string
  entity_type: string | null
  saved_at: string
}

/** Every page the signed-in user has saved, most recent first. */
export async function getSavedEntities(): Promise<SavedEntity[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('saved_entities')
    .select('pcid_code, slug, name, entity_type, saved_at')
    .order('saved_at', { ascending: false })

  if (error) throw new Error(`Failed to load saved pages: ${error.message}`)
  return data ?? []
}

/** True if the signed-in user has already saved this PCID. Null user → false, no call made. */
export async function isEntitySaved(pcidCode: string): Promise<boolean> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('saved_entities')
    .select('pcid_code')
    .eq('pcid_code', pcidCode)
    .maybeSingle()

  if (error) throw new Error(`Failed to check saved status: ${error.message}`)
  return data !== null
}

export async function saveEntity(entity: {
  pcid_code: string
  slug: string
  name: string
  entity_type: string | null
}): Promise<void> {
  const supabase = await getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to save pages.')

  const { error } = await supabase.from('saved_entities').upsert(
    {
      user_id: user.id,
      pcid_code: entity.pcid_code,
      slug: entity.slug,
      name: entity.name,
      entity_type: entity.entity_type,
    },
    { onConflict: 'user_id,pcid_code' },
  )
  if (error) throw new Error(`Failed to save page: ${error.message}`)
}

export async function unsaveEntity(pcidCode: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('saved_entities').delete().eq('pcid_code', pcidCode)
  if (error) throw new Error(`Failed to remove saved page: ${error.message}`)
}
