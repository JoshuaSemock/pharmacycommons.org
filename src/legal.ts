/**
 * Legal & governance documents.
 *
 * The canonical text lives in docs/*.md. pages/LegalPage.tsx imports those
 * files raw (one route per LEGAL_PAGES entry) and renders them with the blog's
 * Markdown component, so the site can never drift from the committed text:
 * edit the markdown, and the page changes with it.
 *
 * Each document opens with YAML front matter (title, label, route, lede,
 * effective_date, details, website, body_sha256), read by src/frontmatter.ts.
 *
 * When any of the four documents changes materially, set its effective_date to
 * the new date and bump LEGAL_VERSION to match. New signups record the version
 * they agreed to (auth.users.raw_user_meta_data.legal_agreements_version).
 * src/legal.test.ts fails if a document's effective_date and this constant
 * disagree, and also if a document's text changed while its body_sha256 did not
 * (the test prints the new hash to paste in).
 *
 * LEGAL_VERSION and LEGAL_PAGES stay here, not in the documents, because the
 * footer and signup form need them and must not load the four documents or the
 * YAML parser. The document parser is in src/legalDoc.ts; the test keeps the
 * two in step.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Effective Date of the current documents, ISO yyyy-mm-dd. */
export const LEGAL_VERSION = '2026-11-05'

export const LEGAL_CONTACT_EMAIL = 'contact@pharmacycommons.org'

export type LegalPageLink = {
  to: '/terms' | '/disclaimer' | '/licensing' | '/privacy'
  /** Full document title, as on the page. */
  title: string
  /** Short name for the footer and the signup checkbox. */
  label: string
  /** Canonical markdown file, relative to the repo root. */
  file: string
  /** One plain-language sentence under the title. */
  lede: string
}

export const LEGAL_PAGES: LegalPageLink[] = [
  {
    to: '/terms',
    title: 'Terms of Use',
    label: 'Terms of Use', file: 'docs/terms-of-use.md',
    lede: 'The agreement that governs your use of Pharmacy Commons, its database, APIs and contributor accounts.',
  },
  {
    to: '/disclaimer',
    title: 'Medical Information Disclaimer',
    label: 'Medical Disclaimer',
    file: 'docs/medical-disclaimer.md',
    lede: 'Pharmacy Commons is an educational reference, not medical advice. What that means for patients, clinicians and automated answers.',
  },
  {
    to: '/privacy',
    title: 'Privacy Policy',
    label: 'Privacy Policy',
    file: 'docs/privacy-policy.md',
    lede: 'What we collect, why, who processes it, and how to delete your account. Never submit patient information.',
  },
  {
    to: '/licensing',
    title: 'Data Provenance and Licensing Policy',
    label: 'Data Provenance Policy',
    file: 'docs/data-provenance-and-licensing.md',
    lede: 'How the code and data are licensed, which upstream sources keep their own terms, and how to request removal of content.',
  },
]
