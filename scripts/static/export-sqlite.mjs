#!/usr/bin/env node
// Query data for the static edition (docs/static-export.md, "Live queries without a database").
// Read straight from the local database, so it can run beside or instead of record.mjs.
//
//   <out>/site/data/search-index.json   the search_index view, grouped by PCID, for the
//                                       typo-tolerant header search (src/staticSearch.ts)
//   <out>/site/data/db/network.sqlite.gz  the tables the Network pages query, as SQLite, for
//                                       src/staticNetwork.ts (sql.js in the browser); gzipped
//                                       because GitHub Pages does not compress .sqlite files
//   <out>/sqlite/network.sqlite         the same database uncompressed (not published), for
//                                       scripts/static/check-network.mjs
//   <out>/static-query.tar.gz           data/search-index.json + data/db/, for the GitHub release
//                                       `static-data` beside static-data.tar.gz; the deploy workflow
//                                       adds it to the site when it is there (about 4 MB, so a
//                                       refresh of these files needs no re-upload of the big file)
//
// Usage: node scripts/static/export-sqlite.mjs --out ../static-out [--db <postgres url>]
//   --db defaults to the local stack: postgresql://postgres:postgres@127.0.0.1:54322/postgres
// Needs Node 22.5+ (node:sqlite). Local only; writes only under --out.
// Destination: scripts/static/export-sqlite.mjs

