import type { HTMLAttributes } from 'react'

/**
 * A paper-relief panel (plan 4.1): raised out of the sheet by default, or
 * `sunken` (stamped in) for a well that holds nested interactive content such
 * as a group of toggle buttons. Only the shadow differs between the two; the
 * fill is the paper color either way. Tokens live in src/index.css (search
 * "Paper relief").
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
        'rounded-xl bg-paper transition-shadow duration-200 motion-reduce:transition-none',
        sunken ? 'shadow-deboss' : 'shadow-emboss',
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
