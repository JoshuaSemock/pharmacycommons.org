/**
 * Page source: the text format of the full-page editor (docs/page-editor.md).
 *
 * Shared by the browser (live checks, preview, key panel) and the publish-page
 * Edge Function, so the editor and the server always agree.
 */

import registryJson from './registry.json'
import type { Registry } from './types'

export const REGISTRY = registryJson as Registry

export { parsePageSource, templateFor, MAX_SOURCE_LENGTH } from './parse'
export type { FragmentTarget, ParseOptions } from './parse'
export { serializePage, serializeFragment, serializeMain, templateModel, formatThreshold } from './serialize'
export { mergeModels, assignSectionIds, sectionIdsOf, spliceFragment, itemId } from './merge'
export type { Conflict, MergeResult } from './merge'
export { fromLegacy } from './legacy'
export { citationOrder, serializeCommunity, bodyMarkdown, buildPayload, overlayStructured, citationsFromText } from './publish'
export type { PublishPayload, InfoboxRow, BrandRow, ThresholdRow } from './publish'
export { resolveCitation, fromEsummary, fromCrossref, fromDailyMed } from './resolve'
export type { SourceMeta, Lookup, FetchJson } from './resolve'
export { contextAt, panelFor } from './assist'
export type { CursorContext, Panel, PanelEntry } from './assist'
export { parseCitationKey, findCitations, formatCitations } from './citations'
export { NULL_TOKEN, stripComment } from './blocks'
export { htmlMessage } from './prose'
export type * from './types'