import { mkdirSync, writeFileSync, rmSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
if (!args.out) { console.error('Need --out <dir>.'); process.exit(2) }
const DB = args.db ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const dataDir = join(args.out, 'site', 'data')
mkdirSync(join(dataDir, 'db'), { recursive: true })
mkdirSync(join(args.out, 'sqlite'), { recursive: true })

// PCIDs and ids are bigint; all fit in a double, and SQLite stores them as integers.
pg.types.setTypeParser(20, v => Number(v))
const client = new pg.Client({ connectionString: DB })
await client.connect()
await client.query('set default_transaction_read_only = on')

const size = f => {
  const raw = statSync(f).size
  const gz = gzipSync(readFileSync(f), { level: 9 }).length
  return `${(raw / 1048576).toFixed(2)} MB raw, ${(gz / 1048576).toFixed(2)} MB gzip`
}

// ─── Search index ────────────────────────────────────────────────────────────
{
  const { rows } = await client.query(`
    select s.pcid::bigint as pcid, s.entity_type, s.slug, s.name, s.src, s.term,
           (m.term_type is not distinct from 'Core moiety') as core
      from search_index s left join moieties m on m.pcid = s.pcid
     order by s.pcid, case s.src when 'name' then 0 else 1 end, s.term`)
  const types = []
  const srcs = ['name', 'brand', 'alias', 'code']
  const groups = []
  let cur = null
  for (const r of rows) {
    let t = types.indexOf(r.entity_type)
    if (t < 0) t = types.push(r.entity_type) - 1
    const s = srcs.indexOf(r.src)
    if (s < 0) throw new Error(`unknown search_index.src ${r.src}`)
    const pcid = Number(r.pcid)
    if (!cur || cur[0] !== pcid) {
      cur = [pcid, t, r.slug, r.name, r.core ? 1 : 0, []]
      groups.push(cur)
    }
    cur[5].push([s, r.term])
  }
  const file = join(dataDir, 'search-index.json')
  writeFileSync(file, JSON.stringify({ v: 1, types, srcs, groups }))
  console.log(`search-index.json: ${rows.length} rows, ${groups.length} PCIDs, ${size(file)}`)
}

// ─── Network database ────────────────────────────────────────────────────────
// Only the columns network_edges / _neighborhood / _relations / _compare / _hierarchy /
// _edge_evidence read (db/phase19, 32a, 32b, 33). Community statements are left out:
// accounts are off in the static edition, and the pages ask with include_community = false.
{
  const { DatabaseSync } = await import('node:sqlite')
  const file = join(args.out, 'sqlite', 'network.sqlite')
  if (existsSync(file)) rmSync(file)
  const db = new DatabaseSync(file)
  db.exec(`pragma page_size = 4096; pragma journal_mode = off; pragma synchronous = off;`)

  const tables = [
    ['entities', `select pcid, slug, name, entity_type from entities`,
      `create table entities (pcid integer primary key, slug text, name text, entity_type text)`],
    ['moieties', `select pcid, term_type from moieties`,
      `create table moieties (pcid integer primary key, term_type text)`],
    ['drug_classes', `select pcid, parent_pcid, class_type, source_system, source_code, level from drug_classes`,
      `create table drug_classes (pcid integer primary key, parent_pcid integer, class_type text, source_system text, source_code text, level integer)`],
    ['class_members', `select class_pcid, member_pcid, is_direct::int, source_system, match_basis from class_members`,
      `create table class_members (class_pcid integer not null, member_pcid integer not null, is_direct integer not null, source_system text, match_basis text, primary key (class_pcid, member_pcid)) without rowid`],
    ['clinical_statements', `select statement_id, subject_pcid, predicate, object_pcid, evidence_level, source_agency,
        source_doc_id, source_section, source_quote, risk_profile, qualifier_key, qualifier_value, object_label,
        to_json(updated_at) #>> '{}' from clinical_statements`,
      `create table clinical_statements (statement_id integer primary key, subject_pcid integer, predicate text, object_pcid integer,
        evidence_level text, source_agency text, source_doc_id text, source_section text, source_quote text, risk_profile text,
        qualifier_key text, qualifier_value text, object_label text, updated_at text)`],
    ['lists', `select pcid, title, kind, published::int, jurisdiction, source_citation, source_url, license, rank_label,
        measure_label, measure_unit, status_label from lists`,
      `create table lists (pcid integer primary key, title text, kind text, published integer, jurisdiction text, source_citation text,
        source_url text, license text, rank_label text, measure_label text, measure_unit text, status_label text)`],
    ['list_items', `select list_pcid, member_pcid, position, rank, value::text, legal_status, note, to_json(sources)::text from list_items`,
      `create table list_items (list_pcid integer, member_pcid integer, position integer, rank integer, value text, legal_status text, note text, sources text)`],
    ['data_sources', `select source_key, name, url, license from data_sources`,
      `create table data_sources (source_key text primary key, name text, url text, license text)`],
    ['fda_applications', `select appl_no, application_type, sponsor_name from fda_applications
        where appl_no in (select substr(source_doc_id, length('Drugs@FDA appl ') + 1) from clinical_statements
                           where source_doc_id like 'Drugs@FDA appl %')`,
      `create table fda_applications (appl_no text primary key, application_type text, sponsor_name text)`],
  ]
  for (const [name, select, create] of tables) {
    db.exec(create)
    const { rows, fields } = await client.query({ text: select, rowMode: 'array' })
    const ins = db.prepare(`insert into ${name} values (${fields.map(() => '?').join(',')})`)
    db.exec('begin')
    for (const r of rows) ins.run(...r)
    db.exec('commit')
    console.log(`  ${name}: ${rows.length}`)
  }
  db.exec(`
    create index class_members_member on class_members (member_pcid, class_pcid);
    create index drug_classes_parent on drug_classes (parent_pcid);
    create index statements_subject on clinical_statements (subject_pcid);
    create index statements_object on clinical_statements (object_pcid);
    create index list_items_member on list_items (member_pcid);
    create index list_items_list on list_items (list_pcid, member_pcid);
    create index entities_name on entities (lower(name));
    create table meta (key text primary key, value text);
  `)
  db.prepare('insert into meta values (?, ?)').run('exported_at', new Date().toISOString())
  db.exec('analyze; vacuum;')
  db.close()
  const gz = join(dataDir, 'db', 'network.sqlite.gz')
  writeFileSync(gz, gzipSync(readFileSync(file), { level: 9 }))
  console.log(`network.sqlite: ${size(file)} -> ${gz}`)
}

await client.end()

const tgz = join(args.out, 'static-query.tar.gz')
const tar = spawnSync('tar', ['-czf', tgz, '-C', join(args.out, 'site'), 'data/search-index.json', 'data/db'], { stdio: 'inherit' })
if (tar.status !== 0) { console.error('tar failed'); process.exit(1) }
console.log(`${tgz}: ${(statSync(tgz).size / 1048576).toFixed(2)} MB`)
