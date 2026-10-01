import type { HTMLAttributes } from 'react'

/**
 * A small label stamped into the paper (plan 4.3), such as the "Tool" /
 * "Feature" / "Blog post" kinds in What's new. It is debossed like a blind
 * stamp: no fill, no border, and the paper and its grain run through the
 * floor. The ink sits in the hollow with a 1px impression. Not interactive;
 * for something clickable use Button. Tokens live in src/index.css (search
 * "Letterpress").
 */
export default function Stamp({ className = '', children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={[
        'pc-letterpress pc-letterpress-sunken inline-flex items-center rounded border-0 bg-transparent px-1.5 py-0.5',
        'font-sans text-[11.5px] font-medium text-ink shadow-deboss',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
