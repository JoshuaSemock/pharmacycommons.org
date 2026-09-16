import { Link } from 'react-router-dom'
import PageShell, { Section } from './PageShell'

const linkClass =
  'text-aqua-700 underline decoration-aqua-300 underline-offset-2 hover:decoration-aqua-600'

export default function About() {
  return (
    <PageShell
      kicker="About"
      title="About Pharmacy Commons"
      lede="A shared drug reference built from public sources such as the FDA, WHO, and NIH. The project is in early development."
    >
      <Section heading="Our Mission">
        <p>
          Pharmacy Commons organizes publicly available drug information into
          consistent, searchable pages for the human eye, and for machines like Ai.
          Each entry is meant to link back to the source it came from, making
          citations instant, and so readers can factcheck it for themselves.
          </p>
        </Section>

        <Section heading="Our Vision Statment">
          <p>
          Knowledge of pharmacy and medicines, shared by the people, with machines and the planet in mind.
        </p>
      </Section>

      <Section heading="Our Values">
          <p>
          We value our community and their trustworthiness, meaning we
          think drug information should be legible and understandable 
          for all levels of medical literacy. That's why we're making drug
          information that is easy to find, check, and cite: each medicine 
          has a stable identity based on colloquial
          names, each fact can be traced to its source, and disagreements
          between sources are shown rather than sides being chosen.
         </p>
        <p>
          We value learning and diligence, meaning everyone can be up to date
          with the cutting edge of health science, no matter where your starting
          place is. It is well known that insight into ones own health results in
          better outcomes, a barrier to this is not having the information and
          knowledge out there for all to see.
        </p>
      </Section>

      <Section heading="Our Status">
        <p>
          Search and browsing currently run on a fixed list of drug identifiers.
          Detailed drug content is being added gradually, so many pages are incomplete
          and features may change when the Postgres SQL goes live. One shippable feature is
          the creatinine clearance calculator under the Tools tab.
        </p>
      </Section>

      <Section heading="Our Land, Knowledge, and Environment Acknowledgment">
        <p>

        Pharmacy Commons is a website, but it depends on physical things: servers, cables, 
        power grids, and the water that cools data centers. All of it sits on the ancestral 
        lands of Indigenous nations who still hold them as sacred. Most of these lands were 
        never ceded. Others were taken by force or through treaties signed under pressure. 
        Pharmacy Commons is maintained on the lands of the nations through it's physical data.
       </p>
      <p>
        Our domain name is registered through Porkbun, based in the Portland, Oregon area. This
        is the homeland of the Atfalati (Tualatin Kalapuya) and of Chinookan peoples, including 
        the Multnomah and Clackamas. The Cowlitz, Molalla, Wasco, and other peoples also have ties
        to this land. These communities continue today, including through the Confederated Tribes 
        of Grand Ronde, the Confederated Tribes of Siletz Indians, the Cowlitz Indian Tribe, the 
        Confederated Tribes of Warm Springs, and the Chinook Indian Nation.
       </p>
      <p>
        Our database runs through Supabase on Amazon Web Services in Northern Virginia. This is the
        homeland of the Doeg (Tauxenent), the Manahoac, and the Patawomeck. We recognize the tribal
        nations of Virginia today, including the Chickahominy, Eastern Chickahominy, Mattaponi, Monacan,
        Nansemond, Pamunkey, Patawomeck, Rappahannock, and Upper Mattaponi. Additionally, our code and
        website are hosted through GitHub, whose network crosses the homelands of many nations.
        </p>
      <p>
        Many medicines in this reference trace back to plants, fungi, and practices that Indigenous peoples
        discovered and protected long before those medicines entered a pharmacopeia. That knowledge has
        often been taken, patented, and sold without consent, credit, or a fair share of the benefit. The
        resulting medicines are not always affordable to the communities they originated from. We seek to 
        not treat Indigenous knowledge as a commodity. We aim to document where medicine's origins are,
        we will credit them and not publish traditional knowledge that is not already public. These are recognized
        under the CARE Principles for Indigenous Data Governance.
       </p>
      <p>
        Drug's effects also continue after it is taken. Drugs and their byproducts reach rivers, lakes, and 
        groundwater through metabolism, through disposal, and through manufacturing. Where reliable data exist, we
        show estimated environmental risk alongside clinical information and place comparable medicines side by side.
        The aim is to let pharmacists and prescribers weigh environmental impact, alongside a multitude of other 
        considerations like cost and accessibility, when choosing among options that are clinically appropriate.
        Colonialism is not only in the past. It still shapes who has access to land, resources, medicines, and technology
        today. This acknowledgment is a starting point. We welcome correction and guidance from Indigenous communities,
        and interested parties. We encourage users to learn whose lands they live on and rely on, starting with Native
        Land Digital, and learn how they can live more responsibly in regard to how we treat the environment.
        </p>
      </Section>

      <Section heading="Our Licensing and Intentions">
        <p>
          Source code is licensed under GPL-3.0. Compiled
          datasets are released under Creative Commons terms, subject to the licenses
          of their original sources. This site is for educational and informational 
          purposes only. It is not medical advice and does not replace the judgment of your medical team. Pharmacists,
          prescribers, and many other health care professionals are licenced for a reason.
          Confirming information against current product labeling and primary sources is highly
          recommended.
        </p>
      </Section>

      <Section heading="Our Founder">
        <p>
          Pharmacy Commons is founded and maintained by Dr. Joshua Semock, PharmD, who
          operates as a single-member for now. His almamatter is the University of Colorado
          at the Anschutz Medical campus, Skaggs School of Pharmacy and Pharmaceutical
          Sciences. He attended a post-graduate year one (PGY1) residency program at
          Buffalo Psychiatric Center with the New York State Office of Mental Health and
          University at Buffalo. He was raised in Chicagoland, but now calls Atlanta home.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Corrections and questions:{' '}
          <a href="mailto:contact@pharmacycommons.org" className={linkClass}>
            contact@pharmacycommons.org
          </a>
        </p>
      </Section>
    </PageShell>
  )
}
