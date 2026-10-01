import type { HTMLAttributes } from 'react'

/**
 * A small label pressed out of the paper (letterpress), such as the "Tool" /
 * "Feature" / "Blog post" kinds in What's new or the "Machine-assisted" and
 * "History" tags on drug pages. Raised by default; `sunken` stamps it in
 * instead. No fill, no border, no color: the paper and its grain run
 * through, and the ink is plain ink. Not interactive; for something clickable
 * use Button. Tokens live in src/index.css (search "Letterpress").
 */
interface StampProps extends HTMLAttributes<HTMLSpanElement> {
  sunken?: boolean
}

export default function Stamp({ sunken = false, className = '', children, ...props }: StampProps) {
  return (
    <span
      className={[
        sunken ? 'lp-sunken' : 'lp-raised',
        'inline-flex items-center rounded px-1.5 py-0.5 font-sans text-[11.5px] font-medium text-ink',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
