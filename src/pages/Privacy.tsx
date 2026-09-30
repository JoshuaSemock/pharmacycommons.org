import LegalPage from './LegalPage'
import source from '../../docs/privacy-policy.md?raw'

/** Privacy Policy (/privacy) — renders the canonical docs/privacy-policy.md. SPDX-License-Identifier: GPL-3.0-or-later */
export default function Privacy() {
  return (
    <LegalPage
      current="/privacy"
      source={source}
      lede="What we collect, why, who processes it, and how to delete your account. Never submit patient information."
    />
  )
}
