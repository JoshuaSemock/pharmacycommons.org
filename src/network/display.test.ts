import { afterEach, describe, expect, it, vi } from 'vitest'
import { RANGES, defaultDisplay, degrees, loadDisplay, minZoomedFont, nodeSize, sanitizeDisplay, saveDisplay } from './display'

afterEach(() => vi.unstubAllGlobals())

describe('sanitizeDisplay', () => {
  it('falls back to defaults for anything that is not a settings object', () => {
    for (const bad of [null, undefined, 'x', 42, [], true]) expect(sanitizeDisplay(bad)).toEqual(defaultDisplay())
  })

  it('keeps valid values, replaces wrong types, and clamps numbers into range', () => {
    const d = sanitizeDisplay({ arrows: false, sizeByDegree: 'yes', textZoom: 9, linkWidth: -4, repel: 'big', linkDistance: 5000, physics: true })
    expect(d.arrows).toBe(false)
    expect(d.sizeByDegree).toBe(true) // wrong type: default
    expect(d.textZoom).toBe(RANGES.textZoom.max)
    expect(d.linkWidth).toBe(RANGES.linkWidth.min)
    expect(d.repel).toBe(defaultDisplay().repel)
    expect(d.linkDistance).toBe(RANGES.linkDistance.max)
    expect(d.physics).toBe(true)
  })

  it('ignores NaN and Infinity', () => {
    const d = sanitizeDisplay({ textZoom: NaN, linkWidth: Infinity })
    expect(d.textZoom).toBe(defaultDisplay().textZoom)
    expect(d.linkWidth).toBe(defaultDisplay().linkWidth)
  })

  it('starts with physics off, so the page opens still and settled', () => {
    expect(defaultDisplay().physics).toBe(false)
  })
})

describe('storage', () => {
  it('round-trips through localStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } })
    saveDisplay({ ...defaultDisplay(), arrows: false, linkWidth: 2.5 })
    expect(loadDisplay()).toEqual({ ...defaultDisplay(), arrows: false, linkWidth: 2.5 })
  })

  it('survives blocked or corrupt storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(loadDisplay()).toEqual(defaultDisplay())
    expect(() => saveDisplay(defaultDisplay())).not.toThrow()
    vi.stubGlobal('window', { localStorage: { getItem: () => '{not json', setItem: () => {} } })
    expect(loadDisplay()).toEqual(defaultDisplay())
  })
})

describe('nodeSize and degrees', () => {
  it('grows with connections, slowly, and stays within bounds', () => {
    const sizes = [0, 1, 4, 16, 64, 1000].map(d => nodeSize(d, false, true))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
    expect(sizes[0]).toBeGreaterThanOrEqual(26)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(78)
    expect(nodeSize(40, false, true)).toBeGreaterThan(nodeSize(2, false, true))
  })

  it('uses fixed sizes when sizing is off, with the starting concept larger', () => {
    expect(nodeSize(500, false, false)).toBe(38)
    expect(nodeSize(0, true, false)).toBe(54)
  })

  it('never makes the starting concept smaller than its normal size', () => {
    expect(nodeSize(0, true, true)).toBe(54)
    expect(nodeSize(1000, true, true)).toBe(78)
  })

  it('counts drawn edges per drawn concept, including concepts with none', () => {
    const d = degrees({
      nodes: [{ pcid: 1 }, { pcid: 2 }, { pcid: 3 }],
      edges: [
        { subject: 2, object: 1 },
        { subject: 3, object: 1 },
      ],
    })
    expect(d.get(1)).toBe(2)
    expect(d.get(2)).toBe(1)
    expect(degrees({ nodes: [{ pcid: 9 }], edges: [] }).get(9)).toBe(0)
  })
})

describe('minZoomedFont', () => {
  it('maps the text-fade slider to 4–16 px', () => {
    expect(minZoomedFont(0)).toBe(4)
    expect(minZoomedFont(1)).toBe(16)
    expect(minZoomedFont(5)).toBe(16)
    expect(minZoomedFont(-1)).toBe(4)
  })
})
