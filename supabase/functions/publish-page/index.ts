// Pharmacy Commons — publish-page edge function (docs/page-editor.md §7)
//
// The full-page editor's server side. It runs the same parser the editor runs
// (supabase/functions/_shared/pageSource, generated from src/pageSource by
// scripts/sync-page-source.mjs), so what the editor underlines is exactly what
// publishing refuses.
//
// Actions (POST JSON, Authorization: Bearer <user's access token>):
//   open     { pcid, target? }                    → the page (or one section) as source text,
//                                                    plus what the editor needs to check it live
//   publish  { pcid, baseRevisionId, source, summary, target? }
//                                                  → parse, merge section by section with anything
//                                                    published since baseRevisionId, look up new
//                                                    citations, then publish_page() (one bundled
//                                                    revision; held on reviewed pages)
//   accept   { revisionId, note? }                 → a reviewer accepting a held edit that is no
//                                                    longer based on the live page: merge it onto
//                                                    the live page first, then accept
//
// Responses:
//   200 { status: 'live' | 'pending' | 'unchanged', revisionId, changed }
//   409 { error: 'edit_conflict', conflicts, revisionId, source }  — `source` is the merged page
//        (or section) with the live text in each clashing part, for the editor to reload
//   422 { error: 'invalid', diagnostics } | { error: 'citation_not_found', key, message }
//   401 / 403 / 404 / 429 for sign-in, permission, missing page and rate limits
//
// Writes go only through publish_page() / accept_rebased_revision(), which are
// executable by service_role alone and re-check the person, the page's
// protection and the rate limit themselves.
//
// Destination: supabase/functions/publish-page/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { parsePageSource } from '../_shared/pageSource/parse.ts'
import type { FragmentTarget } from '../_shared/pageSource/parse.ts'
import { serializeFragment, serializePage, templateModel } from '../_shared/pageSource/serialize.ts'
import { assignSectionIds, mergeModels, sectionIdsOf, spliceFragment } from '../_shared/pageSource/merge.ts'
import { fromLegacy } from '../_shared/pageSource/legacy.ts'
import { buildPayload, citationOrder, overlayStructured } from '../_shared/pageSource/publish.ts'
import type { BrandRow, InfoboxRow, ThresholdRow } from '../_shared/pageSource/publish.ts'
import { resolveCitation } from '../_shared/pageSource/resolve.ts'
import type { SourceMeta } from '../_shared/pageSource/resolve.ts'
import { formatDrugName } from '../_shared/pageSource/names.ts'
import type { InfoboxKey, PageContext, PageModel, PageType, Registry } from '../_shared/pageSource/types.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DRUG_TYPES = new Set(['moiety', 'precise_form', 'combination', 'formulation'])
const CONCEPT_TYPES = new Set(['clinical', 'measurement', 'target', 'functional'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

class HttpError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? status))
  }
}

// ─── Loading a page ──────────────────────────────────────────────────────────

