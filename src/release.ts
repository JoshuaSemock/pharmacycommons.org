/**
 * Which version and edition of Pharmacy Commons this build is (CHANGELOG.md).
 *
 * - APP_VERSION: package.json "version", injected at build time by vite.config.ts.
 *   Bump it there, add a CHANGELOG.md entry and a What's new file together.
 * - EDITION: what the build reads. "static" = pharmacycommons.org, answered from
 *   recorded files (docs/static-export.md); "local" = the editable app on Joshua's PC
 *   (docs/local-app.md); "online" = the old Supabase-backed build (deploy.yml).
 * - DATA_SNAPSHOT: the day the static data was recorded (VITE_DATA_SNAPSHOT in
 *   .env.static); undefined in the other editions, whose data is live.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Edition = 'static' | 'local' | 'online'

export const APP_VERSION: string = __APP_VERSION__

export function editionFor(mode: string): Edition {
  if (mode === 'static') return 'static'
  if (mode === 'localdb') return 'local'
  return 'online'
}

export const EDITION: Edition = editionFor(import.meta.env.MODE)

export const EDITION_LABEL: Record<Edition, string> = {
  static: 'Static edition',
  local: 'Local edition',
  online: 'Online edition',
}

/** yyyy-mm-dd → "16 Nov 2026"; anything else → undefined. */
export function formatSnapshot(value: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!m) return undefined
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]
  if (!month) return undefined
  return `${Number(m[3])} ${month} ${m[1]}`
}

export const DATA_SNAPSHOT: string | undefined =
  EDITION === 'static' ? formatSnapshot(import.meta.env.VITE_DATA_SNAPSHOT) : undefined

/** One line for the footer, e.g. "Version 0.2.0 · Static edition · data recorded 16 Nov 2026". */
export function releaseLine(version = APP_VERSION, edition = EDITION, snapshot = DATA_SNAPSHOT): string {
  const parts = [`Version ${version}`, EDITION_LABEL[edition]]
  if (snapshot) parts.push(`data recorded ${snapshot}`)
  return parts.join(' · ')
}
