import LegalPage from './LegalPage'
import source from '../../docs/data-provenance-and-licensing.md?raw'

/** Data Provenance and Licensing Policy (/licensing) — renders the canonical docs/data-provenance-and-licensing.md. SPDX-License-Identifier: GPL-3.0-or-later */
export default function Licensing() {
  return (
    <LegalPage
      current="/licensing"
      source={source}
      lede="How the code and data are licensed, which upstream sources keep their own terms, and how to request removal of content."
    />
  )
}
