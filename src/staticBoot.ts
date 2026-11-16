/**
 * Imported first by main.tsx so the static edition's fetch shim is in place before
 * any module creates the Supabase client. A no-op in every other build.
 *
 * Destination: src/staticBoot.ts
 */
import { installStaticFetch } from './staticData'

if (import.meta.env.VITE_STATIC === '1') installStaticFetch((import.meta.env.VITE_PC_API_BASE as string | undefined) ?? '')
