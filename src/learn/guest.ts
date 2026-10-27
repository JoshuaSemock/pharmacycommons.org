/**
 * Learn — guest mode (docs/learn.md §4.4). Anyone can study without an account; progress lives in this
 * browser (localStorage key `pc_learn_guest_v1`, with an in-memory fallback when storage is blocked)
 * and is replayed to the server, in order, when the guest signs in. The server logs every replayed
 * event but only lets an event change scheduling state if it is newer than the stored one, so
 * replaying can never overwrite progress made on another device.
 *
 * Destination: src/learn/guest.ts
 */

import type { ReviewEvent, SchedState } from './types'

export const GUEST_KEY = 'pc_learn_guest_v1'
export const MAX_GUEST_EVENTS = 5000

export type GuestData = {
  version: 1
  states: Record<string, SchedState>
  events: ReviewEvent[]
}

const empty = (): GuestData => ({ version: 1, states: {}, events: [] })

let memory: GuestData | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadGuest(): GuestData {
  const store = storage()
  if (store) {
    try {
      const raw = store.getItem(GUEST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GuestData>
        if (parsed && parsed.version === 1 && parsed.states && Array.isArray(parsed.events)) {
          return { version: 1, states: parsed.states, events: parsed.events }
        }
      }
    } catch {
      /* corrupt or blocked: fall through to memory */
    }
  }
  return memory ?? empty()
}

function save(data: GuestData): void {
  memory = data
  const store = storage()
  if (!store) return
  try {
    store.setItem(GUEST_KEY, JSON.stringify(data))
  } catch {
    /* quota or blocked: memory copy still works for this visit */
  }
}

/** Record a review: update the item's state and append to the event log (oldest dropped past the cap). */
export function recordGuestReview(event: ReviewEvent): GuestData {
  const data = loadGuest()
  data.states[event.item_id] = event.state_after
  data.events.push(event)
  if (data.events.length > MAX_GUEST_EVENTS) data.events.splice(0, data.events.length - MAX_GUEST_EVENTS)
  save(data)
  return data
}

export function guestStates(): Map<string, SchedState> {
  return new Map(Object.entries(loadGuest().states))
}

export function hasGuestProgress(): boolean {
  return loadGuest().events.length > 0
}

export function clearGuest(): void {
  memory = null
  const store = storage()
  try {
    store?.removeItem(GUEST_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Send the guest's events to the server oldest first. `send` resolves when an event is recorded (or was
 * already). Stops at the first failure and keeps the unsent events, so a retry continues where it stopped.
 * Returns how many were sent and how many remain.
 */
export async function flushGuest(send: (event: ReviewEvent) => Promise<void>): Promise<{ sent: number; remaining: number }> {
  const data = loadGuest()
  const ordered = [...data.events].sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
  let sent = 0
  for (const event of ordered) {
    try {
      await send(event)
      sent += 1
    } catch {
      break
    }
  }
  const remaining = ordered.slice(sent)
  if (remaining.length === 0) clearGuest()
  else save({ ...data, events: remaining })
  return { sent, remaining: remaining.length }
}
