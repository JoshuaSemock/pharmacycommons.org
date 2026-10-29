import { describe, expect, it } from 'vitest'
import { CRAM_GAP, cramQueue, cramRequeue } from './cram'
import type { LearnItem } from './types'

const item = (id: string) => ({ id }) as LearnItem
const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(item)

describe('cram queue', () => {
  it('holds every card once, shuffled by seed, with no schedule state', () => {
    const q = cramQueue(items, 'seed-1')
    expect(q.map(e => e.item.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(q.every(e => e.state === null)).toBe(true)
    expect(cramQueue(items, 'seed-1').map(e => e.item.id)).toEqual(q.map(e => e.item.id))
  })

  it('drops a card you got, and brings a missed one back a few cards later', () => {
    const rest = cramQueue(items.slice(0, 6), 's').slice(1)
    expect(cramRequeue(rest, item('x'), false)).toHaveLength(5)
    const again = cramRequeue(rest, item('x'), true)
    expect(again).toHaveLength(6)
    expect(again[CRAM_GAP].item.id).toBe('x')
  })

  it('puts a missed card at the end when fewer cards remain than the gap', () => {
    const rest = cramQueue(items.slice(0, 3), 's').slice(1)
    const again = cramRequeue(rest, item('x'), true)
    expect(again.map(e => e.item.id).at(-1)).toBe('x')
    expect(cramRequeue([], item('x'), true).map(e => e.item.id)).toEqual(['x'])
  })
})
