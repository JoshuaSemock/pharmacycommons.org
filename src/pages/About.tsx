import PageShell, { Section } from './PageShell'

const linkClass =
  'text-hepatica-700 underline decoration-hepatica-500 underline-offset-2 hover:decoration-hepatica-600'

export default function About() {
  return (
    <PageShell
      kicker="About"
      title="About Pharmacy Commons"
      lede={
        'This platform provides an open interface to structured pharmaceutical records, enabling users to query by active ingredients, preparations, pharmacologic classes, and compendium lists. ' +
        'The information is sourced from public and federal repositories, the data is then modeled in relational PostgreSQL so both human researchers and AI language models can retrieve evidence-bearing answers with clear citations. ' +
        'However, this is currently provided as an educational resource for clinical and public inquiry, thus, it is not intended as a substitute for direct medical evaluation or the clinical judgment of a licensed practitioner.'
      }
    >
      <Section heading="Our Mission">
        <p>
          Our mission is to unenclose pharmaceutical knowledge as a durable public trust. 
          Since the public finances the discovery and validation of medical science, we believe authoritative clinical evidence and drug facts must remain permanently transparent and portable for all.
          </p>
        </Section>

        <Section heading="Our Vision Statement">
          <p>
          Building a world where essential medical evidence is managed as a self-sustaining clinical commons, making information freely accessible, traceable to its source, and perpetually protected from commercial enclosure.
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
          and features may change as the Postgres SQL updates go live. Our first shippable feature was
          the creatinine clearance calculator under the Tools tab. Our second feature is a Browse and Classes filter.
          Our third feature is back links to source data classification systems like RxNorm and PubChem.
          Our newest feature rolling out is the ability to search and create lists, for example Top 1000 drugs, and MPJE testable drugs.
        </p>
      </Section>

      <Section heading="Our Land, Knowledge, and Environment Acknowledgment">
        <p>

        Pharmacy Commons may be a website in "the cloud", but it depends on physical things which impact our environment: servers, cables, 
        power grids, and notably the water that cools data centers. All of it sits on the ancestral 
        lands of Indigenous nations who still hold them as sacred. Most of these lands were 
        never ceded. Others were taken by force or through treaties signed under pressure. 
        Like all websites, Pharmacy Commons is made possible only by being maintained on the lands of the nations through its physical presence.
       </p>
      <p>
        We would like to recognize the specific lands and peoples that are being implicated.
        Our domain name is registered through Porkbun, based in the Portland, Oregon area. This
        is the homeland of the Atfalati (Tualatin Kalapuya) and of Chinookan peoples, including 
        the Multnomah and Clackamas. The Cowlitz, Molalla, Wasco, and other peoples also have ties
        to this land. These communities continue today, including through the Confederated Tribes 
        of Grand Ronde, the Confederated Tribes of Siletz Indians, the Cowlitz Indian Tribe, the 
        Confederated Tribes of Warm Springs, and the Chinook Indian Nation.
       </p>
      <p>
        Our Postgres SQL database runs through Supabase on Amazon Web Services in Northern Virginia. This is the
        homeland of the Doeg (Tauxenent), the Manahoac, and the Patawomeck. We recognize the tribal
        nations of Virginia today, including the Chickahominy, Eastern Chickahominy, Mattaponi, Monacan,
        Nansemond, Pamunkey, Patawomeck, Rappahannock, and Upper Mattaponi. Additionally, our code and
        website are hosted through GitHub, whose networks cross the homelands of many nations.
        </p>
      <p>
        Further, many medicines in this reference trace back to plants, fungi, and practices that Indigenous peoples
        cultivated and protected long before those medicines entered a pharmacopeia. That knowledge has
        often been usurped and commodified, then patented, and sold without consent, credit, or a fair share of the proceeds. The
        resulting medicines are not always affordable to the communities they originated from. We seek to 
        not treat Indigenous knowledge as a commodity. We aim to document where medicine's origins are,
        we will credit them and not publish traditional knowledge that is not already in the public domain. These principles are recognized
        under the CARE Principles for Indigenous Data Governance.
       </p>
      <p>
        Lastly, of great importance, drug's effects also continue after they are taken. Drugs and their byproducts reach rivers, lakes, and 
        groundwater through human waste, disposal, and manufacturing. Where reliable data exist, we
        seek to show estimated environmental risk alongside clinical information and place comparable drug options side by side.
        The aim is to let prescribers weigh environmental impact, alongside a multitude of other 
        considerations like cost and accessibility, when choosing among options that are clinically appropriate.
        </p>
      <p>
        Colonialism is not a thing of the past. It still shapes who has access to land, resources, medicines, and technology
        today. This acknowledgment is only a starting point. We welcome correction and guidance from the communities,
        and parties of interest. We encourage users to learn whose lands they live on, rely on, and pollute, starting with the resources at Native
        Land Digital, and learn how they can live more responsibly in regard to how we treat the environment.
        </p>
      </Section>

      <Section heading="Our Licensing and Intentions">
        <p>
        Pharmacy Commons was founded on the principle that essential drug knowledge belongs to the public that created it.
        Pharmacy Commons operationalizes Elinor Ostrom’s Nobel Prize–winning commons governance to manage clinical data as a permanent, shared public trust. 
        The project establishes an auditable legal position against enclosure by using the copyleft protections of the GNU General Public License v3.0 (GPL-3.0). 
        Meanwhile, original relational data structures and curated schemas are dedicated to the worldwide public domain under Creative Commons Zero (CC0 1.0). 
        This architecture ingests regulatory records from federal agencies like the FDA and CDC, which are barred from copyright protection under 17 U.S.C. § 105.
        We aim to provide explicit provenance—link directly to, for example, FDA document identifiers or clinical study citations. Artificial intelligence functions are allowed by consumers.
        Pharmacy Commons operates as an open-access public utility and research index. Where clinical statements reference proprietary literature, private academic publications, or copyrighted clinical practice guidelines, Pharmacy Commons extracts strictly factual relationships and metadata (e.g., therapeutic classifications, dosing ranges, or study endpoints) rather than replicating expressive commentary. Every external claim is accompanied by explicit provenance and attribution (e.g., DOI, PMID, or publisher citation) to direct researchers back to the primary source.
        We respect the intellectual property rights of private publishers, institutions, and individual authors. 
        If you are a copyright owner, publisher, or authorized representative and believe that any content, excerpt, or reference indexed within Pharmacy Commons infringes upon your copyright or exceeds fair use, you may request its immediate review and removal.
        To submit a removal request, please contact our administrative team at contact@pharmacycommons.org
        </p>
      </Section>

      <Section heading="Our Founder">
        <p>
          Pharmacy Commons is founded and maintained by Dr. Joshua Semock, PharmD, who
          operates as a single-member for now. His alma mater is the University of Colorado
          at the Anschutz Medical campus, Skaggs School of Pharmacy and Pharmaceutical
          Sciences. He attended a post-graduate year one (PGY1) residency program at
          Buffalo Psychiatric Center with the New York State Office of Mental Health and
          University at Buffalo. He was raised in Chicagoland, but now calls Atlanta home.
          To submit a request to become a member of Pharmacy Commons board, please contact at contact@pharmacycommons.org
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
