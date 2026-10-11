import { citationOrder } from '../pageSource'
import type { FragmentTarget, PageContext, ParseResult } from '../pageSource'
import { CiteMark } from '../components/WikiMarkdown'
import { CommunitySection, LeadText, ReferencesList } from './PageParts'

/**
 * The Preview tab: the page (or section) as it will read once published.
 * Locked sections show as labelled placeholders, since their content comes
 * from the sources and can't change here. Links show as links once the page
 * is saved (the database resolves them); until then they read as plain text.
 */

const SUB_HEADING = { fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 } as const

export default function PagePreview({ result, ctx, target }: { result: ParseResult; ctx: PageContext; target?: FragmentTarget }) {
  const { model } = result
  const order = citationOrder(model)
  const numbers = new Map(order.map((c, i) => [c.key, i + 1]))
  const embedLabel = (name: string) => ctx.registry.embeds.find(e => e.name === name)?.label ?? name
  const railName = target?.kind === 'rail' ? target.name : null
  const showRail = !target || railName !== null
  const hasErrors = result.diagnostics.some(d => d.severity === 'error')

  return (
    <div className="space-y-8">
      {hasErrors && <p className="font-sans text-sm text-ink">This preview skips lines with problems. Fix them on the Source tab.</p>}

      {showRail && model.brands && (!target || railName === 'brands') && (
        <div>
          <h3 className="mb-1 font-semibold text-ink" style={SUB_HEADING}>
            Brand names
          </h3>
          <p className="font-sans text-sm text-ink">
            {model.brands.lines.map((l, i) => (
              <span key={l.brand} className={l.action === 'hide' ? 'line-through' : undefined}>
                {i > 0 && ', '}
                {l.brand}
                {l.action !== 'source' && <CiteMark keys={l.citations.map(c => c.key)} numbers={numbers} />}
                {l.action === 'hide' && <span className="no-underline"> ({l.reason})</span>}
              </span>
            ))}
          </p>
        </div>
      )}

      {showRail && model.infobox && (!target || railName === 'infobox') && (
        <div>
          <h3 className="mb-1 font-semibold text-ink" style={SUB_HEADING}>
            Quick Facts written here
          </h3>
          {model.infobox.lines.length === 0 ? (
            <p className="font-sans text-sm text-ink">None: every row shows the source value.</p>
          ) : (
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-sans text-sm text-ink">
              {model.infobox.lines.map(l => (
                <div key={l.key} className="contents">
                  <dt className="font-semibold">{ctx.infoboxKeys.find(k => k.key === l.key)?.label ?? l.key}</dt>
                  <dd>
                    {l.isNull ? <em>No value (the source is wrong)</em> : l.value}
                    <CiteMark keys={l.citations.map(c => c.key)} numbers={numbers} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {model.main.map((item, i) => {
        if (item.kind === 'lead') {
          if (target && target.kind !== 'lead') return null
          return item.markdown ? (
            <LeadText key="lead" markdown={item.markdown} content={null} numbers={numbers} />
          ) : (
            <p key="lead" className="font-sans text-sm text-ink">
              No lead yet.
            </p>
          )
        }
        if (item.kind === 'embed') {
          if (target) return null
          return (
            <div key={item.name} className="rounded-md border border-dashed border-ink/30 px-3 py-2 font-sans text-sm text-ink">
              Locked section: {embedLabel(item.name)}
              {item.name === 'references' && order.length > 0 && (
                <div className="mt-2">
                  <ReferencesList references={order.map((c, n) => ({ ordinal: n + 1, key: c.key, kind: c.kind, title: null, authors: null, container: null, year: null, volume: null, issue: null, pages: null, doi: null, pmid: null, setid: null, url: null }))} />
                  <p className="mt-1 text-xs">Titles and authors are filled in from PubMed, Crossref and DailyMed when you publish.</p>
                </div>
              )}
            </div>
          )
        }
        return <CommunitySection key={item.id ?? `${item.heading}-${i}`} item={item} content={null} numbers={numbers} onEdit={undefined} />
      })}
    </div>
  )
}
