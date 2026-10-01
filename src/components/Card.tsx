import type { HTMLAttributes } from 'react'

/**
 * A letterpress panel (plan 4.2): stamped out of the paper. It is raised by
 * default, or `sunken` (pressed in) for a well that holds nested interactive
 * content such as a group of toggle buttons. Only the micro-shadows and the
 * text impression differ between the two; there is no fill, so the sheet and its grain show through either way.
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
        'pc-letterpress rounded-xl border-0 bg-transparent transition-shadow duration-200 motion-reduce:transition-none',
        sunken ? 'pc-letterpress-sunken shadow-deboss' : 'shadow-emboss',
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
