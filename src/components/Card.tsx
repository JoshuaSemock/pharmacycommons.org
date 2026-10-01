import type { HTMLAttributes } from 'react'

/**
 * A paper-relief panel: embossed out of the sheet by default, or `sunken`
 * (debossed, a step darker, more grain) for a well that holds nested
 * interactive content such as a grid of toggle buttons. Tokens and the grain
 * overlay live in src/index.css (search "Paper relief").
 *
 * `padded={false}` drops the default p-6 so a caller can set its own padding
 * without fighting it (Tailwind resolves conflicting utilities by stylesheet
 * order, not class order).
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  sunken?: boolean
  padded?: boolean
}

export default function Card({
  sunken = false,
  padded = true,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'pc-relief rounded-xl border transition-shadow duration-200 motion-reduce:transition-none',
        sunken ? 'pc-relief-sunken border-neutral-300 bg-neutral-100 shadow-deboss' : 'border-neutral-200 bg-paper shadow-emboss',
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
