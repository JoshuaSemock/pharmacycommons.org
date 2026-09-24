import { Link } from 'react-router-dom'

/**
 * Site-wide footer: disclaimer, US crisis lines, links, licensing.
 * Rendered once in App.tsx below every route.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const REPO_URL = 'https://github.com/JoshuaSemock/pharmacycommons.org'
const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'
const YEAR = new Date().getFullYear()

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/resources', label: 'Sources' },
  { to: '/citations', label: 'Cite' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-sage-200 bg-white/40">
      <div className="mx-auto max-w-page space-y-4 px-4 py-8 font-sans text-[13px] leading-relaxed sm:px-6">
        <p className="text-sage-700">
          For education only, not medical advice. Ask your pharmacist or prescriber before changing
          any medication.
        </p>

        <ul aria-label="Crisis lines (US)" className="flex flex-wrap gap-x-6 gap-y-1 text-sage-900">
          <li>
            Emergency: <a href="tel:911" className={strongLink}>911</a>
          </li>
          <li>
            Suicide &amp; Crisis Lifeline: call or text{' '}
            <a href="tel:988" className={strongLink}>988</a>
          </li>
          <li>
            Poison Help:{' '}
            <a href="tel:18002221222" className={strongLink}>1-800-222-1222</a>
          </li>
        </ul>

        <div className="flex flex-col gap-3 border-t border-sage-200 pt-4 text-[12px] text-sage-600 sm:flex-row sm:items-baseline sm:justify-between">
          <p>
            © {YEAR} Pharmacy Commons · Code{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className={link}>
              GPL-3.0
            </a>{' '}
            · Original data{' '}
            <a href={CC0_URL} target="_blank" rel="noreferrer" className={link}>
              CC0 1.0
            </a>
            ; third-party data keeps its source license
          </p>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {LINKS.map(l => (
                <li key={l.to}>
                  <Link to={l.to} className={link}>{l.label}</Link>
                </li>
              ))}
              <li>
                <a href="mailto:contact@pharmacycommons.org" className={link}>Contact</a>
              </li>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className={link}>GitHub</a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500'

const link = `whitespace-nowrap text-sage-700 underline decoration-sage-300 underline-offset-2 transition-colors hover:text-sage-900 hover:decoration-aqua-600 ${focus}`

const strongLink = `whitespace-nowrap font-medium text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600 ${focus}`
