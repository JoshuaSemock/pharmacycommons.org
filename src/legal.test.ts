import { describe, expect, it, vi } from 'vitest'
import terms from '../docs/terms-of-use.md?raw'
import disclaimer from '../docs/medical-disclaimer.md?raw'
import licensing from '../docs/data-provenance-and-licensing.md?raw'
import privacy from '../docs/privacy-policy.md?raw'
import { LEGAL_PAGES, LEGAL_VERSION, parseLegalDoc, toIsoDate } from './legal'

// src/auth.ts imports the Supabase client; keep this test offline.
vi.mock('./supabaseClient', () => ({ supabase: {} }))

const DOCS: Record<string, string> = {
  '/terms': terms,
  '/disclaimer': disclaimer,
  '/licensing': licensing,
  '/privacy': privacy,
}

describe('legal documents', () => {
  it('has a canonical markdown file for every legal route', () => {
    expect(LEGAL_PAGES.map(p => p.to).sort()).toEqual(Object.keys(DOCS).sort())
    for (const raw of Object.values(DOCS)) expect(raw.length).toBeGreaterThan(1000)
  })

  it.each(LEGAL_PAGES)('$to: Effective Date matches LEGAL_VERSION', page => {
    // If this fails, a document changed its Effective Date: bump LEGAL_VERSION
    // so new signups record the version they actually agreed to.
    expect(parseLegalDoc(DOCS[page.to]).effectiveIso).toBe(LEGAL_VERSION)
  })

  it.each(LEGAL_PAGES)('$to: title matches the page title', page => {
    expect(parseLegalDoc(DOCS[page.to]).title).toBe(page.title)
  })

  it.each(LEGAL_PAGES)('$to: body keeps every section, promoted to h2', page => {
    const raw = DOCS[page.to].replace(/\r\n?/g, '\n')
    const doc = parseLegalDoc(raw)
    const sections = raw.match(/^### .+$/gm) ?? []
    expect(sections.length).toBeGreaterThanOrEqual(4)
    for (const s of sections) expect(doc.body).toContain(`\n${s.slice(1)}\n`)
    expect(doc.body).not.toMatch(/^# /m)
    expect(doc.body).not.toMatch(/^\*\*Effective Date:\*\*/m)
  })

  it('moves header lines out of the body and keeps the operator', () => {
    const doc = parseLegalDoc(licensing)
    expect(doc.meta).toEqual([
      { label: 'Operator', value: 'Pharmacy of the Commons, LLC' },
      { label: 'Maintainer', value: 'Dr. Joshua Semock, PharmD' },
    ])
    expect(doc.body.startsWith('Pharmacy Commons operates as an open-access public trust')).toBe(true)
    // #### subsections become h3
    expect(doc.body).toMatch(/^### Federal Public Domain \(17 U\.S\.C\. § 105\)$/m)
  })

  it('keeps lines in later sections that look like header lines', () => {
    // Terms §14 ends with **Email:** and **Website:**; only the header block is lifted.
    expect(parseLegalDoc(terms).body).toMatch(/\*\*Email:\*\* contact@pharmacycommons\.org/)
  })
})

describe('toIsoDate', () => {
  it('reads the documents’ date style', () => {
    expect(toIsoDate('September 29, 2026')).toBe('2026-09-29')
    expect(toIsoDate('March 3, 2027')).toBe('2027-03-03')
    expect(toIsoDate('2026-09-29')).toBeNull()
    expect(toIsoDate('Smarch 3, 2027')).toBeNull()
  })
})

describe('signup consent metadata', () => {
  it('records acceptance, version and time', async () => {
    const { legalAgreementMetadata } = await import('./auth')
    expect(legalAgreementMetadata(LEGAL_VERSION, new Date('2026-09-30T12:00:00Z'))).toEqual({
      legal_agreements_accepted: true,
      legal_agreements_version: '2026-09-29',
      legal_agreements_accepted_at: '2026-09-30T12:00:00.000Z',
    })
  })
})