type Loaded = {
  ctx: PageContext
  protection: string
  currentRevisionId: number | null
  rows: { infobox: InfoboxRow[]; brands: BrandRow[]; thresholds: ThresholdRow[] }
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${what}: ${error.message}`)
  return data as T
}

async function loadPage(db: SupabaseClient, pcid: number): Promise<Loaded> {
  const entity = await must<{ pcid: number; entity_type: string; name: string } | null>(
    db.from('entities').select('pcid, entity_type, name').eq('pcid', pcid).maybeSingle(),
    'entity',
  )
  if (!entity) throw new HttpError(404, { error: 'no_such_page' })
  const pageType: PageType | null = DRUG_TYPES.has(entity.entity_type) ? 'drug' : CONCEPT_TYPES.has(entity.entity_type) ? 'concept' : null
  if (!pageType) throw new HttpError(400, { error: 'unsupported_page', message: 'Class and list pages still use the Overview editor.' })

  const [registry, keys, brandNames, content, infobox, brands, thresholds] = await Promise.all([
    must<Registry>(db.rpc('page_source_registry'), 'registry'),
    must<{ key: string; label: string; source_kind: string; entity_types: string[]; sort_order: number }[]>(
      db.from('infobox_properties').select('key, label, source_kind, entity_types, sort_order').order('sort_order'),
      'infobox_properties',
    ),
    must<{ brand_key: string; brand_display: string | null }[]>(
      db.from('entity_brand_names').select('brand_key, brand_display').eq('pcid', pcid).order('brand_key'),
      'brands',
    ),
    must<{ current_revision_id: number | null; protection: string } | null>(
      db.from('page_content').select('current_revision_id, protection').eq('pcid', pcid).maybeSingle(),
      'page_content',
    ),
    must<InfoboxRow[]>(
      db.from('infobox_edits').select('property_key, value, is_null_override, citation').eq('pcid', pcid).eq('is_current', true),
      'infobox_edits',
    ),
    must<BrandRow[]>(
      db.from('brand_edits').select('brand_key, brand_display, action, citation, summary').eq('pcid', pcid).eq('is_current', true),
      'brand_edits',
    ),
    must<ThresholdRow[]>(
      db.from('threshold_rules').select('block_name, measure, comparator, low, high, action, citations').eq('pcid', pcid).eq('is_current', true).order('position'),
      'threshold_rules',
    ),
  ])

  const infoboxKeys: InfoboxKey[] = keys.map(k => ({ key: k.key, label: k.label, source_kind: k.source_kind, entity_types: k.entity_types }))
  const ctx: PageContext = {
    pageType,
    title: pageType === 'drug' ? formatDrugName(entity.name) : entity.name.trim(),
    entityType: entity.entity_type,
    infoboxKeys,
    sourceBrands: brandNames.map(b => b.brand_display ?? b.brand_key),
    sourceValues: pageType === 'drug' ? await sourceValues(db, pcid, keys) : {},
    registry,
  }
  return {
    ctx,
    protection: content?.protection ?? 'open',
    currentRevisionId: content?.current_revision_id ?? null,
    rows: { infobox, brands, thresholds },
  }
}

/** What each Quick Facts key shows from the sources, for the `# source:` notes in the editor. */
async function sourceValues(db: SupabaseClient, pcid: number, keys: { key: string; label: string }[]) {
  const out: Record<string, string | null> = {}
  await Promise.all(
    keys.map(async k => {
      const { data } = await db.rpc('resolve_property', { p_key: k.key, p_pcid: pcid })
      const v = (data ?? {}) as { value?: string | null; origin?: string; label?: string }
      // Community values are already in the block itself; the note shows the source.
      if (v.origin === 'community') out[k.key] = null
      else if (v.origin === 'label') out[k.key] = `FDA label (${k.label})`
      else if (v.origin === 'class') out[k.key] = await epcClass(db, pcid)
      else out[k.key] = v.value ?? null
    }),
  )
  return out
}

async function epcClass(db: SupabaseClient, pcid: number): Promise<string | null> {
  const members = await must<{ class_pcid: number }[]>(db.from('class_members').select('class_pcid').eq('member_pcid', pcid), 'class_members')
  if (!members.length) return null
  const epc = await must<{ pcid: number }[]>(
    db.from('drug_classes').select('pcid').eq('class_type', 'epc').in('pcid', members.map(m => m.class_pcid)),
    'drug_classes',
  )
  if (!epc.length) return null
  const names = await must<{ name: string }[]>(db.from('entities').select('name').in('pcid', epc.map(e => e.pcid)), 'entities')
  return names.map(n => n.name).join(', ') || null
}

type RevisionRow = { id: number; format: number; model: PageModel | null; description: string; body_md: string; parent_id: number | null; patrol_status: string; pcid: number }

async function revisionModel(db: SupabaseClient, ctx: PageContext, id: number | null): Promise<{ model: PageModel; format: number }> {
  if (id === null) return { model: templateModel(ctx), format: 0 }
  const rev = await must<RevisionRow | null>(
    db.from('page_revisions').select('id, format, model, description, body_md, parent_id, patrol_status, pcid').eq('id', id).maybeSingle(),
    'revision',
  )
  if (!rev) throw new HttpError(404, { error: 'no_such_revision' })
  if (rev.format === 2 && rev.model) return { model: rev.model, format: 2 }
  return { model: fromLegacy(rev.description, rev.body_md, ctx), format: 1 }
}

/** The live page: its current revision with the live community rows laid over it. */
async function currentModel(db: SupabaseClient, page: Loaded): Promise<PageModel> {
  const { model } = await revisionModel(db, page.ctx, page.currentRevisionId)
  return withRows(model, page)
}

function withRows(model: PageModel, page: Loaded): PageModel {
  return overlayStructured(model, page.rows, page.ctx.sourceBrands, page.ctx.infoboxKeys.map(k => k.key))
}

// ─── Citations ───────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown | null> {
  const u = new URL(url)
  if (u.hostname === 'eutils.ncbi.nlm.nih.gov') {
    u.searchParams.set('tool', 'pharmacycommons')
    u.searchParams.set('email', 'contact@pharmacycommons.org')
  }
  const res = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': 'PharmacyCommons/1.0 (mailto:contact@pharmacycommons.org)' }, signal: AbortSignal.timeout(6000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${u.hostname} ${res.status}`)
  return await res.json()
}

