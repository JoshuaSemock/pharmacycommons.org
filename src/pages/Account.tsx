import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageShell, { Section } from './PageShell'
import {
  authErrorMessage,
  getMyProviderVerification,
  getSavedEntities,
  sendPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  unsaveEntity,
  updateEmail,
  updatePassword,
  useSession,
  verifyNpi,
} from '../auth'
import type { ProviderVerification, SavedEntity } from '../auth'

/**
 * Sign in / register / account dashboard.
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
 *
 * Signed-in users get a small dashboard (Overview / Saved pages / Settings)
 * rather than a single scrolling column — added 2026-09-20 alongside the
 * saved_entities table (db/phase5_saved_entities.sql) and the bookmark
 * button on DrugDetail.tsx.
 */
export default function Account() {
  const { user, loading } = useSession()

  return (
    <PageShell
      title={user ? 'Your account' : 'Sign in or register'}
      lede={
        user
          ? undefined
          : "You don't need an account to read anything on Pharmacy Commons, and you never will. Sign in only if you want to save pages, or to propose an edit and track one you've submitted."
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

      {!user && !loading && (
        <>
          <Section heading="What an account is for">
            <p>
              An account lets you save drug pages for quick return, and — once verified — propose
              corrections and additions with a source, and follow what happens to your
              submissions. Reviewers use the same kind of account to accept or reject proposed
              changes.
            </p>
            <p>
              Proposing a change requires a verified NPI — anyone can register, but only a
              verified account can submit an edit, so verify once you've signed in. The "propose
              an edit" form itself isn't built yet; signing in and verifying gets you set up ahead
              of it. Every change, once that form exists, still goes through review before it's
              published, whoever submits it.
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
              with the drug, what should change, and your source. Corrections are described in
              the{' '}
              <Link to="/blog" className="font-medium text-aqua-700 underline-offset-2 hover:underline">
                build log
              </Link>{' '}
              rather than applied quietly.
            </p>
          </Section>
        </>
      )}
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed in — dashboard with Overview / Saved pages / Settings
// ─────────────────────────────────────────────────────────────────────────────

type DashboardTab = 'overview' | 'saved' | 'settings'

const DASHBOARD_TABS: { key: DashboardTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'saved', label: 'Saved pages' },
  { key: 'settings', label: 'Settings' },
]

function SignedIn({ email }: { email: string }) {
  const [tab, setTab] = useState<DashboardTab>('overview')

  // Saved-page count is fetched once here (not per-tab) so the Overview
  // summary and the tab label can both show it without duplicating the call.
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [savedCountError, setSavedCountError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSavedEntities()
      .then(rows => {
        if (!cancelled) setSavedCount(rows.length)
      })
      .catch(() => {
        if (!cancelled) setSavedCountError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Section heading="Signed in">
      <div
        role="tablist"
        aria-label="Account sections"
        className="inline-flex flex-wrap rounded-lg border border-sage-200 bg-sage-100 p-0.5"
      >
        {DASHBOARD_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              'rounded-md px-3.5 py-1.5 font-sans text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-aqua-500',
              tab === t.key
                ? 'bg-white text-sage-900 shadow-[0_1px_3px_rgb(0_0_0/0.14),0_1px_1px_rgb(0_0_0/0.06)] ring-1 ring-sage-200'
                : 'text-sage-600 hover:text-sage-900',
            ].join(' ')}
          >
            {t.label}
            {t.key === 'saved' && savedCount !== null && savedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-sage-200 px-1.5 py-0.5 font-mono text-xs text-sage-700">
                {savedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <OverviewPanel email={email} savedCount={savedCount} savedCountError={savedCountError} />
        )}
        {tab === 'saved' && <SavedPanel onCountChange={setSavedCount} />}
        {tab === 'settings' && <SettingsPanel email={email} />}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewPanel({
  email,
  savedCount,
  savedCountError,
}: {
  email: string
  savedCount: number | null
  savedCountError: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
        <p className="font-sans text-sm text-sage-600">Signed in as</p>
        <p className="font-sans text-md font-medium text-sage-900">{email}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Saved pages"
          value={savedCountError ? '—' : (savedCount ?? '…')}
          hint={savedCountError ? 'Failed to load' : 'Drug pages you’ve bookmarked'}
        />
        <NpiStatCard />
      </div>

      <NpiVerification />

      <p className="text-sage-600">
        There's nothing to propose yet — the contribution form is still being built. This page
        will grow a "your submissions" list once it exists.
      </p>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
      <p className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold text-sage-900">{value}</p>
      <p className="mt-0.5 font-sans text-2xs text-sage-600">{hint}</p>
    </div>
  )
}

/** Small status echo of NpiVerification's own state, for the overview grid. */
function NpiStatCard() {
  const [verification, setVerification] = useState<ProviderVerification | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    getMyProviderVerification()
      .then(v => {
        if (!cancelled) setVerification(v)
      })
      .catch(() => {
        // Falls through to "not verified" — the full NpiVerification panel
        // below shows the real error if there is one.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const verified = verification?.status === 'active'

  return (
    <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
      <p className="font-sans text-xs uppercase tracking-[0.08em] text-sage-600">
        Contribution status
      </p>
      <p
        className={`mt-0.5 font-sans text-md font-semibold ${
          checking ? 'text-sage-400' : verified ? 'text-aqua-700' : 'text-sage-700'
        }`}
      >
        {checking ? 'Checking…' : verified ? 'NPI verified' : 'Not verified'}
      </p>
      <p className="mt-0.5 font-sans text-2xs text-sage-600">
        {verified ? verification?.verified_name : 'Verify below to unlock edits'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved pages
// ─────────────────────────────────────────────────────────────────────────────

function SavedPanel({ onCountChange }: { onCountChange: (count: number) => void }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SavedEntity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSavedEntities()
      .then(data => {
        if (cancelled) return
        setRows(data)
        onCountChange(data.length)
      })
      .catch(err => {
        if (!cancelled) setError(authErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRemove(pcidCode: string) {
    setRemoving(pcidCode)
    try {
      await unsaveEntity(pcidCode)
      setRows(prev => {
        const next = prev.filter(r => r.pcid_code !== pcidCode)
        onCountChange(next.length)
        return next
      })
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setRemoving(null)
    }
  }

  if (loading) {
    return <p className="font-sans text-sm text-sage-600">Loading saved pages…</p>
  }

  if (error) {
    return <p className={errorClass}>{error}</p>
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sage-300 bg-white/50 px-4 py-6 text-center">
        <p className="font-sans text-sm text-sage-600">
          Nothing saved yet. Look for the <span className="font-medium text-sage-800">Save</span>{' '}
          button on any drug page to bookmark it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div
          key={row.pcid_code}
          className="flex items-center justify-between gap-3 rounded-lg border border-sage-200 bg-white/70 px-4 py-3"
        >
          <div className="min-w-0">
            <Link
              to={`/drugs/${row.slug}`}
              className="block truncate font-sans text-md font-medium text-sage-900 hover:text-aqua-700 hover:underline"
            >
              {row.name}
            </Link>
            <p className="mt-0.5 font-mono text-2xs text-sage-500">
              {row.pcid_code}
              {row.entity_type && <span className="ml-2 font-sans text-sage-400">· {row.entity_type}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRemove(row.pcid_code)}
            disabled={removing === row.pcid_code}
            className={buttonClass}
          >
            {removing === row.pcid_code ? 'Removing…' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPanel({ email }: { email: string }) {
  return (
    <div className="max-w-sm space-y-8">
      <ChangeEmailForm currentEmail={email} />
      <ChangePasswordForm />
      <SignOutRow />
    </div>
  )
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const clean = newEmail.trim()
    if (!clean || clean === currentEmail) {
      setError('Enter a different email address.')
      return
    }

    setStatus('loading')
    try {
      await updateEmail(clean)
      setStatus('sent')
    } catch (err) {
      setError(authErrorMessage(err))
      setStatus('idle')
    }
  }

  return (
    <div>
      <h3 className="mb-1 font-sans text-sm font-semibold text-sage-900">Change email</h3>
      <p className="mb-3 font-sans text-sm leading-relaxed text-sage-600">
        Currently <span className="font-medium text-sage-800">{currentEmail}</span>. Changing it
        sends a confirmation link to the new address before it takes effect.
      </p>
      {status === 'sent' ? (
        <p className="rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-sm leading-relaxed text-aqua-700">
          Check {newEmail.trim()} for a confirmation link to finish the change.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="New email">
            <input
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <p className={errorClass}>{error}</p>}
          <button type="submit" disabled={status === 'loading'} className={primaryButtonClass}>
            {status === 'loading' ? 'Sending…' : 'Update email'}
          </button>
        </form>
      )}
    </div>
  )
}

function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
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
      await updatePassword(password)
      setPassword('')
      setConfirm('')
      setStatus('done')
    } catch (err) {
      setError(authErrorMessage(err))
      setStatus('idle')
    }
  }

  return (
    <div>
      <h3 className="mb-1 font-sans text-sm font-semibold text-sage-900">Change password</h3>
      <p className="mb-3 font-sans text-sm leading-relaxed text-sage-600">
        Takes effect immediately — you'll stay signed in on this device.
      </p>
      {status === 'done' ? (
        <p className="rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-sm text-aqua-700">
          Password updated.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="New password" hint="At least 8 characters">
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
          <Field label="Confirm new password">
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
          <button type="submit" disabled={status === 'loading'} className={primaryButtonClass}>
            {status === 'loading' ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  )
}

function SignOutRow() {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setError(null)
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      setError(authErrorMessage(err))
      setSigningOut(false)
    }
  }

  return (
    <div className="border-t border-sage-200 pt-5">
      <h3 className="mb-1 font-sans text-sm font-semibold text-sage-900">Sign out</h3>
      <p className="mb-3 font-sans text-sm text-sage-600">Ends your session on this device.</p>
      {error && <p className={`mb-2 ${errorClass}`}>{error}</p>}
      <button type="button" onClick={handleSignOut} disabled={signingOut} className={buttonClass}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
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
        <p className="font-sans text-sm text-sage-600">Checking NPI verification status…</p>
      </div>
    )
  }

  if (loadError) {
    return <p className={errorClass}>{loadError}</p>
  }

  if (verification && verification.status === 'active') {
    return (
      <div className="rounded-lg border border-aqua-200 bg-aqua-100/60 px-4 py-3.5">
        <p className="font-sans text-sm font-medium text-aqua-700">
          NPI verified — {verification.verified_name ?? verification.npi}
        </p>
        {verification.primary_taxonomy && (
          <p className="mt-0.5 font-sans text-sm text-aqua-700/80">{verification.primary_taxonomy}</p>
        )}
        <p className="mt-1.5 font-sans text-sm text-aqua-700/80">
          NPI {verification.npi} · you can submit edits once the contribution form ships.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-sage-200 bg-white/70 px-4 py-3.5">
      <p className="mb-3 font-sans text-sm font-medium text-sage-900">Verify your NPI</p>
      <p className="mb-4 font-sans text-sm leading-relaxed text-sage-600">
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
        'rounded-md px-3.5 py-1.5 font-sans text-sm font-medium transition-colors',
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
      <p className="mt-5 rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-md leading-relaxed text-aqua-700">
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
          className="font-sans text-sm text-sage-600 underline-offset-2 hover:text-sage-900 hover:underline disabled:opacity-50"
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
      <p className="mt-5 rounded-lg border border-aqua-200 bg-aqua-100/60 px-3.5 py-3 font-sans text-md leading-relaxed text-aqua-700">
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

      <p className="font-sans text-2xs leading-snug text-sage-600">
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
      <span className="mb-1.5 block font-sans text-sm font-medium text-sage-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-sans text-2xs text-sage-600">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-sage-200 bg-white/70 px-3 py-2 font-sans text-md text-sage-900 placeholder-sage-400 outline-none transition-all focus:border-aqua-400 focus:bg-white focus:ring-2 focus:ring-aqua-200'

const buttonClass =
  'rounded-md border border-sage-200 bg-white/60 px-2.5 py-1 font-sans text-sm text-sage-600 transition-colors hover:border-sage-300 hover:text-sage-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 disabled:opacity-40'

const primaryButtonClass =
  'rounded-lg border border-aqua-400 bg-aqua-400/10 px-4 py-2 font-sans text-sm font-medium text-aqua-700 transition-colors hover:border-aqua-500 hover:bg-aqua-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-500 disabled:opacity-50'

const errorClass =
  'rounded-lg border border-coral-200 bg-coral-100 px-3.5 py-2.5 font-sans text-sm text-coral-600'
