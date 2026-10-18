/**
 * What each relationship on the Network page means, in plain words.
 *
 * The database decides which predicates become edges and which group they fall
 * in (network_predicate_group() in db/phase19_network.sql). This file only says
 * how to *read* them: the phrase for each direction, and a one-line definition
 * that states what the edge does NOT claim. Every edge on the page is labelled
 * from here, so a class membership can never be mistaken for an indication, and
 * a label-reported side effect can never read as proof of causation.
 *
 * Adding a predicate: add it to `predicates` and to network_predicate_group()
 * in SQL, then one line in PREDICATES below. A predicate missing here still
 * draws, labelled with its raw name and a generic definition; a test fails so
 * it isn't forgotten.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type NetworkGroup = 'classification' | 'composition' | 'use' | 'safety' | 'interaction' | 'lineage'

export const GROUP_ORDER: NetworkGroup[] = ['classification', 'composition', 'use', 'safety', 'interaction', 'lineage']

export type GroupMeta = {
  label: string
  /** What an edge in this group does and does not claim. */
  meaning: string
  /** Cytoscape line style, so groups differ by more than color (there is none). */
  line: 'solid' | 'dashed' | 'dotted'
}

export const GROUPS: Record<NetworkGroup, GroupMeta> = {
  classification: {
    label: 'Classification',
    meaning: 'What kind of thing this is. Sharing a class does not make drugs interchangeable or indicated for the same condition.',
    line: 'solid',
  },
  composition: {
    label: 'Composition',
    meaning: 'What a product contains, from FDA product records. A product may contain other ingredients too.',
    line: 'solid',
  },
  use: {
    label: 'Use',
    meaning: 'A use recorded in a source. This is not a treatment recommendation and says nothing about whether it is right for a patient.',
    line: 'dashed',
  },
  safety: {
    label: 'Safety',
    meaning: 'A warning, contraindication or adverse effect reported by a source. It is an association, not proof of cause, and not every patient is affected.',
    line: 'dotted',
  },
  interaction: {
    label: 'Interactions and genes',
    meaning: 'A recorded interaction, metabolic or pharmacogenomic association. The source text says what to do about it.',
    line: 'dashed',
  },
  lineage: {
    label: 'Chemical lineage',
    meaning: 'A recorded derivation between substances.',
    line: 'solid',
  },
}

export type PredicateMeta = {
  /** Read from the subject: "metformin  <phrase>  Biguanides". */
  forward: string
  /** Read from the object: "Biguanides  <phrase>  metformin". */
  reverse: string
  definition: string
}

export const PREDICATES: Record<string, PredicateMeta> = {
  member_of: {
    forward: 'is a member of',
    reverse: 'has member',
    definition: 'Class membership under a named classification system. The system and how the match was made are shown with the edge.',
  },
  has_member: { forward: 'has member', reverse: 'is a member of', definition: 'Class membership, stated from the class.' },
  subclass_of: {
    forward: 'is a subclass of',
    reverse: 'has subclass',
    definition: 'The parent–child link inside one classification system.',
  },
  has_component: {
    forward: 'contains',
    reverse: 'is a component of',
    definition: 'A product (formulation or combination) lists this substance as an active ingredient.',
  },
  has_formulation: { forward: 'has formulation', reverse: 'is a formulation of', definition: 'A marketed product of this substance.' },
  treats: {
    forward: 'is recorded as treating',
    reverse: 'is recorded as treated by',
    definition: 'A use recorded by a source. Not a recommendation.',
  },
  prevents: {
    forward: 'is recorded as preventing',
    reverse: 'is recorded as prevented by',
    definition: 'A preventive use recorded by a source. Not a recommendation.',
  },
  has_prevention: { forward: 'has recorded prevention', reverse: 'is a recorded prevention for', definition: 'A preventive measure recorded by a source.' },
  has_diagnosis: { forward: 'is associated with diagnosis', reverse: 'is a diagnosis associated with', definition: 'A diagnosis recorded alongside this concept.' },
  has_symptom: { forward: 'is recorded with symptom', reverse: 'is a symptom of', definition: 'A symptom recorded for this concept.' },
  has_side_effect: {
    forward: 'has reported side effect',
    reverse: 'is a reported side effect of',
    definition: 'An adverse effect listed by a source. Frequency and causality are not implied.',
  },
  has_warning: { forward: 'has warning', reverse: 'is a warning for', definition: 'A warning or precaution listed by a source.' },
  has_contraindication: {
    forward: 'has contraindication',
    reverse: 'is a contraindication for',
    definition: 'A contraindication or avoid-together statement as the source words it. Read the source for the conditions.',
  },
  contraindicated_with: { forward: 'is contraindicated with', reverse: 'is contraindicated with', definition: 'An avoid-together statement as the source words it.' },
  causes: {
    forward: 'is recorded as causing',
    reverse: 'is recorded as caused by',
    definition: 'A causal statement made by a source. The evidence level is shown with the edge.',
  },
  has_risk_factor: { forward: 'has risk factor', reverse: 'is a risk factor for', definition: 'A risk factor recorded by a source.' },
  has_lower_risk_than: { forward: 'has lower risk than', reverse: 'has higher risk than', definition: 'A comparison recorded by a source.' },
  is_hazardous: { forward: 'is flagged hazardous', reverse: 'is flagged hazardous', definition: 'A hazard flag from a source.' },
  interacts_with: {
    forward: 'interacts with',
    reverse: 'interacts with',
    definition: 'A contributor-written interaction with a citation. Contributor-added, not reviewed as part of the source data.',
  },
  inhibits: { forward: 'inhibits', reverse: 'is inhibited by', definition: 'A recorded inhibition.' },
  induces: { forward: 'induces', reverse: 'is induced by', definition: 'A recorded induction.' },
  substrate_of: { forward: 'is a substrate of', reverse: 'has substrate', definition: 'A recorded substrate relationship (for example, an enzyme).' },
  is_substrate_of: { forward: 'is a substrate of', reverse: 'has substrate', definition: 'A recorded substrate relationship.' },
  has_pgx_association: {
    forward: 'has pharmacogenomic association with',
    reverse: 'is a pharmacogenomic association of',
    definition: 'A gene–drug association from a pharmacogenomic source. Not a dosing instruction.',
  },
  has_pgx_gene: { forward: 'is associated with gene', reverse: 'is a gene associated with', definition: 'A gene recorded for pharmacogenomic relevance.' },
  has_lab_effect: { forward: 'can affect lab', reverse: 'can be affected by', definition: 'A laboratory effect recorded by a source.' },
  monitored_by: { forward: 'is monitored by', reverse: 'monitors', definition: 'A monitoring parameter recorded by a source.' },
  has_monitoring: { forward: 'has monitoring', reverse: 'is monitoring for', definition: 'A monitoring parameter recorded by a source.' },
  derived_from: { forward: 'is derived from', reverse: 'is a source of', definition: 'A recorded derivation between substances.' },
}

