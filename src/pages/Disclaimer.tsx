import LegalPage from './LegalPage'
import source from '../../docs/medical-disclaimer.md?raw'

/** Medical Information Disclaimer (/disclaimer) — renders the canonical docs/medical-disclaimer.md. SPDX-License-Identifier: GPL-3.0-or-later */
export default function Disclaimer() {
  return (
    <LegalPage
      current="/disclaimer"
      source={source}
      lede="Pharmacy Commons is an educational reference, not medical advice. What that means for patients, clinicians and automated answers."
    />
  )
}
