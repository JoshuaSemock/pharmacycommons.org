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
 * Destination: src/supabaseClient.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nenwovhyrdcdkhxzjiiv.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_n2bmQaOdwbOvqO1QhSuAgw_RxO-mLYQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
