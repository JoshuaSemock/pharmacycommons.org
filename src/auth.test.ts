import { describe, expect, it, vi } from 'vitest'

// auth.ts imports the Supabase client; keep this test offline.
vi.mock('./supabaseClient', () => ({ supabase: {} }))

describe('authRedirectError', () => {
  it('explains a used or expired link (the Supabase otp_expired redirect)', async () => {
    const { authRedirectError } = await import('./auth')
    const hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='
    expect(authRedirectError(hash)).toMatch(/already been used or has expired/)
  })

  it('falls back to Supabase’s description for other errors, from hash or query', async () => {
    const { authRedirectError } = await import('./auth')
    expect(authRedirectError('', '?error=server_error&error_description=Database+error')).toBe(
      'Database error',
    )
  })

  it('ignores normal hashes such as section anchors and session tokens', async () => {
    const { authRedirectError } = await import('./auth')
    expect(authRedirectError('')).toBeNull()
    expect(authRedirectError('#saved')).toBeNull()
    expect(authRedirectError('#access_token=abc&type=signup')).toBeNull()
  })
})
