/**
 * "What's new" — one entry per thing we ship, shown on the home page beside
 * blog posts in a single dated feed.
 *
 * Adding a feature: add one object to UPDATES (newest first is tidy, but the
 * feed sorts by date anyway). Blog posts join the feed automatically from
 * src/content/posts/, so don't add them here.
 *
 * `to` is the page the entry opens. Keep `summary` to one or two sentences,
 * written for someone who has never used the feature.
 */

import { listPosts } from './blog'

export type UpdateKind = 'Tool' | 'Feature' | 'Blog post'

export type Update = {
  id: string
  /** ISO yyyy-mm-dd — the day it went live. */
  date: string
  kind: UpdateKind
  title: string
  summary: string
  to: string
  /** Link text; defaults by kind ("Open the tool", "Take a look", "Read the post"). */
  cta?: string
  /** Shown when there is no summary (blog posts without a `summary:` line). */
  detail?: string
}

export const UPDATES: Update[] = [
  {
    id: 'create-pages',
    date: '2026-10-05',
    kind: 'Feature',
    title: 'Create a page for a condition, symptom, lab or drug',
    summary:
      'NPI-verified providers can now start a page for anything the reference is missing: an indication, symptom, adverse effect, lab test, target, herbal or drug. Each gets a permanent PCID, and a link to a page that doesn’t exist yet offers to create it.',
    to: '/new',
    cta: 'Create a page',
  },
  {
    id: 'quick-facts-community',
    date: '2026-10-05',
    kind: 'Feature',
    title: 'Correct a Quick Fact, with a source',
    summary:
      'Every Quick Facts row on a drug page can now carry a community value from an NPI-verified provider, with its source. The label or list value is kept and shown one tap away, so any disagreement stays visible, and every change has its own history and review.',
    to: '/drugs/sertraline',
    cta: 'See a drug page',
  },
  {
    id: 'overview-history',
    date: '2026-10-05',
    kind: 'Feature',
    title: 'Overview history and review',
    summary:
      'Every Overview now has a history: who changed what, when, and why, with a line-by-line comparison of each version. Verified providers can restore an earlier version in one step, and reviewers work through a queue of new edits, accepting or rejecting changes to high-alert drugs before they appear.',
    to: '/drugs/sertraline/history',
    cta: 'See an example',
  },
  {
    id: 'overview-editor',
    date: '2026-10-04',
    kind: 'Feature',
    title: 'Write a drug page Overview',
    summary:
      'NPI-verified providers can now edit the Overview on any drug page: markdown with headings and tables, [[links]] to other pages picked from a list as you type, and live values such as {{acb_score}}. Every edit needs a short summary and is credited to your public handle; high-alert drugs are reviewed before changes appear.',
    to: '/account',
    cta: 'Verify to start editing',
  },
  {
    id: 'community-overview',
    date: '2026-10-04',
    kind: 'Feature',
    title: 'An Overview section on every drug page',
    summary:
      'Drug pages now have a community-written Overview after Quick Facts: practical notes, calculations and context the label leaves out, written by NPI-verified providers, with links to other pages and live values such as ACB scores. High-alert drugs are reviewed before changes appear. Editing opens next.',
    to: '/drugs/vancomycin',
    cta: 'See where it goes',
  },
  {
    id: 'dictionary',
    date: '2026-10-03',
    kind: 'Tool',
    title: 'Medical dictionary for Word',
    summary:
      'Download one file and Word stops underlining drug names, brand names, biologics and medical terms: about 43,000 words, with instructions for Windows and Mac. The full dictionary is browsable A–Z with definitions, and The Joint Commission "Do Not Use" abbreviations are now a list of their own.',
    to: '/tools/dictionary',
  },
  {
    id: 'medrec-clinical-lists',
    date: '2026-10-03',
    kind: 'Tool',
    title: 'Medication reconciliation: anticholinergic burden, QT risk and do-not-crush',
    summary:
      'The medication reconciliation tool now marks drugs on the Anticholinergic Burden, QT and arrhythmia risk, and Do Not Crush lists, adds up the anticholinergic burden score, and puts a clinical risk summary on the printable list. Everything is still matched in your browser.',
    to: '/tools/medication-reconciliation',
  },
  {
    id: 'drug-page-quick-facts',
    date: '2026-10-02',
    kind: 'Feature',
    title: 'Drug pages: Quick Facts and the full drug hierarchy',
    summary:
      'Every drug page now opens with a Quick Facts box (indication, dosing topics, contraindications, boxed warning, FDA class, legal status, and Most used / Do not crush / ACB / QTc lists) that links into the FDA label, which now starts collapsed. Brand formulations join precise forms and combinations in the hierarchy.',
    to: '/drugs/metformin',
    cta: 'See an example',
  },
  {
    id: 'classifications',
    date: '2026-10-02',
    kind: 'Feature',
    title: 'Classifications: one search, every system',
    summary:
      'Drug classes are now Classifications, in the top bar after Lists. One search covers WHO ATC, VA, FDA EPC/MOA/PE, ChemOnt and Pharmacy Commons groups at once, a filter narrows to one system, and up to three classes can be compared side by side.',
    to: '/classifications',
    cta: 'Take a look',
  },
  {
    id: 'paper-and-dark-mode',
    date: '2026-10-01',
    kind: 'Feature',
    title: 'A new page, and a dark mode',
    summary:
      'Pages now sit on a single sheet of floral-white paper with torn edges over the lichen, with fewer boxes in the way of the reading. Dark mode follows your device, or pick Light or Dark under Appearance in the site menu.',
    to: '/',
    cta: 'Take a look',
  },
  {
    id: 'days-supply',
    date: '2026-09-30',
    kind: 'Tool',
    title: 'Days supply and quantity',
    summary:
      'How much to dispense for a number of days, or how many days a quantity lasts, for tablets, liquids, eye and ear drops, inhalers, insulin and GLP-1 pens. Priming, drops per mL and in-use limits are counted in, and every step is shown.',
    to: '/tools/days-supply',
  },
  {
    id: 'references-resources',
    date: '2026-09-30',
    kind: 'Feature',
    title: 'One catalog for references and resources',
    summary:
      'References now lists every source we cite or point to (80 in all), grouped by topic, with the datasets the Commons is built from marked. Every entry can be copied as a citation in AMA, APA, Vancouver, NLM or BibTeX. Resources draws on the same catalog.',
    to: '/references',
    cta: 'See the references',
  },
  {
    id: 'legal-policies',
    date: '2026-09-30',
    kind: 'Feature',
    title: 'Terms, disclaimer, privacy and licensing',
    summary:
      'The Terms of Use, Medical Information Disclaimer, Privacy Policy and Data Provenance and Licensing Policy now have their own pages, linked from every footer. New accounts agree to them when registering.',
    to: '/terms',
    cta: 'Read the terms',
  },
  {
    id: 'developers',
    date: '2026-09-28',
    kind: 'Feature',
    title: 'The API, for developers',
    summary:
      'Every record is also open data: search by name or brand, fetch full records as JSON or JSON-LD, and compare any two versions. Try it in a live console, then copy the request as curl, JavaScript, Python, R or an Excel query. No key needed.',
    to: '/developers',
    cta: 'Open the console',
  },
  {
    id: 'medication-reconciliation',
    date: '2026-09-27',
    kind: 'Tool',
    title: 'Medication reconciliation',
    summary:
      'Build one complete list of prescriptions, over-the-counter products, supplements and herbals, with allergies and substance use. Directions are written out in full, doses are calculated, and the list never leaves your browser.',
    to: '/tools/medication-reconciliation',
  },
  {
    id: 'lists',
    date: '2026-09-25',
    kind: 'Feature',
    title: 'Drug lists',
    summary:
      'Sortable lists such as the most-used drugs in the US and the Georgia MPJE lists, each linked to its drug pages, with a side-by-side compare view and a CSV download.',
    to: '/lists',
  },
  {
    id: 'creatinine-clearance',
    date: '2026-09-16',
    kind: 'Tool',
    title: 'Creatinine clearance',
    summary:
      'Cockcroft-Gault with actual, ideal and adjusted body weight side by side, plus CKD-EPI 2021 eGFR and a renal dose check. Every constant is cited.',
    to: '/tools/creatinine-clearance',
  },
]

const DEFAULT_CTA: Record<UpdateKind, string> = {
  Tool: 'Open the tool',
  Feature: 'Take a look',
  'Blog post': 'Read the post',
}

export const ctaFor = (u: Update): string => u.cta ?? DEFAULT_CTA[u.kind]

/** Features and published blog posts together, newest first. */
export function whatsNew(limit?: number): Update[] {
  const posts: Update[] = listPosts().map(p => ({
    id: `post:${p.slug}`,
    date: p.date,
    kind: 'Blog post',
    title: p.title,
    summary: p.summary,
    detail: `${p.readingMinutes} minute read`,
    to: `/blog/${p.slug}`,
  }))
  const all = [...UPDATES, ...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return limit == null ? all : all.slice(0, limit)
}
