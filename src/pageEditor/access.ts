import { useState } from 'react'
import { useSession } from '../auth'
import { useContributorStatus } from '../contribute'
import type { ContributorStatus } from '../contribute'

/** Who's reading, and whether they can edit. `refresh` re-reads it (after choosing a handle). */
export function useEditAccess(): { status: ContributorStatus; refresh: () => void } {
  const { user, loading } = useSession()
  const [tick, setTick] = useState(0)
  const status = useContributorStatus(user ? `${user.id}:${tick}` : null, loading)
  return { status, refresh: () => setTick(t => t + 1) }
}

export function publishedNotice(status: 'live' | 'pending' | 'unchanged'): string {
  if (status === 'pending') return 'Sent for review. Your edit will appear once a reviewer accepts it.'
  if (status === 'unchanged') return 'Nothing changed, so nothing was published.'
  return 'Published. Your change is live and will be checked by a reviewer.'
}
