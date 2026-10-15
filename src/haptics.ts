/**
 * A light tick on touch taps of buttons, links and form controls (2026-10-13).
 *
 * Uses the Vibration API, which Chrome and Firefox on Android support. iOS
 * Safari has no vibration API; see makeSwitchTick for what is done there. Skipped when the
 * reader prefers reduced motion, for disabled controls, and for mouse or pen
 * input. Nothing is stored. Call `installHaptics()` once at startup.
 */

const TAPPABLE = 'a[href], button, summary, label, select, [role="button"], [role="tab"], [role="option"], [role="menuitem"], input:not([type="text"]):not([type="search"]):not([type="number"]):not([type="email"]):not([type="password"])'
const TICK_MS = 8

function isTappable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest(TAPPABLE)
  if (!el) return false
  if (el.matches(':disabled, [aria-disabled="true"]')) return false
  return true
}

/**
 * iOS Safari (17.4+) has no Vibration API, but toggling a native switch
 * (<input type="checkbox" switch>) makes it play its own tick. A hidden switch
 * is toggled through its label from a real tap. This is a side effect, not a
 * documented feature, so it may stop working in a future iOS; if it does the
 * taps are simply silent.
 */
function makeSwitchTick(): () => void {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.id = 'pc-haptic-switch'
  input.tabIndex = -1
  input.setAttribute('aria-hidden', 'true')
  const label = document.createElement('label')
  label.htmlFor = input.id
  label.setAttribute('aria-hidden', 'true')
  const hide = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
  input.style.cssText = hide
  label.style.cssText = hide
  document.body.append(input, label)
  return () => label.click()
}

export function installHaptics(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  if (typeof navigator.vibrate === 'function') {
    window.addEventListener(
      'pointerup',
      e => {
        if (e.pointerType !== 'touch' || calm?.matches) return
        if (isTappable(e.target)) navigator.vibrate(TICK_MS)
      },
      { passive: true },
    )
    return
  }

  // No Vibration API (iOS Safari): only on touch screens.
  if (!window.matchMedia?.('(pointer: coarse)').matches) return
  let tick: (() => void) | null = null
  window.addEventListener(
    'click',
    e => {
      if (!e.isTrusted || calm?.matches || !isTappable(e.target)) return
      if (e.target instanceof Element && e.target.closest('#pc-haptic-switch, label[for="pc-haptic-switch"]')) return
      tick ??= makeSwitchTick()
      tick()
    },
    { passive: true },
  )
}
