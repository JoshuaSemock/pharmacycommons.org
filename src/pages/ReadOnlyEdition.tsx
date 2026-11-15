import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'

/**
 * Shown at the account and editing routes (/account, /new, /review, /admin, /admin/learn,
 * /drugs/:slug/edit) while accounts are off (src/features.ts). SPDX-License-Identifier: GPL-3.0-or-later
 */
export default function ReadOnlyEdition() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Read-only edition · Pharmacy Commons'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.title = prev
      meta.remove()
    }
  }, [])

  return (
    <PageShell
      kicker="Read-only"
      title="This edition is read-only"
      lede="Accounts, editing and comments are switched off. Everything you can read is still here, with no account needed."
    >
      <p className="font-sans text-[15px] text-ink">
        <Link to="/browse" className="underline decoration-foil underline-offset-2">
          Browse drugs
        </Link>
        ,{' '}
        <Link to="/learn" className="underline decoration-foil underline-offset-2">
          study in Learn
        </Link>{' '}
        (progress stays in this browser) or open the{' '}
        <Link to="/tools" className="underline decoration-foil underline-offset-2">
          tools
        </Link>
        .
      </p>
    </PageShell>
  )
}
