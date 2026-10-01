import type { ButtonHTMLAttributes } from 'react'

/**
 * A letterpress button (plan 4.3): stamped out of the paper itself. It has
 * no fill of its own (bg-transparent, so the sheet and its grain show
 * through) and no border, and it is raised at rest and
 * pressed in when selected. Only the 1-2px micro-shadows and the ink's 1px
 * text impression change between the two states. Tokens live in
 * src/index.css (search "Letterpress").
 *
 * `selected` makes it a toggle button. Leave it undefined for an ordinary
 * action button, so screen readers don't announce "toggle button, not
 * pressed" on a button that can't be pressed. When it is set, aria-pressed
 * carries the state and drives the stamped-in styling (Tailwind's
 * `aria-pressed:` variant), so the look can't drift from what assistive tech
 * hears.
 *
 * Text is ink (the site rule) at full strength in both states: a stamp moves
 * the paper, not the pigment. `variant` now only
 * picks the focus-ring accent, since the fill is the paper in every variant. Layout classes
 * passed in `className` are appended; don't pass ones that fight the built-in
 * padding, radius, background or shadow (Tailwind resolves conflicts by
 * stylesheet order, not class order). Use `size` and `variant` instead.
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'hepatica' | 'mint'
  size?: 'sm' | 'md'
  selected?: boolean
}

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  hepatica: 'focus-visible:outline-hepatica-700',
  mint: 'focus-visible:outline-mint-700',
}

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1 text-[12.5px]',
  md: 'px-4 py-2 text-sm',
}

export default function Button({
  variant = 'hepatica',
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
        'pc-letterpress inline-flex items-center justify-center gap-1.5 rounded-md border-0 bg-transparent font-sans font-medium text-ink',
        'shadow-emboss transition-all duration-150 motion-reduce:transition-none',
        'aria-pressed:shadow-deboss aria-pressed:translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-4',
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
