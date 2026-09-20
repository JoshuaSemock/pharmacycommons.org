/**
 * Pharmacy Commons — auth session hook
 *
 * Thin wrapper around Supabase Auth so Account.tsx (sign in / register / sign
 * out) and Nav.tsx (showing who's signed in) share one source of truth
 * instead of each calling supabase.auth.getSession() separately.
 *
 * Scope note: this only covers identity (sign up / sign in / sign out,
 * session state) plus NPI provider verification. It does not add a
 * `user_roles` table, a "propose an edit" UI, or anything else from the
 * moderation pipeline in docs/phase5-community-moderation-workflow.md —
 * that doc's own suggested build order puts those first, and they're a
 * separate schema decision for Joshua.
 *
 * Destination: src/auth.ts
 */

import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export function useSession(): { session: Session | null; user: User | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}

/** Supabase's error messages are already user-safe; this just normalizes non-Error throws. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account`,
  })
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
  const { data, error } = await supabase.functions.invoke<VerifyNpiResult>('verify-npi', {
    body: { npi, last_name: lastName },
  })
  if (error) throw error
  if (!data) throw new Error('No response from verification service.')
  return data
}
