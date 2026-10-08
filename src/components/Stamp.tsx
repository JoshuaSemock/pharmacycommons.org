import type { HTMLAttributes } from 'react'

/**
 * A small label, such as the "Tool" / "Feature" / "Blog post" kinds in
 * What's new or a classification system badge. Flat on the paper by default
 * (.lp-label): embossing is kept for things you can click (2026-10-07).
 * `sunken` stamps it in instead, for a status mark such as "Do not use".
 * No fill, no border, no color, and the ink is plain ink. Not interactive;
 * for something clickable use Button. Tokens live in src/index.css (search
 * "Letterpress").
 */
interface StampProps extends HTMLAttributes<HTMLSpanElement> {
  sunken?: boolean
}

export default function Stamp({ sunken = false, className = '', children, ...props }: StampProps) {
  return (
    <span
      className={[
        sunken ? 'lp-sunken' : 'lp-label',
        'inline-flex items-center rounded px-1.5 py-0.5 font-sans text-[11.5px] font-medium text-ink',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
