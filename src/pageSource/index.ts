/**
 * Page source: the text format of the full-page editor (docs/page-editor.md).
 *
 * Shared by the browser (live checks, preview, key panel) and the publish-page
 * Edge Function, so the editor and the server always agree.
 */

import registryJson from './registry.json'
import type { Registry } from './types'

export const REGISTRY = registryJson as Registry

export { parsePageSource, templateFor, pageTypeFor } from './parse'
export type { FragmentTarget, ParseOptions } from './parse'
export { serializePage, serializeFragment, templateModel, fillTemplate } from './serialize'
export { mergeModels, assignSectionIds, sectionIdsOf, spliceFragment } from './merge'
export type { Conflict, MergeResult } from './merge'
export { fromLegacy } from './legacy'
export { citationOrder, serializeCommunity, buildPayload, overlayStructured } from './publish'
export type { PublishPayload, InfoboxRow, BrandRow, ThresholdRow, StatementRow } from './publish'
export { resolveCitation, fromEsummary, fromCrossref, fromDailyMed } from './resolve'
export type { SourceMeta, Lookup, FetchJson } from './resolve'
export { contextAt, panelFor } from './assist'
export type { CursorContext, Panel, PanelEntry } from './assist'
export { findCitations, formatCitations } from './citations'
export { infoboxKeysFor } from './blocks'
export type * from './types'
