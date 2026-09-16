/**
 * Types for the globals the vanilla CrCl widget attaches to `window`.
 * The .js files themselves are not type-checked (no allowJs); this only
 * describes the surface the React page touches.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export {}

declare global {
  interface Window {
    CrClCalculator?: {
      /** Renders into `root`. Idempotent: a second call on the same element is a no-op. */
      init(root: HTMLElement): void
      /** Initializes every [data-crcl-calculator] element on the page. */
      boot(): void
    }
    CrClCore?: Record<string, unknown>
    CRCL_MEDICATIONS?: unknown[]
  }
}