const GENERIC: PredicateMeta = {
  forward: '',
  reverse: '',
  definition: 'A relationship recorded in the Commons. See its source for what it claims.',
}

/** The words for an edge, read from the node it is being shown beside. */
export function predicatePhrase(predicate: string, from: 'subject' | 'object'): string {
  const meta = PREDICATES[predicate]
  const raw = predicate.replace(/_/g, ' ')
  if (!meta) return raw
  return from === 'subject' ? meta.forward : meta.reverse
}

export function predicateDefinition(predicate: string): string {
  return (PREDICATES[predicate] ?? GENERIC).definition
}

export function isGroup(v: string): v is NetworkGroup {
  return (GROUP_ORDER as string[]).includes(v)
}

// ─── Node kinds ──────────────────────────────────────────────────────────────

export type NodeKind = {
  label: string
  /** Cytoscape shape. Kinds differ by shape and border, never by hue. */
  shape: 'ellipse' | 'round-rectangle' | 'diamond' | 'hexagon' | 'octagon' | 'tag' | 'barrel' | 'rhomboid'
  /** Border width in px (a heavier border reads as "more specific"). */
  border: number
}

const KINDS: Record<string, NodeKind> = {
  moiety: { label: 'Drug', shape: 'ellipse', border: 2 },
  precise_form: { label: 'Salt or ester', shape: 'ellipse', border: 1 },
  combination: { label: 'Combination product', shape: 'round-rectangle', border: 2 },
  formulation: { label: 'Brand product', shape: 'round-rectangle', border: 1 },
  class: { label: 'Class', shape: 'diamond', border: 2 },
  clinical: { label: 'Clinical concept', shape: 'hexagon', border: 2 },
  measurement: { label: 'Lab or measurement', shape: 'rhomboid', border: 2 },
  target: { label: 'Biological target', shape: 'octagon', border: 2 },
  functional: { label: 'Herbal or botanical', shape: 'tag', border: 2 },
}

const UNKNOWN_KIND: NodeKind = { label: 'Record', shape: 'ellipse', border: 1 }

export function nodeKind(entityType: string): NodeKind {
  return KINDS[entityType] ?? UNKNOWN_KIND
}

export const KIND_KEYS = Object.keys(KINDS)

/** Where a record's own page lives. Mirrors src/pages/Permalink.tsx. */
export function pagePath(entityType: string, slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9._~+-]*$/i.test(slug)) return null
  const base = entityType === 'class' ? '/classifications' : entityType === 'list' ? '/lists' : '/drugs'
  return `${base}/${encodeURIComponent(slug)}`
}
