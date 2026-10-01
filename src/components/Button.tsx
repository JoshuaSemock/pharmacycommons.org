import type { ButtonHTMLAttributes } from 'react'

/**
 * A paper-relief button: embossed (raised out of the sheet) at rest, debossed
 * (stamped in, a step darker) when selected. Tokens and the grain overlay live
 * in src/index.css (search "Paper relief").
 *
 * `selected` makes it a toggle button. Leave it undefined for an ordinary
 * action button, so screen readers don't announce "toggle button, not
 * pressed" on a button that can't be pressed. When it is set, aria-pressed
 * carries the state and drives the debossed styling (Tailwind's `aria-pressed:`
 * variant), so the look can't drift from what assistive tech hears.
 *
 * Layout classes passed in `className` are appended. Don't pass classes that
 * fight the built-in ones (padding, radius, background, shadow); use `size`
 * and `variant` instead, because Tailwind resolves those conflicts by
 * stylesheet order, not by class order.
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'mint' | 'hepatica'
  size?: 'sm' | 'md'
  selected?: boolean
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  mint: 'bg-mint-emboss aria-pressed:bg-mint-deboss',
  hepatica: 'bg-hepatica-emboss aria-pressed:bg-hepatica-deboss',
}

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'rounded-md px-2.5 py-1 text-[12.5px] font-medium',
  md: 'rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide',
}

export default function Button({
  variant = 'mint',
  size = 'md',
  selected,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[
        'pc-relief inline-flex items-center justify-center gap-1.5 font-sans text-ink',
        'border border-transparent aria-pressed:border-black/5',
        'shadow-emboss aria-pressed:shadow-deboss',
        'transition-[box-shadow,background-color,translate] duration-150 motion-reduce:transition-none',
        'not-aria-pressed:enabled:hover:shadow-emboss-hover not-aria-pressed:enabled:hover:-translate-y-px',
        'aria-pressed:translate-y-px motion-reduce:translate-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-700',
        'disabled:cursor-default disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
