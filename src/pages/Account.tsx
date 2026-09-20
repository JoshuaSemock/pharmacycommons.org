import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell, { Section } from './PageShell'
import {
  authErrorMessage,
  getMyProviderVerification,
  sendPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  useSession,
  verifyNpi,
} from '../auth'
import type { ProviderVerification } from '../auth'

/**
 * Sign in / register.
 *
 * Identity plus one gate: Supabase Auth sign-up/sign-in/sign-out, password
 * reset, and NPI verification. There is still no "propose an edit" UI or
 * role picker here — those depend on schema Joshua hasn't confirmed yet
 * (user_roles, revision_history) and on the moderator queue existing first,
 * per docs/phase5-community-moderation-workflow.md's own suggested build
 * order. But per Joshua's 2026-09-19 call, contribution (not registration)
 * is gated on a verified NPI, so that check lives here, ahead of the form
 * that will eventually use it: `revisions.submit_own`'s RLS policy now
 * requires a row in `provider_verifications` with status = 'active'
 * (db/phase5_provider_verification.sql), written only by the verify-npi
 * edge function after it confirms the NPI against the CMS NPI Registry.
 */
export default function Account() {
  const { user, loading } = useSession()

  return (
    <PageShell
      title={user ? 'Your account' : 'Sign in or register'}
      lede={
        user
          ? undefined
          : "You don't need an account to read anything on Pharmacy Commons, and you never will. Sign in only if you want to propose an edit or track one you've submitted."
      }
      toc={false}
    >
      {loading ? (
        <Section heading="Loading">
          <p>Checking your session…</p>
        </Section>
      ) : user ? (
        <SignedIn email={user.email ?? '(no email on file)'} />
      ) : (
        <SignedOut />
      )}

      <Section heading="What an account is for">
        <p>
          Accounts are for the people who help maintain the record: proposing corrections and
          additions with a source, and following what happens to your submissions. Reviewers use
          the same kind of account to accept or reject proposed changes.
        </p>
        <p>
          Proposing a change requires a verified NPI — anyone can register, but only a verified
          account can submit an edit, so verify below once you've signed in. The "propose an edit"
          form itself isn't built yet; signing in and verifying gets you set up ahead of it. Every
          change, once that form exists, still goes through review before it's published, whoever
          submits it.
        </p>
      </Section>

      <Section heading="Until the review queue is live">
        <p>
          If you spot something wrong or missing, write to{' '}
          <a
            href="mailto:contact@pharmacycommons.org"
            className="font-medium text-aqua-700 underline-offset-2 hover:underline"
          >
            contact@pharmacycommons.org
          </a>{' '}
          with the drug, what should change, and your source. Corrections are described in the{' '}
          <Link to="/blog" className="font-medium text-aqua-700 underline-offset-2 hover:underline">
            build log
          </Link>{' '}
          rather than applied quietly.
        </p>
      </Section>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed in
// ─────────────────────────────────────────────────────────────────────────────

function SignedIn({ email }: { email: string }) {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Section heading="Signed in">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
        <div>
          <p className="font-sans text-[13px] text-sage-600">Signed in as</p>
          <p className="font-sans text-[15px] font-medium text-sage-900">{email}</p>
        </div>
        <button type="button" onClick={handleSignOut} disabled={signingOut} className={buttonClass}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      {error && <p className={errorClass}>{error}</p>}

      <NpiVerification />

      <p className="text-sage-600">
        There's nothing to propose yet — the contribution form is still being built. This page
        will grow a "your submissions" list once it exists.
      </p>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NPI verification — gates contribution, not registration
// ─────────────────────────────────────────────────────────────────────────────

function NpiVerification() {
  const [checking, setChecking] = useState(true)
  const [verification, setVerification] = useState<ProviderVerification | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [npi, setNpi] = useState('')
  const [lastName, setLastName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getMyProviderVerification()
      .then(v => {
        if (!cancelled) setVerification(v)
      })
      .catch(err => {
        if (!cancelled) setLoadError(authErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const cleanNpi = npi.trim()
    if (!/^\d{10}$/.test(cleanNpi)) {
      setFormError('NPI must be exactly 10 digits.')
      return
    }
    if (!lastName.trim()) {
      setFormError('Enter the last name on the NPI record.')
      return
    }

    setSubmitting(true)
    try {
      const result = await verifyNpi(cleanNpi, lastName.trim())
      if (result.verified) {
        setVerification({
          npi: cleanNpi,
          verified_name: result.name,
          enumeration_type: result.enumeration_type,
          primary_taxonomy: result.taxonomy,
          status: 'active',
          verified_at: new Date().toISOString(),
        })
      } else {
        setFormError(result.reason)
      }
    } catch (err) {
      setFormError(authErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
        <p className="font-sans text-[13px] text-sage-600">Checking NPI verification status…</p>
      </div>
    )
  }

  if (loadError) {
    return <p className={errorClass}>{loadError}</p>
  }

  if (verification && verification.status === 'active') {
    return (
      <div className="rounded-lg border border-aqua-200 bg-aqua-100/60 px-4 py-3.5">
        <p className="font-sans text-[13px] font-medium text-aqua-700">
          NPI verified — {verification.verified_name ?? verification.npi}
        </p>
        {verification.primary_taxonomy && (
          <p className="mt-0.5 font-sans text-[12px] text-aqua-700/80">{verification.primary_taxonomy}</p>
        )}
        <p className="mt-1.5 font-sans text-[12px] text-aqua-700/80">
          NPI {verification.npi} · you can submit edits once the contribution form ships.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
      <p className="mb-3 font-sans text-[13px] font-medium text-sage-900">Verify your NPI</p>
      <p className="mb-4 font-sans text-[12.5px] leading-relaxed text-sage-600">
        Required before you can submit an edit. Checked against the CMS NPI Registry — your last
        name must match the name on file for that NPI.
      </p>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
        <Field label="NPI number">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{10}"
            maxLength={10}
            placeholder="1234567890"
            value={npi}
            onChange={e => setNpi(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
          />
        </Field>
        <Field label="Last name on the NPI record">
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className={inputClass}
          />
        </Field>
        {formError && <p className={errorClass}>{formError}</p>}
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? 'Verifying…' : 'Verify NPI'}
        </button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed out — sign in / register tabs
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'signin' | 'register'

function SignedOut() {
  const [mode, setMode] = useState<Mode>('signin')

  return (
    <Section heading={mode === 'signin' ? 'Sign in' : 'Register'}>
      <div
        role="tablist"
        aria-label="Sign in or register"
        className="inline-flex rounded-lg border border-sage-200 bg-sage-100 p-0.5"
      >
        <TabButton active={mode === 'signin'} onClick={() => setMode('signin')}>
          Sign in
        </TabButton>
        <TabButton active={mode === 'register'} onClick={() => setMode('register')}>
          Register
        </TabButton>
      </div>

      <div className="max-w-sm">{mode === 'signin' ? <SignInForm /> : <RegisterForm />}</div>
    </Section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'rounded-md px-3.5 py-1.5 font-sans text-[13px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-aqua-500',
        active
          ? 'bg-white text-sage-900 shadow-[0_1px_3px_rgb(0_0_0/0.14),0_1px_1px_rgb(0_0_0/0.06)] ring-1 ring-sage-200'
          : 'text-sage-600 hover:text-sage-900',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'reset-sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    try {
      await signInWithPassword(email, password)
      // useSession's onAuthStateChange listener picks this up; no local
      // "success" state needed — the page re-renders into SignedIn.
    } catch (err) {
      setError(authErrorMessage(err))
      setStatus('idle')
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password".')
      return
    }
    setError(null)
    setStatus('loading')
    try {
      await sendPasswordReset(email.trim())
      setStatus('reset-sent')
    } catch (err) {
      setError(authErrorMessage(err))
      setStatus('idle')
    }
  }

  if (status === 'reset-sent') {
    return (
      <p className="mt-5 rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-aqua-700">
        If an account exists for {email}, a password reset link is on its way.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>

      {error && <p className={errorClass}>{error}</p>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="submit" disabled={status === 'loading'} className={primaryButtonClass}>
          {status === 'loading' ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={status === 'loading'}
          className="font-sans text-[12.5px] text-sage-600 underline-offset-2 hover:text-sage-900 hover:underline disabled:opacity-50"
        >
          Forgot password?
        </button>
      </div>
    </form>
  )
}

function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'check-email'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setStatus('loading')
    try {
      const { session } = await signUpWithPassword(email, password)
      // A session comes back immediately only if email confirmation is off
      // for this project; otherwise Supabase sends a confirmation link and
      // there's nothing signed in yet.
      setStatus(session ? 'idle' : 'check-email')
    } catch (err) {
      setError(authErrorMessage(err))
      setStatus('idle')
    }
  }

  if (status === 'check-email') {
    return (
      <p className="mt-5 rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-aqua-700">
        Check {email} for a confirmation link to finish setting up your account.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Confirm password">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className={inputClass}
        />
      </Field>

      {error && <p className={errorClass}>{error}</p>}

      <p className="font-sans text-[11.5px] leading-snug text-sage-600">
        Anything you submit for review is licensed under the project's terms, same as the rest of
        the dataset.
      </p>

      <button type="submit" disabled={status === 'loading'} className={primaryButtonClass}>
        {status === 'loading' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-sans text-[12.5px] font-medium text-sage-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-sans text-[11.5px] text-sage-600">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-sage-200 bg-white/70 px-3 py-2 font-sans text-[13.5px] text-sage-900 placeholder-sage-400 outline-none transition-all focus:border-aqua-400 focus:bg-white focus:ring-2 focus:ring-aqua-200'

const buttonClass =
  'rounded-md border border-sage-200 bg-white/60 px-2.5 py-1 font-sans text-[12px] text-sage-600 transition-colors hover:border-sage-300 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 disabled:opacity-40'

const primaryButtonClass =
  'rounded-lg border border-aqua-400 bg-aqua-400/10 px-4 py-2 font-sans text-[13px] font-medium text-aqua-700 transition-colors hover:border-aqua-500 hover:bg-aqua-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 disabled:opacity-50'

const errorClass =
  'rounded-lg border border-coral-200 bg-coral-100 px-3.5 py-2.5 font-sans text-[12.5px] text-coral-600'
