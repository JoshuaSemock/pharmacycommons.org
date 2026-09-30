import LegalPage from './LegalPage'
import source from '../../docs/terms-of-use.md?raw'

/** Terms of Use (/terms) — renders the canonical docs/terms-of-use.md. SPDX-License-Identifier: GPL-3.0-or-later */
export default function Terms() {
  return (
    <LegalPage
      current="/terms"
      source={source}
      lede="The agreement that governs your use of Pharmacy Commons, its database, APIs and contributor accounts."
    />
  )
}
