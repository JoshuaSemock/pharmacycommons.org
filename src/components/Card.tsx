import type { HTMLAttributes } from 'react'

/**
 * A letterpress panel (plan 4.3): stamped out of the paper. It is raised by
 * default, or `sunken` (pressed in) for a well that holds nested interactive
 * content such as a group of toggle buttons. Only the micro-shadows differ
 * between the two. There is no fill, so the sheet and
 * its grain show through either way. Corners are rounded-md: stiff card stock
 * holds a tight die-cut corner.
 * Tokens live in src/index.css (search "Letterpress").
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
        'rounded-md border-0 bg-transparent',
        // Static relief: a panel never reacts to the pointer. Links inside a
        // raised panel are bold (.lp-raised a in src/index.css).
        sunken ? 'lp-sunken' : 'lp-raised',
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
