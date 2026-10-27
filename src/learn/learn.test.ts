import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_KEY, clearGuest, flushGuest, guestStates, hasGuestProgress, loadGuest, recordGuestReview } from './guest'
import { buildQueue, countNewToday, requeue, type QueueEntry } from './queue'
import { newState, schedule } from './scheduler'
import { optionOrder, seededShuffle } from './shuffle'
import type { LearnItem, ReviewEvent, SchedState } from './types'

const NOW = new Date('2026-03-01T12:00:00Z')

function item(id: string, extra: Partial<LearnItem> = {}): LearnItem {
  return {
    id, item_type: 'mcq', template_key: 't', subject_area: 's', topic: 't', subtopic: null, tags: [],
    primary_pcid: null, prompt: 'p', concise_answer: 'a', clinical_rationale: null, clinical_caveats: null,
    mcq_options: null, source_agency: null, source_citation: 'c', source_url: null, license: 'CC0-1.0',
    third_party_sources: [], content_version: 1, ...extra,
  }
}

function reviewed(due: string, state: SchedState['state'] = 'review', stability = 10, last = '2026-02-01T12:00:00Z'): SchedState {
  return { state, step: 0, stability, difficulty: 5, reps: 3, lapses: 0, last_rating: 3, last_reviewed_at: last, due_at: due }
}

describe('seededShuffle / optionOrder', () => {
  it('is deterministic per seed, a permutation, and varies with the seed', () => {
    const a = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(seededShuffle(a, 'x')).toEqual(seededShuffle(a, 'x'))
    expect([...seededShuffle(a, 'x')].sort()).toEqual(a)
    expect(seededShuffle(a, 'x')).not.toEqual(seededShuffle(a, 'y'))
    expect(a).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
  it('keeps fixed-option-order items in authored order', () => {
    const opts = ['1', '2', '3'].map(t => ({ id: t, text: t, is_correct: t === '2' }))
    expect(optionOrder({ id: 'i', tags: ['fixed-option-order'], mcq_options: opts }, 's').map(o => o.id)).toEqual(['1', '2', '3'])
  })
})

describe('buildQueue', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => item(id))

  it('puts due learning cards first, then lowest-retrievability reviews, and skips cards not yet due', () => {
    const states = new Map<string, SchedState>([
      ['a', reviewed('2026-02-20T12:00:00Z', 'review', 5)], // overdue, low stability => lowest R
      ['b', reviewed('2026-02-28T12:00:00Z', 'review', 60)],
      ['c', reviewed('2026-03-01T11:55:00Z', 'learning', 1, '2026-03-01T11:45:00Z')],
      ['d', reviewed('2026-03-09T12:00:00Z')], // not due
    ])
    const q = buildQueue(items, states, NOW, { reviews: 100, newItems: 0 })
    expect(q.entries.map(e => e.item.id)).toEqual(['c', 'a', 'b'])
    expect(q.dueCount).toBe(3)
  })

  it('caps reviews and new cards, and counts cards started today against the new limit', () => {
    const q = buildQueue(items, new Map(), NOW, { reviews: 100, newItems: 3 }, { newToday: 1 })
    expect(q.entries.map(e => e.item.id)).toEqual(['a', 'b'])
    expect(q.newAvailable).toBe(6)
    const capped = buildQueue(
      items,
      new Map(items.slice(0, 4).map(i => [i.id, reviewed('2026-02-20T12:00:00Z')])),
      NOW,
      { reviews: 2, newItems: 0 },
    )
    expect(capped.entries).toHaveLength(2)
  })

  it('interleaves new cards among due cards without reordering the due ones', () => {
    const states = new Map(['a', 'b', 'c', 'd'].map((id, i) => [id, reviewed(`2026-02-2${i}T12:00:00Z`, 'review', 5 + i)]))
    const q = buildQueue(items, states, NOW, { reviews: 100, newItems: 2 })
    const ids = q.entries.map(e => e.item.id)
    expect(ids).toHaveLength(6)
    expect(ids.filter(id => 'abcd'.includes(id))).toEqual([...q.entries.filter(e => e.state).map(e => e.item.id)])
    expect(ids[0]).not.toBe('e')
  })
})

describe('requeue', () => {
  it('brings a failed card back within the session but not a card due days away', () => {
    const rest: QueueEntry[] = ['x', 'y', 'z', 'w', 'v', 'u'].map(id => ({ item: item(id), state: null }))
    const failed = schedule(schedule(newState(NOW), 4, NOW), 1, new Date('2026-03-20T00:00:00Z'))
    const back = requeue(rest, item('f'), failed, new Date(failed.last_reviewed_at as string))
    expect(back.map(e => e.item.id)).toEqual(['x', 'y', 'z', 'w', 'f', 'v', 'u'])
    const later = schedule(newState(NOW), 4, NOW)
    expect(requeue(rest, item('f'), later, NOW)).toHaveLength(6)
  })
})

describe('countNewToday', () => {
  it('counts only first reviews made today', () => {
    const ev = (at: string, st: SchedState['state']) => ({ reviewed_at: at, state_before: { ...newState(NOW), state: st } })
    expect(countNewToday([ev('2026-03-01T13:00:00Z', 'new'), ev('2026-03-01T13:30:00Z', 'review'), ev('2026-02-27T13:00:00Z', 'new')], NOW)).toBe(1)
  })
})

describe('guest progress', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    })
    clearGuest()
  })

  function event(id: string, at: string): ReviewEvent {
    const before = newState(new Date(at))
    return {
      client_event_id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, item_id: `item-${id}`, collection_id: null, mode: 'flashcard',
      rating: 3, is_correct: null, selected_option_id: null, was_unsure: false, duration_ms: 1200, reviewed_at: at,
      scheduler_version: 'fsrs-5.0', state_before: before, state_after: schedule(before, 3, new Date(at)),
    }
  }

  it('stores state and events, and survives a reload', () => {
    expect(hasGuestProgress()).toBe(false)
    recordGuestReview(event('1', '2026-03-01T10:00:00Z'))
    expect(hasGuestProgress()).toBe(true)
    expect(guestStates().get('item-1')?.state).toBe('learning')
    expect(JSON.parse(store.get(GUEST_KEY) as string).events).toHaveLength(1)
  })

  it('flushes oldest first, clears when everything is sent, and keeps the rest after a failure', async () => {
    recordGuestReview(event('2', '2026-03-01T11:00:00Z'))
    recordGuestReview(event('1', '2026-03-01T10:00:00Z'))
    recordGuestReview(event('3', '2026-03-01T12:00:00Z'))
    const sentIds: string[] = []
    const res = await flushGuest(async e => {
      if (e.item_id === 'item-3') throw new Error('offline')
      sentIds.push(e.item_id)
    })
    expect(sentIds).toEqual(['item-1', 'item-2'])
    expect(res).toEqual({ sent: 2, remaining: 1 })
    expect(loadGuest().events.map(e => e.item_id)).toEqual(['item-3'])
    expect(await flushGuest(async () => {})).toEqual({ sent: 1, remaining: 0 })
    expect(hasGuestProgress()).toBe(false)
  })

  it('works when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    clearGuest()
    recordGuestReview(event('9', '2026-03-01T10:00:00Z'))
    expect(guestStates().size).toBe(1)
  })
})
