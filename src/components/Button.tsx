import type { ButtonHTMLAttributes } from 'react'

/**
 * A paper-relief button (plan 4.1): raised out of the sheet at rest, stamped
 * in when selected. Only the shadow changes between the two states. The fill
 * stays the same color and there is no texture layer on top. Tokens live in
 * src/index.css (search "Paper relief").
 *
 * `selected` makes it a toggle button. Leave it undefined for an ordinary
 * action button, so screen readers don't announce "toggle button, not
 * pressed" on a button that can't be pressed. When it is set, aria-pressed
 * carries the state and drives the stamped-in styling (Tailwind's
 * `aria-pressed:` variant), so the look can't drift from what assistive tech
 * hears.
 *
 * Text is ink (the site rule), dimmed to 80% when pressed. Layout classes
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
  hepatica: 'bg-hepatica-base focus-visible:outline-hepatica-700',
  mint: 'bg-mint-base focus-visible:outline-mint-700',
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
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-sans font-medium text-ink',
        'shadow-emboss transition-all duration-150 motion-reduce:transition-none',
        'aria-pressed:shadow-deboss aria-pressed:translate-y-px aria-pressed:text-ink/80',
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
