import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'

/** Catch-all route (*): a real "not found" page instead of silently showing Home. SPDX-License-Identifier: GPL-3.0-or-later */
export default function NotFound() {
  useEffect(() => {
    const prev = document.title
    document.title = 'Page not found · Pharmacy Commons'
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
    <PageShell kicker="404" title="Page not found" lede="There is nothing at this address. It may have moved, or the link may be mistyped.">
      <p className="font-sans text-[15px] text-ink">
        <Link to="/browse" className="underline decoration-foil underline-offset-2">
          Browse drugs
        </Link>{' '}
        or go back to the{' '}
        <Link to="/" className="underline decoration-foil underline-offset-2">
          home page
        </Link>
        .
      </p>
    </PageShell>
  )
}