async function sourcesFor(db: SupabaseClient, model: PageModel): Promise<Map<string, SourceMeta>> {
  const cites = citationOrder(model)
  const out = new Map<string, SourceMeta>()
  if (!cites.length) return out
  const known = await must<(SourceMeta & { key: string })[]>(
    db.from('citation_sources').select('key, kind, title, authors, container, year, volume, issue, pages, doi, pmid, setid, url, resolved').in('key', cites.map(c => c.key)),
    'citation_sources',
  )
  const byKey = new Map(known.map(k => [k.key, k]))
  await Promise.all(
    cites.map(async c => {
      const have = byKey.get(c.key)
      if (have?.resolved) return out.set(c.key, have)
      if (c.kind === 'ref') {
        if (!have) throw new HttpError(422, { error: 'citation_not_found', key: c.key, message: `There's no reference called “${c.key}”. Cite it by PMID, DOI, DailyMed set id or URL instead.` })
        return out.set(c.key, have)
      }
      const r = await resolveCitation(c, fetchJson)
      if (r.status === 'not_found') throw new HttpError(422, { error: 'citation_not_found', key: c.key, message: r.message })
      out.set(c.key, r.meta)
    }),
  )
  return out
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function newSectionId(): string {
  return `s-${crypto.randomUUID().slice(0, 8)}`
}

function validTarget(t: unknown): FragmentTarget | undefined {
  if (!t || typeof t !== 'object') return undefined
  const o = t as Record<string, unknown>
  if (o.kind === 'lead') return { kind: 'lead' }
  if (o.kind === 'section' && typeof o.heading === 'string' && o.heading.trim()) return { kind: 'section', heading: o.heading }
  if (o.kind === 'rail' && (o.name === 'infobox' || o.name === 'brands')) return { kind: 'rail', name: o.name }
  throw new HttpError(400, { error: 'bad_target' })
}

async function open(db: SupabaseClient, pcid: number, target?: FragmentTarget) {
  const page = await loadPage(db, pcid)
  const model = await currentModel(db, page)
  const source = target ? serializeFragment(model, page.ctx, target) : serializePage(model, page.ctx)
  return {
    revisionId: page.currentRevisionId,
    protection: page.protection,
    source,
    context: { ...page.ctx, registry: undefined },
    registry: page.ctx.registry,
    sectionIds: sectionIdsOf(model),
  }
}

async function publish(db: SupabaseClient, user: string, body: Record<string, unknown>, attempt = 0): Promise<Record<string, unknown>> {
  const pcid = Number(body.pcid)
  const baseRevisionId = body.baseRevisionId === null || body.baseRevisionId === undefined ? null : Number(body.baseRevisionId)
  const source = typeof body.source === 'string' ? body.source : ''
  const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
  const target = validTarget(body.target)
  if (!Number.isInteger(pcid)) throw new HttpError(400, { error: 'bad_pcid' })
  if (!summary) throw new HttpError(422, { error: 'summary_required', message: 'Say what you changed in the edit summary.' })

  const page = await loadPage(db, pcid)
  const ctx = page.ctx
  const base = await revisionModel(db, ctx, baseRevisionId)
  // Phase-15 revisions don't snapshot Quick Facts or brands; use the live rows for both sides.
  const baseModel = assignSectionIds(base.format === 2 ? base.model : withRows(base.model, page), newSectionId)
  const current = await currentModel(db, page)

  const parsed = parsePageSource(source, ctx, target ? { mode: 'fragment', target, sectionIds: sectionIdsOf(baseModel) } : { sectionIds: sectionIdsOf(baseModel) })
  if (!parsed.ok) throw new HttpError(422, { error: 'invalid', diagnostics: parsed.diagnostics.filter(d => d.severity === 'error') })
  const incoming = assignSectionIds(target ? spliceFragment(baseModel, parsed.model, target) : parsed.model, newSectionId)

  const merged = mergeModels(baseModel, current, incoming, ctx.infoboxKeys.map(k => k.key))
  if (!merged.ok) {
    throw new HttpError(409, {
      error: 'edit_conflict',
      conflicts: merged.conflicts,
      revisionId: page.currentRevisionId,
      source: target ? serializeFragment(merged.model, ctx, target) : serializePage(merged.model, ctx),
    })
  }
  if (!merged.changed.length && page.currentRevisionId !== null) return { status: 'unchanged', revisionId: page.currentRevisionId, changed: [] }

  // The merged page must still be valid (it always should be; this is the safety net).
  const final = parsePageSource(serializePage(merged.model, ctx), ctx, { sectionIds: sectionIdsOf(merged.model) })
  if (!final.ok) throw new HttpError(422, { error: 'invalid', diagnostics: final.diagnostics.filter(d => d.severity === 'error') })

  const sources = await sourcesFor(db, merged.model)
  const payload = buildPayload({ model: merged.model, extracted: final.extracted, changed: merged.changed, summary, sources })

  const { data, error } = await db.rpc('publish_page', {
    p_user: user,
    p_pcid: pcid,
    p_current_revision_id: page.currentRevisionId,
    p_parent_revision_id: baseRevisionId,
    p_payload: payload,
  })
  if (error) {
    // Someone published between our merge and the insert: merge once more.
    if (error.message.includes('edit_conflict') && attempt === 0) return publish(db, user, body, 1)
    throw sqlError(error.message)
  }
  const result = data as { revision_id: number; status: string }
  return { status: result.status, revisionId: result.revision_id, changed: merged.changed }
}

async function accept(db: SupabaseClient, user: string, body: Record<string, unknown>) {
  const revisionId = Number(body.revisionId)
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  const rev = await must<RevisionRow | null>(
    db.from('page_revisions').select('id, format, model, description, body_md, parent_id, patrol_status, pcid').eq('id', revisionId).maybeSingle(),
    'revision',
  )
  if (!rev || rev.patrol_status !== 'pending' || rev.format !== 2 || !rev.model) throw new HttpError(404, { error: 'not_pending' })
  const page = await loadPage(db, rev.pcid)
  const ctx = page.ctx
  const base = await revisionModel(db, ctx, rev.parent_id)
  const baseModel = base.format === 2 ? base.model : withRows(base.model, page)
  const current = await currentModel(db, page)
  const merged = mergeModels(baseModel, current, rev.model, ctx.infoboxKeys.map(k => k.key))
  if (!merged.ok) {
    throw new HttpError(409, { error: 'edit_conflict', conflicts: merged.conflicts, message: 'This held edit clashes with changes made since. Reject it with a note asking the author to redo it on the current page.' })
  }
  const final = parsePageSource(serializePage(merged.model, ctx), ctx, { sectionIds: sectionIdsOf(merged.model) })
  if (!final.ok) throw new HttpError(422, { error: 'invalid', diagnostics: final.diagnostics.filter(d => d.severity === 'error') })
  const sources = await sourcesFor(db, merged.model)
  const { data: summaryRow } = await db.from('page_revisions').select('summary').eq('id', revisionId).maybeSingle()
  const payload = buildPayload({ model: merged.model, extracted: final.extracted, changed: merged.changed, summary: (summaryRow as { summary: string } | null)?.summary ?? 'Accepted edit', sources })
  const { error } = await db.rpc('accept_rebased_revision', {
    p_reviewer: user,
    p_revision_id: revisionId,
    p_current_revision_id: page.currentRevisionId,
    p_payload: payload,
    p_note: note,
  })
  if (error) throw sqlError(error.message)
  return { status: 'live', revisionId, changed: merged.changed }
}

/** Maps a publish_page() refusal to an HTTP answer the editor can show. */
function sqlError(message: string): HttpError {
  const code = /([a-z_]+)$/.exec(message.trim())?.[1] ?? 'error'
  const map: Record<string, [number, string]> = {
    not_verified: [403, 'Editing needs a verified NPI. Verify yours on your Account page.'],
    handle_required: [403, 'Choose a public handle on your Account page before your first edit.'],
    protected: [403, 'This page is locked by a reviewer right now.'],
    not_patroller: [403, 'Only reviewers can accept edits.'],
    cannot_review_own: [403, "You can't accept your own edit."],
    rate_limited: [429, 'You have published a lot in the last hour. Try again shortly.'],
    summary_required: [422, 'Say what you changed in the edit summary.'],
    too_long: [422, 'The page is longer than 200,000 characters.'],
    edit_conflict: [409, 'Someone published while you were editing. Reload to merge.'],
  }
  const [status, text] = map[code] ?? [500, 'Publishing failed. Your draft is saved; try again.']
  return new HttpError(status, { error: code, message: text })
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    if (body.action === 'open') {
      const pcid = Number(body.pcid)
      if (!Number.isInteger(pcid)) return json({ error: 'bad_pcid' }, 400)
      return json(await open(db, pcid, validTarget(body.target)))
    }

    // Everything else acts as the signed-in person, identified from their own token.
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_signed_in', message: 'Sign in to edit.' }, 401)

    if (body.action === 'publish') return json(await publish(db, user.id, body))
    if (body.action === 'accept') return json(await accept(db, user.id, body))
    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    if (e instanceof HttpError) return json(e.body, e.status)
    console.error(e)
    return json({ error: 'server_error', message: 'Something went wrong. Your draft is saved; try again.' }, 500)
  }
})
