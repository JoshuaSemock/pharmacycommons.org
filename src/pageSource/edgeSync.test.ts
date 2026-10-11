import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script without types
import { expected } from '../../scripts/sync-page-source.mjs'

describe('publish-page shares the editor parser', () => {
  it('supabase/functions/_shared/pageSource is up to date (run node scripts/sync-page-source.mjs)', () => {
    for (const [path, text] of expected() as [string, string][]) {
      expect(readFileSync(path, 'utf8'), path).toBe(text)
    }
  })
})
