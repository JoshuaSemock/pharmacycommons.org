import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { APP_VERSION, editionFor, formatSnapshot, releaseLine } from './release'

describe('release', () => {
  it('reads the version from package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('has a CHANGELOG entry for the current version', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toContain(`## ${APP_VERSION} `)
  })

  it('maps build modes to editions', () => {
    expect(editionFor('static')).toBe('static')
    expect(editionFor('localdb')).toBe('local')
    expect(editionFor('production')).toBe('online')
    expect(editionFor('test')).toBe('online')
  })

  it('formats the snapshot date', () => {
    expect(formatSnapshot('2026-11-16')).toBe('16 Nov 2026')
    expect(formatSnapshot('2026-13-01')).toBeUndefined()
    expect(formatSnapshot('')).toBeUndefined()
    expect(formatSnapshot(undefined)).toBeUndefined()
  })

  it('builds the footer line', () => {
    expect(releaseLine('0.2.0', 'static', '16 Nov 2026')).toBe('Version 0.2.0 · Static edition · data recorded 16 Nov 2026')
    expect(releaseLine('0.2.0', 'local', undefined)).toBe('Version 0.2.0 · Local edition')
  })
})
