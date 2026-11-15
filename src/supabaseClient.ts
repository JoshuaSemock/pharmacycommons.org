/**
 * Pharmacy Commons — shared Supabase client
 *
 * A single client instance, imported by both api.ts (drug detail / list / search)
 * and catalog.ts (the browsable catalog view). Kept in its own module so neither
 * imports the other.
 *
 * Uses the modern publishable key (sb_publishable_…) rather than the legacy anon
 * JWT — same public, RLS-scoped access, but independently rotatable.
 *
 * The URL and key come from VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY when
 * set, so the same code can run against the local stack (`pnpm dev:local`, which
 * reads `.env.localdb`; see docs/local-app.md). With neither set, the live project
 * is used, so the public GitHub Pages build is unchanged.
 *
 * Destination: src/supabaseClient.ts
 */

import { createClient } from '@supabase/supabase-js'

const LIVE_URL = 'https://nenwovhyrdcdkhxzjiiv.supabase.co'
const LIVE_PUBLISHABLE_KEY = 'sb_publishable_n2bmQaOdwbOvqO1QhSuAgw_RxO-mLYQ'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Both or neither: a local URL with the live key (or the reverse) would fail confusingly. */
if (Boolean(envUrl) !== Boolean(envKey)) {
  throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or neither.')
}

export const SUPABASE_URL: string = envUrl || LIVE_URL
const SUPABASE_PUBLISHABLE_KEY: string = envKey || LIVE_PUBLISHABLE_KEY

/** True when the app is pointed at something other than the live project (e.g. the local stack). */
export const IS_LOCAL_BACKEND: boolean = SUPABASE_URL !== LIVE_URL

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
