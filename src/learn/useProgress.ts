/**
 * Learn — where a learner's progress lives right now: the server when signed in, this device when not.
 * On sign-in any guest reviews are replayed oldest-first into the account, then cleared.
 *
 * Destination: src/learn/useProgress.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../auth'
import { countMyNewToday, getMyLimits, getMyStates, recordReview } from './api'
import { clearGuest, flushGuest, guestStates, hasGuestProgress, loadGuest, recordGuestReview } from './guest'
import { countNewToday, DEFAULT_LIMITS, type Limits } from './queue'
import type { ReviewEvent, SchedState } from './types'

export type Progress = {
  ready: boolean
  signedIn: boolean
  states: Map<string, SchedState>
  limits: Limits
  newToday: number
  /** Set when some reviews could not be sent and are waiting on this device. */
  pending: boolean
  failed: boolean
  /** Log a review: send it when signed in (or hold it on the device if that fails), keep it on the device otherwise. */
  record: (event: ReviewEvent) => Promise<void>
}

export function useProgress(): Progress {
  const { user, loading } = useSession()
  const [states, setStates] = useState<Map<string, SchedState>>(new Map())
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS)
  const [newToday, setNewToday] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const signedIn = !!user
  const signedInRef = useRef(false)
  signedInRef.current = signedIn

  useEffect(() => {
    if (loading) return
    let cancelled = false
    setReady(false)
    setFailed(false)
    ;(async () => {
      try {
        if (user) {
          if (hasGuestProgress()) await flushGuest(recordReview)
          const [s, l, n] = await Promise.all([getMyStates(), getMyLimits(), countMyNewToday()])
          if (cancelled) return
          setStates(s)
          setLimits(l)
          setNewToday(n)
          setPending(hasGuestProgress())
        } else {
          const g = loadGuest()
          if (cancelled) return
          setStates(guestStates())
          setLimits(DEFAULT_LIMITS)
          setNewToday(countNewToday(g.events, new Date()))
          setPending(false)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, loading])

  const record = useCallback(async (event: ReviewEvent) => {
    setStates(prev => new Map(prev).set(event.item_id, event.state_after))
    if (event.state_before.state === 'new') setNewToday(n => n + 1)
    if (!signedInRef.current) {
      recordGuestReview(event)
      return
    }
    try {
      await recordReview(event)
    } catch (err) {
      console.error(err)
      recordGuestReview(event) // outbox: replayed on the next load while signed in
      setPending(true)
    }
  }, [])

  return { ready, signedIn, states, limits, newToday, pending, failed, record }
}

/** For tests and sign-out: forget everything held on this device. */
export function forgetDeviceProgress(): void {
  clearGuest()
}
