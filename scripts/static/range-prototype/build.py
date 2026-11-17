# One SQLite file holding everything the static edition serves, for the range-request test
# in docs/sqlite-range-prototype.md. Not used by the site.
# Usage: python3 build.py <static-out dir (export-sqlite.mjs)> <unpacked static-data.tar.gz dir> [page_size]
import sqlite3, os, gzip, json, glob, sys, time, re
out_dir, rel = sys.argv[1], sys.argv[2]
page = int(sys.argv[3]) if len(sys.argv) > 3 else 4096
out = f'proto-{page}.sqlite'
if os.path.exists(out): os.remove(out)
src = sqlite3.connect(os.path.join(out_dir, 'sqlite', 'network.sqlite'))
db = sqlite3.connect(out)
db.execute(f'pragma page_size={page}'); db.execute('pragma journal_mode=off'); db.execute('pragma synchronous=off')
# network tables
for (sql,) in src.execute("select sql from sqlite_master where type='table' and name not like 'sqlite_%'"):
    db.execute(sql)
db.execute("attach os.path.join(out_dir, 'sqlite', 'network.sqlite') as n")
for (name,) in src.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"):
    db.execute(f'insert into main."{name}" select * from n."{name}"')
db.commit(); db.execute('detach n')
for (sql,) in src.execute("select sql from sqlite_master where type='index' and sql is not null"):
    db.execute(sql)
# route bundles (the static edition's recorded answers), gzipped per row
db.execute('create table routes (hash text primary key, bundle blob) without rowid')
t=time.time(); n=0; raw=0; gz=0
for f in glob.glob(os.path.join(rel, 'data', 'p', '*', '*.json')):
    b=open(f,'rb').read(); z=gzip.compress(b, 6); raw+=len(b); gz+=len(z); n+=1
    db.execute('insert into routes values (?,?)', (os.path.basename(f)[:-5], z))
db.commit(); print('routes', n, raw//2**20, 'MB raw', gz//2**20, 'MB gz', round(time.time()-t), 's')
# API documents, gzipped per row
db.execute('create table docs (pcid integer primary key, doc blob)')
n=0; raw=0; gz=0
for f in glob.glob(os.path.join(rel, 'api-static', 'v1', 'entities', 'PCID-*.json')):
    b=open(f,'rb').read(); z=gzip.compress(b, 6); raw+=len(b); gz+=len(z); n+=1
    db.execute('insert into docs values (?,?)', (int(os.path.basename(f)[5:-5]), z))
db.commit(); print('docs', n, raw//2**20, 'MB raw', gz//2**20, 'MB gz')
# search index
idx=json.load(open(os.path.join(out_dir, 'site', 'data', 'search-index.json')))
db.execute('create table search_index (pcid integer, entity_type text, slug text, name text, src text, term text, key text)')
for pcid,t,slug,name,core,rows in idx['groups']:
    for s,term in rows:
        db.execute('insert into search_index values (?,?,?,?,?,?,?)',(pcid, idx['types'][t], slug, name, idx['srcs'][s], term, re.sub('[^a-z0-9]+',' ',term.lower()).strip()))
db.execute('create index search_key on search_index (key)')
db.commit(); db.execute('analyze'); db.execute('vacuum'); db.close()
print(out, os.path.getsize(out)//2**20, 'MB')
