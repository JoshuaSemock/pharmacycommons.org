import { describe, expect, it, vi } from 'vitest'
import terms from '../docs/terms-of-use.md?fm'
import disclaimer from '../docs/medical-disclaimer.md?fm'
import licensing from '../docs/data-provenance-and-licensing.md?fm'
import privacy from '../docs/privacy-policy.md?fm'
import { createHash } from 'node:crypto'
import { parseFrontmatter } from './frontmatterParse'
import type { FrontmatterResult } from './frontmatter'
import { LEGAL_PAGES, LEGAL_VERSION } from './legal'
import { formatLegalDate, parseLegalDoc } from './legalDoc'

// src/auth.ts imports the Supabase client; keep this test offline.
vi.mock('./supabaseClient', () => ({ supabase: {} }))

const DOCS: Record<string, FrontmatterResult> = {
  '/terms': terms,
  '/disclaimer': disclaimer,
  '/licensing': licensing,
  '/privacy': privacy,
}

describe('legal documents', () => {
  it('has a canonical markdown file for every legal route', () => {
    expect(LEGAL_PAGES.map(p => p.to).sort()).toEqual(Object.keys(DOCS).sort())
    for (const doc of Object.values(DOCS)) expect(doc.body.length).toBeGreaterThan(1000)
  })

  it.each(LEGAL_PAGES)('$to: front matter reads without error', page => {
    const doc = parseLegalDoc(DOCS[page.to])
    expect(doc.frontmatterError).toBeNull()
    expect(doc.effectiveIso).not.toBeNull()
  })

  it.each(LEGAL_PAGES)('$to: effective_date matches LEGAL_VERSION', page => {
    // If this fails, a document changed its effective_date: bump LEGAL_VERSION
    // so new signups record the version they actually agreed to.
    expect(parseLegalDoc(DOCS[page.to]).effectiveIso).toBe(LEGAL_VERSION)
  })

  it.each(LEGAL_PAGES)('$to: title, label, lede and route match LEGAL_PAGES', page => {
    // The footer and signup form read LEGAL_PAGES; the page reads the document.
    const doc = parseLegalDoc(DOCS[page.to])
    expect(doc.title).toBe(page.title)
    expect(doc.label).toBe(page.label)
    expect(doc.lede).toBe(page.lede)
    expect(doc.route).toBe(page.to)
  })

  it.each(LEGAL_PAGES)('$to: text change comes with a new body_sha256', page => {
    // Fails when the text of a legal document changed but its recorded hash did not,
    // so a wording change can't go out unnoticed. Fix: copy the hash below into the
    // document's front matter (or run scripts/legal-hash.mjs --write). If the change
    // is material, also set effective_date and bump LEGAL_VERSION in src/legal.ts.
    const { meta, body } = DOCS[page.to]
    const actual = createHash('sha256').update(body).digest('hex')
    expect(meta.body_sha256, `body_sha256 should be ${actual}`).toBe(actual)
  })

  it.each(LEGAL_PAGES)('$to: body keeps every section, promoted to h2', page => {
    const raw = DOCS[page.to].body
    const doc = parseLegalDoc(DOCS[page.to])
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
    expect(doc.contact).toBe('contact@pharmacycommons.org')
    expect(doc.body.startsWith('Pharmacy Commons operates as an open-access public trust')).toBe(true)
    // #### subsections become h3
    expect(doc.body).toMatch(/^### Federal Public Domain \(17 U\.S\.C\. § 105\)$/m)
  })

  it('keeps lines in later sections that look like header lines', () => {
    // Terms §14 ends with **Email:** and **Website:**; only the header block is lifted.
    expect(parseLegalDoc(terms).body).toMatch(/\*\*Email:\*\* contact@pharmacycommons\.org/)
  })
})

describe('formatLegalDate', () => {
  it('writes the ISO date the way the documents used to', () => {
    expect(formatLegalDate('2026-09-29')).toBe('September 29, 2026')
    expect(formatLegalDate('2027-03-03')).toBe('March 3, 2027')
    expect(formatLegalDate('September 29, 2026')).toBe('September 29, 2026')
    expect(formatLegalDate('2026-13-01')).toBe('2026-13-01')
  })
})

describe('parseLegalDoc without front matter', () => {
  it('still returns the body, with no metadata', () => {
    const doc = parseLegalDoc(parseFrontmatter('# Pharmacy Commons — Sample\n\nIntro.\n\n### 1. One\n\nText.\n'))
    expect(doc.title).toBe('Sample')
    expect(doc.effectiveIso).toBeNull()
    expect(doc.body).toBe('Intro.\n\n## 1. One\n\nText.')
  })
})

describe('signup consent metadata', () => {
  it('records acceptance, version and time', async () => {
    const { legalAgreementMetadata } = await import('./auth')
    expect(legalAgreementMetadata(LEGAL_VERSION, new Date('2026-09-30T12:00:00Z'))).toEqual({
      legal_agreements_accepted: true,
      legal_agreements_version: '2026-10-27',
      legal_agreements_accepted_at: '2026-09-30T12:00:00.000Z',
    })
  })
})
