/**
 * Learn — where a learner's progress lives right now: the server when signed in, this device when not.
 * On sign-in any guest reviews are replayed oldest-first into the account, then cleared.
 *
 * Destination: src/learn/useProgress.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../auth'
import { countMyNewToday, getMySettings, getMyStates, recordReview, saveMySettings } from './api'
import { clearGuest, flushGuest, guestStates, hasGuestProgress, loadGuest, recordGuestReview } from './guest'
import { countNewToday, type Limits } from './queue'
import { clampLimits, DEFAULT_SETTINGS, readLocalSettings, sameSettings, writeLocalSettings, type LearnSettings } from './settings'
import type { ReviewEvent, SchedState } from './types'

export type Progress = {
  ready: boolean
  signedIn: boolean
  states: Map<string, SchedState>
  limits: Limits
  /** Daily limits and the hide-options choice: from the account when signed in, this browser otherwise. */
  settings: LearnSettings
  /** Change settings; they apply at once, are kept on this device, and are saved to the account when signed in. */
  updateSettings: (patch: { limits?: Partial<Limits>; coverOptions?: boolean }) => void
  /** True when the last save to the account failed (the change still holds on this device). */
  settingsSaveFailed: boolean
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
  const [settings, setSettings] = useState<LearnSettings>(readLocalSettings)
  const [settingsSaveFailed, setSettingsSaveFailed] = useState(false)
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
          const [s, remote, n] = await Promise.all([
            getMyStates(),
            getMySettings().catch((err): undefined => {
              console.error(err)
              return undefined
            }),
            countMyNewToday(),
          ])
          if (cancelled) return
          const local = readLocalSettings()
          if (remote) {
            setSettings(remote)
            writeLocalSettings(remote)
          } else {
            setSettings(local)
            // No saved row yet: carry over what was chosen as a guest on this device.
            if (remote === null && !sameSettings(local, DEFAULT_SETTINGS)) saveMySettings(user.id, local).catch(err => console.error(err))
          }
          setStates(s)
          setNewToday(n)
          setPending(hasGuestProgress())
        } else {
          const g = loadGuest()
          if (cancelled) return
          setStates(guestStates())
          setSettings(readLocalSettings())
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

  const userId = user?.id ?? null
  const updateSettings = useCallback(
    (patch: { limits?: Partial<Limits>; coverOptions?: boolean }) => {
      const next: LearnSettings = {
        limits: clampLimits({ ...settings.limits, ...patch.limits }),
        coverOptions: patch.coverOptions ?? settings.coverOptions,
      }
      setSettings(next)
      writeLocalSettings(next)
      setSettingsSaveFailed(false)
      if (userId) {
        saveMySettings(userId, next).catch(err => {
          console.error(err)
          setSettingsSaveFailed(true)
        })
      }
    },
    [settings, userId],
  )

  return { ready, signedIn, states, limits: settings.limits, settings, updateSettings, settingsSaveFailed, newToday, pending, failed, record }
}

/** For tests and sign-out: forget everything held on this device. */
export function forgetDeviceProgress(): void {
  clearGuest()
}
