/**
 * Pharmacy Commons — on-demand Supabase client
 *
 * The Supabase SDK is the second-largest chunk on the site (~55 KB gzipped).
 * Modules that run on every page (the header search, the account button, the
 * homepage) get the client through getSupabase() instead of importing
 * supabaseClient.ts directly, so the SDK downloads after first paint rather
 * than holding it up. Route pages that need data immediately (drug, class,
 * list pages) can keep the static import; they are lazy chunks already.
 *
 * Destination: src/db.ts
 */

type Client = (typeof import('./supabaseClient'))['supabase']

let pending: Promise<Client> | null = null

/** The shared client, loaded once on first call and cached after that. */
export function getSupabase(): Promise<Client> {
  pending ??= import('./supabaseClient').then(m => m.supabase)
  return pending
}
