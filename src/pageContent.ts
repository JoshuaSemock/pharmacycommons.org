/**
 * Pharmacy Commons — community page text (phase 15)
 *
 * Reads the open section of a page: the community-written description and
 * markdown body (`page_content`), what its `[[links]]` and `{{properties}}`
 * point at (`page_links`, `page_property_refs`, resolved by the database on
 * every save), the pages that link here, and the patrol state of the current
 * revision. Writes go through the phase-15 RPCs (save_page etc.), not here.
 *
 * Design: docs/user-edits.md. Schema: db/phase15_community_editing.sql.
 */

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { isAbort } from './drugPageData'
import { linkKey, propertyKey } from './wiki'

export type Protection = 'open' | 'reviewed' | 'patrollers'

/** A page a link points at (or a page that links here). */
export type LinkedPage = { pcid: number; slug: string; name: string; entityType: string }

/** Value returned by resolve_property(). `resolve: 'client'` means the page computes it (label/class). */
export type PropertyValue = {
  key: string
  label: string
  value: string | null
  origin: 'community' | 'list' | 'attribute' | 'label' | 'class'
  citation?: string
  list_slug?: string
  resolve?: 'client'
  source_ref?: string
  error?: string
  /** The page the value belongs to, when it isn't this one. */
  target?: LinkedPage | null
}

export type PageContent = {
  description: string
  body: string
  protection: Protection
  currentRevisionId: number | null
  updatedAt: string | null
  /** Patrol status of the live revision ('patrolled' | 'unpatrolled'), null when there is no text. */
  currentStatus: string | null
  /** Most recent time a live revision was patrolled. */
  lastPatrolledAt: string | null
  /** Revisions waiting for review on a 'reviewed' page. */
  pendingCount: number
  /** linkKey → target page, or null for a red link. */
  links: Map<string, LinkedPage | null>
  /** propertyKey → resolved value. */
  properties: Map<string, PropertyValue>
  /** Pages whose text links here, by name. */
  backlinks: LinkedPage[]
}

type EntityEmbed = { pcid: number; slug: string; name: string; entity_type: string } | null

function toPage(e: EntityEmbed): LinkedPage | null {
  return e ? { pcid: e.pcid, slug: e.slug, name: e.name, entityType: e.entity_type } : null
}

/** Loads everything the open section shows for one PCID. */
export async function getPageContent(pcid: number, signal?: AbortSignal): Promise<PageContent> {
  const withSignal = <Q extends { abortSignal(s: AbortSignal): Q }>(q: Q): Q => (signal ? q.abortSignal(signal) : q)

  const [content, revisions, outLinks, inLinks, refs] = await Promise.all([
    withSignal(
      supabase
        .from('page_content')
        .select('description, body_md, protection, current_revision_id, updated_at')
        .eq('pcid', pcid),
    ).maybeSingle(),
    withSignal(
      supabase
        .from('page_revisions')
        .select('id, patrol_status, patrolled_at')
        .eq('pcid', pcid)
        .order('id', { ascending: false })
        .limit(100),
    ),
    withSignal(
      supabase
        .from('page_links')
        .select('target_text, target:entities!page_links_target_pcid_fkey(pcid, slug, name, entity_type)')
        .eq('source_pcid', pcid),
    ),
    withSignal(
      supabase
        .from('page_links')
        .select('source:entities!page_links_source_pcid_fkey(pcid, slug, name, entity_type)')
        .eq('target_pcid', pcid)
        .neq('source_pcid', pcid),
    ),
    withSignal(
      supabase
        .from('page_property_refs')
        .select('property_key, target_text, target_pcid, target:entities!page_property_refs_target_pcid_fkey(pcid, slug, name, entity_type)')
        .eq('source_pcid', pcid),
    ),
  ])

  for (const r of [content, revisions, outLinks, inLinks, refs]) {
    if (r.error) throw new Error(r.error.message)
  }

  const row = content.data as {
    description: string
    body_md: string
    protection: Protection
    current_revision_id: number | null
    updated_at: string | null
  } | null

  const revs = (revisions.data ?? []) as { id: number; patrol_status: string; patrolled_at: string | null }[]
  const current = row?.current_revision_id ?? null
  const lastPatrolledAt =
    revs
      .filter(r => r.patrol_status === 'patrolled' && r.patrolled_at)
      .map(r => r.patrolled_at as string)
      .sort()
      .at(-1) ?? null

  const links = new Map<string, LinkedPage | null>()
  for (const l of (outLinks.data ?? []) as unknown as { target_text: string; target: EntityEmbed }[]) {
    links.set(linkKey(l.target_text), toPage(l.target))
  }

  const seen = new Set<number>()
  const backlinks: LinkedPage[] = []
  for (const l of (inLinks.data ?? []) as unknown as { source: EntityEmbed }[]) {
    const p = toPage(l.source)
    if (p && !seen.has(p.pcid)) {
      seen.add(p.pcid)
      backlinks.push(p)
    }
  }
  backlinks.sort((a, b) => a.name.localeCompare(b.name))

  // One resolve_property call per distinct (key, target). Pages reference a
  // handful of values, so this stays small; unresolved targets are skipped.
  const refRows = (refs.data ?? []) as unknown as {
    property_key: string
    target_text: string
    target_pcid: number | null
    target: EntityEmbed
  }[]
  const resolved = await Promise.all(
    refRows.map(async r => {
      if (r.target_pcid === null) return null
      const { data, error } = await withSignal(
        supabase.rpc('resolve_property', { p_key: r.property_key, p_pcid: r.target_pcid }),
      )
      if (error) throw new Error(error.message)
      const value = data as PropertyValue
      return [
        propertyKey(r.property_key, r.target_text),
        { ...value, target: r.target_pcid === pcid ? null : toPage(r.target) },
      ] as const
    }),
  )
  const properties = new Map<string, PropertyValue>()
  for (const entry of resolved) if (entry) properties.set(entry[0], entry[1])

  return {
    description: row?.description ?? '',
    body: row?.body_md ?? '',
    protection: row?.protection ?? 'open',
    currentRevisionId: current,
    updatedAt: row?.updated_at ?? null,
    currentStatus: current === null ? null : (revs.find(r => r.id === current)?.patrol_status ?? null),
    lastPatrolledAt,
    pendingCount: revs.filter(r => r.patrol_status === 'pending').length,
    links,
    properties,
    backlinks,
  }
}

export type PageContentState = { data: PageContent | null; failed: boolean }

/** The open section's data for a page; refetches when the PCID changes. */
export function usePageContent(pcidCode: string): PageContentState {
  const [state, setState] = useState<PageContentState>({ data: null, failed: false })

  useEffect(() => {
    const m = /^PCID-(\d+)$/.exec(pcidCode)
    if (!m) {
      setState({ data: null, failed: true })
      return
    }
    const controller = new AbortController()
    setState({ data: null, failed: false })
    getPageContent(Number(m[1]), controller.signal)
      .then(data => setState({ data, failed: false }))
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        console.error(`Failed to load page text for ${pcidCode}`, err)
        setState({ data: null, failed: true })
      })
    return () => controller.abort()
  }, [pcidCode])

  return state
}
