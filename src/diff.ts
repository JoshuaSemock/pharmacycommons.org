/**
 * Line diff for page revisions (history and review queue).
 *
 * Classic LCS over lines: fine for community pages (a few hundred lines). For
 * very large inputs it falls back to "everything removed, everything added"
 * rather than allocating a huge table.
 */

export type DiffLine = { op: 'same' | 'add' | 'del'; text: string }

const MAX_CELLS = 4_000_000

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map(text => ({ op: 'del' as const, text })), ...b.map(text => ({ op: 'add' as const, text }))]
  }

  // lcs[i][j] = LCS length of a[i:] and b[j:], stored flat.
  const w = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      out.push({ op: 'del', text: a[i++] })
    } else {
      out.push({ op: 'add', text: b[j++] })
    }
  }
  while (i < a.length) out.push({ op: 'del', text: a[i++] })
  while (j < b.length) out.push({ op: 'add', text: b[j++] })
  return out
}

/** Keeps changed lines plus `context` unchanged lines around them; runs of hidden lines become one `null`. */
export function withContext(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = lines.map(() => false)
  lines.forEach((l, i) => {
    if (l.op === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out: (DiffLine | null)[] = []
  lines.forEach((l, i) => {
    if (keep[i]) out.push(l)
    else if (out.at(-1) !== null) out.push(null)
  })
  return out
}

/** Counts of added and removed lines. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.op === 'add') added++
    else if (l.op === 'del') removed++
  }
  return { added, removed }
}

/** The text a revision is compared on: description, a blank line, then the body. */
export function revisionText(r: { description: string; body_md: string }): string {
  return [r.description.trim() ? `${r.description.trim()}` : '', r.body_md].filter(Boolean).join('\n\n')
}
