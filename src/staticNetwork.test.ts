import { beforeAll, describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import {
  compareArrays, networkCompare, networkEdgeEvidence, networkEdges, networkHierarchy, networkNeighborhood, networkRelations,
} from './staticNetwork'
import type { Db, SqlRow, SqlValue } from './staticNetwork'

// A tiny copy of network.sqlite (scripts/static/export-sqlite.mjs): two drugs, a brand,
// a class tree, a list and one statement. scripts/static/check-network.mjs compares the
// same functions with the database's own on real data.
const SCHEMA = `
create table entities (pcid integer primary key, slug text, name text, entity_type text);
create table moieties (pcid integer primary key, term_type text);
create table drug_classes (pcid integer primary key, parent_pcid integer, class_type text, source_system text, source_code text, level integer);
create table class_members (class_pcid integer, member_pcid integer, is_direct integer, source_system text, match_basis text);
create table clinical_statements (statement_id integer primary key, subject_pcid integer, predicate text, object_pcid integer,
  evidence_level text, source_agency text, source_doc_id text, source_section text, source_quote text, risk_profile text,
  qualifier_key text, qualifier_value text, object_label text, updated_at text);
create table lists (pcid integer primary key, title text, kind text, published integer, jurisdiction text, source_citation text,
  source_url text, license text, rank_label text, measure_label text, measure_unit text, status_label text);
create table list_items (list_pcid integer, member_pcid integer, position integer, rank integer, value text, legal_status text, note text, sources text);
create table data_sources (source_key text primary key, name text, url text, license text);
create table fda_applications (appl_no text primary key, application_type text, sponsor_name text);
insert into entities values
  (1, 'metformin', 'metformin', 'moiety'), (2, 'glipizide', 'glipizide', 'moiety'), (3, 'glucophage', 'GLUCOPHAGE', 'formulation'),
  (10, 'alimentary', 'Alimentary tract', 'class'), (11, 'blood-glucose', 'Blood glucose lowering drugs', 'class'),
  (12, 'biguanides', 'Biguanides', 'class'), (13, 'sulfonylureas', 'Sulfonylureas', 'class'), (20, 'notable', 'Notable drugs', 'list');
insert into moieties values (1, 'Core moiety'), (2, 'Core moiety');
insert into drug_classes values (10, null, 'atc', 'ATC', 'A', 1), (11, 10, 'atc', 'ATC', 'A10', 2),
  (12, 11, 'atc', 'ATC', 'A10BA', 3), (13, 11, 'atc', 'ATC', 'A10BB', 3);
insert into class_members values (12, 1, 1, 'ATC', 'rxclass'), (11, 1, 0, 'ATC', null), (13, 2, 1, 'ATC', 'rxclass'), (11, 2, 0, 'ATC', null);
insert into clinical_statements values (7, 3, 'has_component', 1, 'label', 'FDA', 'Drugs@FDA appl NDA020357', 'Description', 'contains metformin', null, null, null, null, '2026-09-25T12:00:00+00:00');
insert into lists values (20, 'Notable drugs', 'reference', 1, 'US', 'Pharmacy Commons', null, 'CC0-1.0', null, null, null, null);
insert into list_items values (20, 1, 1, 1, null, null, null, '["Joshua"]'), (20, 2, 2, 2, null, null, null, null);
insert into data_sources values ('drugsfda', 'Drugs@FDA', 'https://www.fda.gov/drugsatfda', 'Public domain');
insert into fda_applications values ('NDA020357', 'NDA', 'BMS');
`

let db: Db
beforeAll(async () => {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  raw.exec(SCHEMA)
  db = {
    all(sql: string, params: SqlValue[] = []): SqlRow[] {
      const st = raw.prepare(sql)
      st.bind(params)
      const out: SqlRow[] = []
      while (st.step()) out.push(st.getAsObject() as SqlRow)
      st.free()
      return out
    },
  }
})

describe('networkEdges', () => {
  it('collects memberships, statements and lists touching a concept, once per id', () => {
    const ids = networkEdges(db, 1).map(e => `${e.id} ${e.grp}${e.direct ? '' : ' (inherited)'}`)
    expect(ids).toEqual([
      'cm:11:1 classification (inherited)',
      'cm:12:1 classification',
      'cs:7 composition',
      'li:20:1 lists',
    ])
    expect(networkEdges(db, 11).map(e => e.id)).toEqual(['cm:11:1', 'cm:11:2', 'sc:11:10', 'sc:12:11', 'sc:13:11'])
  })
})

describe('networkNeighborhood', () => {
  it('pages by rank within each group, classification first, and counts every group', () => {
    const r = networkNeighborhood(db, { p_pcid: 1, p_limit: 3 })
    expect(r.center).toMatchObject({ pcid: 1, name: 'metformin', term_type: 'Core moiety' })
    expect(r.edges.map(e => e.id)).toEqual(['cm:12:1', 'cs:7', 'li:20:1'])
    expect(r.group_counts).toEqual({ classification: 2, composition: 1, lists: 1 })
    expect(r).toMatchObject({ total: 4, offset: 0, limit: 3 })
    expect(r.nodes.map(n => n.pcid)).toEqual([12, 3, 20, 1]) // by name
  })
  it('filters by group', () => {
    const r = networkNeighborhood(db, { p_pcid: 1, p_groups: ['lists'] })
    expect(r.edges.map(e => e.id)).toEqual(['li:20:1'])
    expect(r.total).toBe(1)
  })
})

describe('networkRelations', () => {
  it('lists the other concepts alphabetically, with a name filter', () => {
    const r = networkRelations(db, { p_pcid: 1 })
    expect(r.rows.map(x => [x.node.name, x.outgoing])).toEqual([
      ['Biguanides', true], ['Blood glucose lowering drugs', true], ['GLUCOPHAGE', false], ['Notable drugs', true],
    ])
    expect(networkRelations(db, { p_pcid: 1, p_query: 'GLUC' }).rows.map(x => x.node.pcid)).toEqual([11, 3])
  })
})

describe('networkCompare', () => {
  it('turns edges inside out: what both share and what only one has', () => {
    const r = networkCompare(db, { p_pcids: [2, 1] })!
    expect(r.pcids).toEqual([1, 2])
    expect(r.sets).toEqual([
      { members: [1, 2], count: 2, groups: { classification: 1, lists: 1 } },
      { members: [1], count: 2, groups: { classification: 1, composition: 1 } },
      { members: [2], count: 1, groups: { classification: 1 } },
    ])
    expect(r.rows[0]).toMatchObject({ members: [1, 2], group: 'classification', rn: 1, node: { pcid: 11 } })
    expect(r.rows[0].links.map(l => l.src)).toEqual([1, 2])
    expect(networkCompare(db, { p_pcids: [1] })).toBeNull()
  })
})

describe('networkHierarchy', () => {
  it('walks up each tree and marks the lowest shared class', () => {
    const r = networkHierarchy(db, { p_pcids: [1, 2] })!
    const byPcid = Object.fromEntries(r.nodes.map(n => [n.pcid, n]))
    expect(byPcid[11]).toMatchObject({ members: [1, 2], meeting: true, parent: 10 })
    expect(byPcid[10]).toMatchObject({ members: [1, 2], meeting: false })
    expect(byPcid[12]).toMatchObject({ members: [1], meeting: false })
    expect(r.anchors).toEqual([{ concept: 1, class: 12 }, { concept: 2, class: 13 }])
  })
})

describe('networkEdgeEvidence', () => {
  it('describes each kind of edge', () => {
    expect(networkEdgeEvidence(db, { p_edge_id: 'cs:7' })).toMatchObject({
      kind: 'clinical_statement', source_quote: 'contains metformin',
      source: { name: 'Drugs@FDA', record_label: 'NDA 020357', record_sponsor: 'BMS' },
    })
    expect(networkEdgeEvidence(db, { p_edge_id: 'cm:12:1' })).toMatchObject({ kind: 'class_membership', direct: true, class_code: 'A10BA' })
    expect(networkEdgeEvidence(db, { p_edge_id: 'li:20:1' })).toMatchObject({ kind: 'list_membership', rank: 1, sources: ['Joshua'] })
    expect(networkEdgeEvidence(db, { p_edge_id: 'sc:12:11' })).toMatchObject({ kind: 'class_hierarchy', level: 3 })
    expect(networkEdgeEvidence(db, { p_edge_id: 'cm:x:1' })).toBeNull()
    expect(networkEdgeEvidence(db, { p_edge_id: 'co:5' })).toBeNull()
  })
})

describe('compareArrays', () => {
  it('orders like Postgres arrays', () => {
    expect(compareArrays([1, 2], [1, 3])).toBeLessThan(0)
    expect(compareArrays([1], [1, 2])).toBeLessThan(0)
    expect(compareArrays([2], [1, 9])).toBeGreaterThan(0)
  })
})
