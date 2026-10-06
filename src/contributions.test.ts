import { describe, expect, it } from 'vitest'
import { ContributeError } from './contribute'
import { adminErrorMessage, contributionStatus, countContributions } from './contributions'
import type { Contribution } from './contributions'

const row = (over: Partial<Contribution>): Contribution => ({
  kind: 'page',
  item_id: 1,
  pcid: 1001900,
  slug: 'metformin',
  name: 'Metformin',
  entity_type: 'moiety',
  property_key: null,
  summary: 's',
  created_at: '2026-10-05T12:00:00Z',
  patrol_status: 'unpatrolled',
  review_note: null,
  is_live: true,
  ...over,
})

describe('contributionStatus', () => {
  it('describes live, replaced, held and refused changes', () => {
    expect(contributionStatus(row({}))).toBe('Live · not yet reviewed')
    expect(contributionStatus(row({ is_live: false }))).toBe('Since replaced')
    expect(contributionStatus(row({ patrol_status: 'patrolled' }))).toBe('Live · reviewed')
    expect(contributionStatus(row({ patrol_status: 'pending', is_live: false }))).toBe('Waiting for review')
    expect(contributionStatus(row({ patrol_status: 'rejected', is_live: false }))).toBe('Not accepted')
    expect(contributionStatus(row({ kind: 'new_page' }))).toBe('Page live · not yet reviewed')
    expect(contributionStatus(row({ kind: 'new_page', patrol_status: 'patrolled' }))).toBe('Page reviewed')
  })
})

describe('countContributions', () => {
  it('counts live, waiting, refused and created pages', () => {
    const c = countContributions([
      row({}),
      row({ is_live: false }),
      row({ kind: 'fact', patrol_status: 'pending', is_live: false }),
      row({ kind: 'fact', patrol_status: 'rejected', is_live: false }),
      row({ kind: 'new_page' }),
    ])
    expect(c).toEqual({ total: 5, live: 2, pending: 1, rejected: 1, pages: 1 })
  })
})

describe('adminErrorMessage', () => {
  it('explains refusals from the admin RPCs', () => {
    expect(adminErrorMessage(new ContributeError('cannot_revoke_own_admin'))).toMatch(/your own admin/)
    expect(adminErrorMessage(new ContributeError('not_verified'))).toMatch(/verified NPI/)
    expect(adminErrorMessage(new Error('boom'))).toMatch(/didn’t work/)
  })
})
