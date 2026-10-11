/**
 * Pages written with the phase-15 Overview editor store two fields:
 * page_content.description (the lead) and body_md (any ## sections). This turns
 * them into a page model on the type's template, so the first edit in the
 * full-page editor starts from what readers see today. Nothing is lost: if the
 * old text doesn't parse as page source (say it has a # heading), it all
 * becomes the lead, unchanged.
 */

import { parsePageSource } from './parse'
import { serializeMain, templateModel } from './serialize'
import type { PageContext, PageModel } from './types'

export function fromLegacy(description: string, body: string, ctx: PageContext): PageModel {
  const template = templateModel(ctx)
  const legacy = [description.trim(), body.trim()].filter(Boolean).join('\n\n')
  if (!legacy) return template

  const rest = template.main
    .filter(m => m.kind !== 'lead')
    .map(serializeMain)
    .filter((s): s is string => s !== null)
  const source = [`# ${ctx.title}`, legacy, ...rest].join('\n\n') + '\n'
  const parsed = parsePageSource(source, ctx)
  if (parsed.ok) return { ...parsed.model, brands: template.brands, infobox: template.infobox }

  return { ...template, main: template.main.map(m => (m.kind === 'lead' ? { ...m, markdown: legacy } : m)) }
}
