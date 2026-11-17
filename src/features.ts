/**
 * Pharmacy Commons — build-time feature switches
 *
 * ACCOUNTS_ENABLED (decided by Joshua 2026-11-15, docs/local-app.md phase 4): the site is a
 * read-only edition with no accounts. Off by default; set VITE_ACCOUNTS=on at build time to
 * bring back sign-in, saved pages, editing, page creation, the review queue, admin, blog
 * comments and server-side Learn progress. The code for all of those stays in the repo.
 *
 * With accounts off, useSession() reports nobody signed in without touching Supabase Auth,
 * so every account-gated control is hidden by its own existing check, Learn runs in its
 * browser-only guest mode, and the account/editing routes show ReadOnlyEdition instead.
 *
 * Destination: src/features.ts
 */

export const ACCOUNTS_ENABLED: boolean = import.meta.env.VITE_ACCOUNTS === 'on'

/**
 * LOCAL_TOOLS_ENABLED: the Tables page (/tables, docs/local-tables.md) needs the endpoint
 * that the Vite server adds in `--mode localdb` (`pnpm dev:local`, `pnpm preview:local`).
 * Never in the public static build or the old Supabase-backed build.
 */
export const LOCAL_TOOLS_ENABLED: boolean = import.meta.env.MODE === 'localdb'
