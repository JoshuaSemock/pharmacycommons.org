import { Link } from 'react-router-dom'
import PageShell, { Section } from './PageShell'

/**
 * Sign in / Register — placeholder until Supabase Auth is wired up.
 *
 * Accounts exist for the Commons view: proposing changes, joining record
 * discussions, and reviewing. Reading never requires one.
 */
export default function Account() {
  return (
    <PageShell
      title="Sign in or register"
      lede="Accounts are not open yet. You don't need one to read anything on Pharmacy Commons, and you never will."
      toc={false}
    >
      <Section heading="What an account will be for">
        <p>
          Accounts are for the people who help maintain the record. Once they open, signing in will let you
          propose corrections and additions with a source, join the discussion attached to a drug record, and
          follow what happens to your contributions. Reviewers will use the same account to accept or reject
          proposed changes.
        </p>
        <p>
          Every change still goes through review before it is published, whoever submits it.
        </p>
      </Section>

      <Section heading="Until then">
        <p>
          If you spot something wrong or missing, write to{' '}
          <a href="mailto:contact@pharmacycommons.org" className="font-medium text-aqua-700 underline-offset-2 hover:underline">
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
