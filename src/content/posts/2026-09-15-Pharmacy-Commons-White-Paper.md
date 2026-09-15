---

title: "Pharmacy Commons: A Vision for Building Open Pharmaceutical Knowledge Infrastructure for Humans and Machines"
author: Joshua Semock, PharmD
date: 2026-09-15
version: 0.4 (draft for review)
status: Architecture proposal; describes both the current build and the intended design
tags: [Pharmacy-Commons]

---

# Pharmacy Commons

## A Vision for Building Open Pharmaceutical Knowledge Infrastructure for Humans and Machines

**White paper · Draft 0.4 · September 2026
Joshua Semock, PharmD · pharmacycommons.org**

\---

## Abstract

Public drug information is abundant and difficult to use. The FDA, NLM, WHO, EPA, and a
dozen curated databases each describe the same medicines under different keys, at
different levels of chemical and regulatory granularity, under different licenses, and
sometimes in open disagreement. Reference platforms built on top of these sources tend
to present a finished surface: a value appears, and the reader cannot tell whether it
came from a regulatory filing, a curated database, a literature review, or someone's
judgment call. Few free references tell a prescriber anything about what a drug does
after it leaves the patient.

Pharmacy Commons is an open-access pharmacology reference designed around three
commitments. First, every medicine, combination product, and drug class receives a
permanent Pharmacy Commons identifier (PCID) that never changes meaning and is never
reissued. Second, every piece of knowledge attached to that identity is stored as a
sourced claim before it becomes a published fact, so disagreements between sources are
preserved and every published value can be traced back to where it came from. Third,
environmental risk (predicted and measured environmental concentration, risk quotients,
and related indicators) is modeled as a first-class domain alongside clinical data,
supporting greener prescribing decisions between therapeutically interchangeable
agents.

This paper describes the architecture that follows from those commitments: an identity
layer, a substance and formulation layer aligned to existing standards, a sourced
relationship graph, a curation model that treats community wiki edits and automated
ingestion as the same kind of input, a bitemporal fact model, an environmental data
layer, machine-readable surfaces for search and AI retrieval, and six views of one
record: four for human readers, one for software, and a Commons view through which
contributors steward the record. It closes with an honest account of what is built
today, what is designed but not deployed, and the decisions that remain open.

### How this paper is organized

**Part I (Sections 1–7)** explains why Pharmacy Commons exists: its purpose, the
problem it addresses, the values and principles behind it, and what the word *Commons*
commits the project to. **Part II (Sections 8–18)** describes the architecture in
detail. **Part III (Sections 19–23)** reports where the project stands today, the
decisions still open, the roadmap, and how to take part.

\---

# Part I — Why Pharmacy Commons

## 1\. Purpose, mission, and vision

### 1.1 Purpose

Pharmacy Commons exists to make pharmaceutical knowledge more coherent, trustworthy,
and useful. Pharmaceutical information is abundant, but the systems that describe
medicines often disagree about identity, terminology, provenance, classification, and
regulatory context. Pharmacy Commons provides an open layer of shared infrastructure
that connects those pieces without hiding their differences.

The purpose is larger than building another drug reference. It is to make
pharmaceutical knowledge easier to find, understand, verify, connect, reuse, and build
upon, while preserving the evidence and history behind it.

### 1.2 Mission

Our mission is to organize and connect pharmaceutical knowledge into an open,
auditable, interoperable system that serves pharmacists, clinicians, researchers,
patients, developers, educators, and everyone else who relies on drug information. We
do this by providing stable identities, structured relationships, source-linked claims,
transparent curation, environmental context, and machine-readable access.

The mission is practical: build the infrastructure that lets trustworthy
pharmaceutical information move between people, databases, software, and AI systems
without losing its identity or its provenance.

### 1.3 Vision

We envision a pharmaceutical information ecosystem in which medicines have stable
identities, relationships are explicit, evidence is traceable, disagreements are
visible, and data moves freely between systems. A user should be able to start from a
medicine, substance, product, identifier, class, or question and reliably discover the
connected information, without needing to understand the boundaries of every database
that contributed to it.

We envision pharmaceutical knowledge as shared infrastructure: open enough to reuse,
structured enough for machines to understand, transparent enough for people to audit,
and durable enough to stay useful as individual databases, applications, and
technologies come and go.

\---

## 2\. Why we started

Pharmacy Commons began with a simple observation: pharmaceutical information is
everywhere, but the connections between sources are hard to see and hard to trust, and when they are connected it's behind a paywall. The
same medicine appears under different identifiers and at different levels of chemical,
clinical, product, and regulatory granularity. A reference may give a useful answer
without making clear whether that answer came from a regulator, a curated database,
the literature, a calculation, or a human interpretation.

The problem, then, is not a lack of information. It is the lack of a durable layer that
connects information while preserving what each source actually says. Without that
layer, systems resolve disagreements silently, attach properties to the wrong level,
and leave readers unable to tell where a value came from. The project was started to
address that infrastructure problem rather than to reproduce another collection of
drug facts, which is why Pharmacy Commons treats identity, provenance, level
discipline, lifecycle, and evidence as infrastructure rather than as metadata added
after the fact. This is of utmost importance as large language models become our go to source for medical information.

Four specific failures motivate the design.

### 2.1 Fragmented identity

A single molecule such as sertraline appears in PubChem, ChEBI, ChEMBL, DrugBank,
DrugCentral, RxNorm, the FDA's Global Substance Registration System, KEGG, MeSH, the
NCI Thesaurus, PharmGKB, EPA's CompTox dashboard, and Wikidata. Each assigns its own
identifier. Some of those identifiers name the free base, some name the hydrochloride
salt, some name an abstract ingredient concept, and some name a marketed product. A
system that treats "sertraline," "sertraline hydrochloride," and "Zoloft 50 mg tablet"
as interchangeable will eventually attach a salt's molecular weight to a moiety, or a
product's strength to an ingredient, and nobody will notice until the error reaches a
reader.

### 2.2 Disagreement without disclosure

Sources disagree about classification, about controlled-substance status, about
mechanisms, and about which names are synonyms. Most downstream products resolve those
disagreements silently by picking one source and overwriting the rest. The resolution
may be correct, but the reader cannot see that a choice was made.

### 2.3 Knowledge that cannot explain itself

When a reference cannot say where a value came from, it cannot be corrected with
confidence, audited by a regulator or educator, or safely used as grounding for an AI
system. The fastest way to lose trust in a reference is for a reader to discover it
was confident about something it had no basis for.

### 2.4 The missing environmental dimension

Pharmaceuticals and their metabolites reach surface water through excretion and
disposal. Ecotoxicity data, excretion fractions, and wastewater removal rates exist,
scattered across regulatory and research sources, but prescribers rarely see any of it
at the point of choosing between two equivalent agents. Where environmental indicators
are published, they tend to appear as a single number with no visible chain of
assumptions behind it.

\---

## 3\. What we believe

### 3.1 Values

**Open.** Important pharmaceutical knowledge should be as open and reusable as its
sources and licenses permit. Openness extends to the architecture, methodology,
decisions, and corrections that shape the project.

**Auditable.** A published value should be traceable to the claim or claims that
support it. Readers should be able to see where information came from, when it was
retrieved, and how Pharmacy Commons reached a published conclusion.

**Interoperable.** Pharmacy Commons connects existing standards rather than trying to
replace them. External identifiers remain important references; the PCID provides a
stable native identity around which they are resolved.

**Evidence-driven.** Authority and evidence strength are related but not identical.
Pharmacy Commons distinguishes what a source says from how strongly a particular claim
is supported, and preserves conflicting assertions rather than silently erasing
disagreement.

**Community-minded.** Pharmaceutical knowledge improves through responsible
participation. Contributions from people, automated ingestion, and AI suggestions all
enter a reviewable process; none of them bypass curation.

**Environmentally responsible.** The effects of a medicine do not end when a
prescription is dispensed. Where evidence permits, environmental exposure and risk
belong alongside clinical information so that they can become part of an informed
comparison.

### 3.2 Design principles

The architecture follows from eight principles.

**Identity before knowledge.** A stable identity gives information a durable place to
live. A PCID does not contain pharmaceutical knowledge; it is the anchor around which
knowledge is organized, and it does not change meaning because knowledge about the
entity improves. Identity decisions are made once, recorded, and never silently
revised.

**Claims before conclusions.** Nothing enters the published record directly. Every
value arrives as an assertion from an identified source, and published facts are a
curated projection of those assertions. Curation becomes visible rather than
invisible.

**Provenance is part of the data.** Source, source record, retrieval date, source
version, jurisdiction, and evidence strength travel with every assertion. A value
without provenance is hard to audit and hard to correct, and the platform does not
publish one.

**Level discipline.** A moiety, a salt, a product, a package, and a class are related
but not interchangeable. Every identifier and every property attaches at the level it
actually describes, and nothing is stored at a more general level than its source
intended. This prevents errors that otherwise look plausible.

**Availability does not depend on the backend.** The identity spine ships as a static,
machine-readable file with the website. A database outage or backend change reduces the
detail a page can show; it never makes a drug unreachable.

**AI reads the record; it does not write it.** Language models are a retrieval and
reasoning layer over structured data. They can help retrieve, summarize, connect, and
suggest, but anything a model generates is labeled as generated and enters the same
review queue as any other unreviewed claim.

**Build in public.** Architecture decisions, environmental methodology, corrections,
uncertainties, and rejected approaches are written down openly, including the
decisions that turn out to be wrong.

**One record, many views.** Patients, clinicians, researchers, educators, and software
read the same record through different views, and contributors maintain it through
one more. A view changes what is shown and how it is explained; it never changes the
facts.

\---

## 4\. The Commons

The word *Commons* is intentional. Pharmacy Commons is not meant to be merely a website
that displays drug information. It is meant to become shared infrastructure for
pharmaceutical knowledge.

A commons is valuable because knowledge grows when people and systems can build on a
common foundation. Here, that foundation is stable identities, openly documented
relationships, source-linked claims, transparent curation, machine-readable data, and
durable historical references.

A commons is also a stewardship model. Shared knowledge needs maintenance, review,
attribution, correction, and governance. Community participation does not mean that
anything becomes true because someone entered it: contributions enter a review process
in which evidence and provenance stay visible, and automated ingestion and AI
suggestions follow the same rule.

The aim is to keep pharmaceutical knowledge from being locked inside a single
application, database, or commercial interface. Pharmacy Commons can coexist with
existing standards and commercial products while offering an independent identity and
provenance layer that others can reference, reuse, and build on.

A commons also means there is no separate truth for each audience. There is one shared,
auditable body of knowledge, presented in ways suited to the people and systems using
it, and maintained in the open through the Commons view (Section 17.7). That view is
where the project's name becomes something a reader can use: the place to see how the
record is built, and to help build it.

\---

## 5\. What we're building

Pharmacy Commons is building open pharmaceutical knowledge infrastructure organized
around a stable identity spine.

**Identity.** Medicines, combination products, and drug classes receive permanent
PCIDs, while substances, products, packages, and external identifiers stay connected at
the level they describe. PCIDs are never deleted or reissued, so historical references
remain resolvable as the knowledge base evolves (Sections 8–10).

**A sourced knowledge graph.** Class membership, combination components, substance
relationships, interactions, targets, indications, contraindications, and product
relationships are stored in PostgreSQL as structured edges with supporting assertions
(Sections 11 and 14).

**Assertions and provenance.** The platform records what a source says before
publishing a canonical value. Sources, source records, versions, retrieval dates,
jurisdictions, evidence strength, assertion type, and review status travel with every
incoming claim. Conflicting claims coexist, and canonical tables keep links to the
assertions that support them (Sections 12 and 13).

**Environmental context.** Ecotoxicity, physicochemical properties, excretion,
metabolites, consumption, wastewater removal, PEC, PNEC, RQ, and MEC connect to the same
identity architecture, and derived indicators keep their derivation paths so that their
assumptions can be examined rather than taken on faith (Section 15).

**Machine-readable access.** Exact identifier lookup, lexical search, semantic
retrieval, static per-PCID documents, JSON, JSON-LD, and future APIs make the same
record useful to websites, researchers, developers, search systems, and AI
applications. AI retrieval resolves the entity first, retrieves canonical data and its
supporting assertions, and only then generates an answer (Section 16).

**One record, several views.** The same record is presented through Patient, Clinical,
Research, and Academic views for human readers and a Machine view for software, with
evidence and provenance available from every one of them. A sixth view, Commons, is
where contributors and curators review, correct, and extend the record. One identity,
one evidence record, several ways to understand it, and a shared place to maintain it
(Section 17).

\---

## 6\. Our commitment to trust

Trust is not something Pharmacy Commons asks users to accept. It is something the
architecture is designed to make inspectable.

Every published value is connected to the assertions that support it. Source authority
is recorded separately from the evidence strength of an individual claim. Conflicting
assertions are preserved rather than overwritten. Corrections remain visible through
the platform's temporal and lifecycle records.

Human curation is distinguished from machine-generated content. A pharmacist-curated
interpretation is identified as such, while an AI-generated suggestion remains an
unreviewed proposal until it passes through curation. Generated output never becomes
canonical pharmaceutical knowledge merely because a model produced it.

Evidence and provenance are available from every view, including the Patient view. No
reader is asked to accept a value without a way to see where it came from.

Licensing is treated as part of provenance and governance, not as an afterthought.
Upstream sources are tracked individually because their licenses and redistribution
terms affect what Pharmacy Commons can publish (Section 18).

In practice, this commitment shows up in three habits:

* **A public build log.** Data-model decisions, environmental methodology, and their
rejected alternatives are written down in the open.
* **Visible corrections.** When a published value is wrong, the correction is described
rather than quietly applied. The bitemporal model preserves what was previously
published.
* **Not medical advice.** Pharmacy Commons describes how drug information is structured
and where it comes from. It does not tell anyone what to do for a particular patient.

\---

## 7\. Founder and organization

Pharmacy Commons was founded by **Joshua Semock, PharmD** in September of 2026, to address a problem at the
intersection of pharmacy practice, pharmaceutical information, data architecture, and
open knowledge. The project grew from the recognition that the hard part of
pharmaceutical information is often not finding another fact, but understanding how
facts from different systems relate to one another and whether the resulting answer
can be trusted.

It began as an attempt to create a more durable reference model and developed into the
architecture described in this paper: permanent PCIDs, explicit entity levels, a sourced
relationship graph, assertions and provenance, environmental data, machine-readable
surfaces, and a reviewable path for human and machine contributions.

Pharmacy Commons is currently operated as a single-member LLC, with the intent to
convert to a nonprofit structure. A trademark filing for the Pharmacy Commons name is
planned. The project is built publicly, with its architecture and unresolved decisions
documented as the system develops.

Dr. Joshua Semock completed his training at the University of Colorado's Anschutz Medical
Campus with the Skaggs School of Pharmacy and Pharmaceutical Sciences. He attended a post-graduate
year one (PGY1) program at the Buffalo Psychiatric Centers' Strozzi Hospital, part of the New York
State Office of Mental Health. He now practices in Atlanta, Georgia.
\---

# Part II — Architecture

The sections that follow describe the architecture in the order a record is built:
identity first, then chemistry and products, cross-references, relationships, claims and
curation, time, combinations, environmental data, machine-readable access, and
licensing.

## 8\. The identity layer

### 8.1 PCID allocation

The Pharmacy Commons identifier is a seven-digit number rendered as `PCID-NNNNNNN`. The
leading digit declares the kind of entity, and each kind is allocated from its own
block.

|Block|Range|Entity kind|
|-|-|-|
|1|PCID-1000001 – PCID-1999999|Solo medications (single active moiety)|
|2|PCID-2000001 – PCID-2999999|Combination products|
|3|PCID-3000001 – PCID-3099999|Drug class pages: ATC hierarchy nodes|
|3|PCID-3100001 – PCID-3199999|Drug class pages: ChemOnt chemical taxonomy terms|
|3|PCID-3200001 – PCID-3999999|Unallocated within the class block|
|4–9|PCID-4000001 – PCID-9999999|Reserved for future entity kinds|

PCIDs are opaque in every respect except the block digit. They are not hashes of names,
they encode no chemistry, and their ordering carries no meaning. PCID (together with
the DAM described below) is the only native key in the system. CAS Registry Numbers,
UNIIs, RxCUIs, DrugBank IDs, ATC codes, ChemOnt IDs, and FDA application numbers are
foreign identifiers: important, indexed, and resolvable, but never keys. Surrogate
integer primary keys that shadow the PCID were considered and rejected, because a
second internal key invites the two to drift apart.

A PCID is stored in one canonical form throughout the database and rendered with its
`PCID-` prefix at display and API boundaries. Mixing prefixed strings and bare numbers
across tables is a common source of silent join failures and is avoided by
convention.

### 8.2 What earns a PCID

An entity receives a PCID when it has a public page, a route, or a wiki identity:
something a reader can link to, cite, and edit. Solo medications, combination
products, and class pages meet that test. Specific substances (salts, hydrates,
esters), marketed products, packages, sources, and individual assertions do not; they
carry internal keys and are reached through the PCID they belong to. If one of those
entity kinds later needs its own page, it receives its own block from the reserved
range rather than borrowing from an existing one.

### 8.3 The moiety level and the DAM

A PCID-1 entity represents a drug at the level of its active moiety: metoprolol, not
metoprolol succinate or metoprolol tartrate. The moiety is the part of the molecule
responsible for the pharmacological action, and it is the level at which prescribers
usually reason about a drug.

Each solo medication also carries a **DAM** (drug active moiety) identifier,
`DAM-1NNNNNN`, that numerically mirrors its PCID. The DAM is derivable rather than
separately allocated, which makes it impossible for the two to disagree. Combination
products contain several moieties and therefore have no single mirrored DAM;
`DAM-2NNNNNN` is not a valid identifier. A combination refers instead to the PCIDs
(and hence DAMs) of its components.

The moiety rule is clean for most small-molecule drugs and needs an explicit policy
for the cases where "the active moiety" is ambiguous. Those cases are listed here
because the architecture depends on answering them consistently, not because the
answers are settled (see Section 20).

|Case|Example|Question the policy must answer|
|-|-|-|
|Prodrug and active metabolite|enalapril / enalaprilat|One PCID or two, and how the relationship is expressed|
|Racemate and single enantiomer|citalopram / escitalopram|Whether a marketed enantiomer is its own moiety|
|Defined mixtures|conjugated estrogens|Whether the mixture is the moiety|
|Biologics|insulin analogues, monoclonal antibodies|What stands in for a molecular moiety|
|Botanicals and extracts|senna, psyllium|Whether a named plant preparation is a moiety|
|Non-drug substances|ethanol, iodinated contrast media|Whether they receive PCIDs or live only as substances|

The last row matters for interactions. Alcohol and iodinated contrast are legitimate
interaction partners even though they are not prescribed as drugs, so they must be
addressable. Whether that address is a PCID or a substance key is a policy decision,
but either way they are excluded from general drug browsing.

### 8.4 Lifecycle: permanence without rigidity

Identities change as knowledge improves: two records turn out to be the same drug, one
record turns out to conflate two drugs, or a combination product is discovered filed
in the solo block. The rule that governs all of these is simple: **a PCID is never
deleted and never reissued.**

Every PCID has a lifecycle state.

|State|Meaning|
|-|-|
|`active`|Current, published identity|
|`reserved`|Allocated but not yet published|
|`deprecated`|Still resolvable; no longer recommended for new references|
|`merged`|Folded into a successor PCID; resolves to the successor|
|`split`|Replaced by two or more successor PCIDs; resolves to a disambiguation page|
|`retired`|Permanently withdrawn; never reissued; logged for permalink routing|

Two supporting structures make the lifecycle workable. A **PCID event log** records
every state change with its date, reason, actor, and successor(s), so the history of an
identity can be reconstructed. A **slug redirect table** maps every URL slug a PCID has
ever used to its current destination, so a link published in 2026 still lands
somewhere sensible in 2036. The existing `pcid\_retired` log is the first piece of this
structure.

Merges and splits follow fixed rules. In a merge, the surviving PCID keeps its number,
the absorbed PCID moves to `merged` with a successor pointer, and its assertions are
re-pointed while retaining their original subject for audit. In a split, the original
PCID moves to `split`, and every resulting entity receives a new PCID, including the
one that looks most like the original. Reusing the parent number for one child would
silently change what historical citations of that number mean.

A combination product found in the solo block is treated as a split in miniature: a new
PCID is allocated in block 2, the misfiled PCID is retired with a successor pointer, and
its slug redirects. The same rule covers any entity found in the wrong block.

\---

## 9\. Substances and the formulation ladder

### 9.1 The substance layer

Beneath each moiety sits a set of specific substances: the free base or acid, its
salts, hydrates, solvates, esters, and, where relevant, its individual stereoisomers.
Metformin and metformin hydrochloride are different substances with different
molecular weights, CAS numbers, and UNIIs, but they share one moiety and therefore one
PCID. Lisinopril anhydrous and lisinopril dihydrate share one PCID in the same way.

**CAS Registry Numbers and UNIIs are substance-level identifiers.** They attach to
substance records, never directly to a PCID. Structure identifiers (SMILES, InChI,
InChIKey), molecular formula, molecular weight, and physicochemical properties such as
log K<sub>ow</sub>, pKa, and water solubility also belong to specific substances. A
moiety-level page displays them by pointing to the substance that represents the
moiety, rather than by copying them onto the PCID record.

The substance layer is also where two kinds of entities live that a prescribing
reference often forgets:

* **Metabolites and environmental transformation products.** A drug's major
metabolites are substances in their own right, with their own identifiers,
toxicity data, and environmental fate. The environmental model in Section 15 depends
on them.
* **Non-drug interaction partners** (if the policy in Section 8.3 keeps them out of
the PCID space). Ethanol, grapefruit constituents, and contrast agents are substances
that interactions can reference.

Substance records carry internal keys and a typed parent link (`salt\_of`,
`hydrate\_of`, `ester\_of`, `enantiomer\_of`, `metabolite\_of`), which makes the substance
layer a small graph of its own.

### 9.2 From ingredient to package

Above the substance, pharmaceutical reality becomes a ladder of increasingly specific
concepts: the ingredient in a product, the product's dose form and route, its strength,
the branded version, and finally the physical package with its NDC. Pharmacy Commons
does not invent this ladder. It aligns to two established models: RxNorm, which is the
de facto US standard for clinical drug concepts, and ISO IDMP (ISO 11238 for
substances, ISO 11615 for medicinal products), which the FDA's GSRS already implements
at the substance level.

|Pharmacy Commons level|Example|RxNorm term type|ISO IDMP analogue|Key|
|-|-|-|-|-|
|Moiety / solo medication|metformin|IN|Substance (active moiety)|PCID-1, DAM|
|Specific substance|metformin hydrochloride|PIN|Substance (ISO 11238)|internal|
|Clinical drug component|metformin HCl 500 MG|SCDC|Pharmaceutical product ingredient + strength|internal|
|Clinical dose form|metformin extended-release oral tablet|SCDF|Pharmaceutical product (dose form, route)|internal|
|Clinical drug|metformin HCl 500 MG extended-release oral tablet|SCD|Pharmaceutical product|internal|
|Branded drug|a branded equivalent of the above|SBD|Medicinal product (ISO 11615)|internal|
|Package|a specific bottle count with an NDC|(NDC mapping)|Packaged medicinal product|internal|

Several consequences follow. "Metformin extended release" is not a synonym of
metformin; it is a dose-form-level concept that points to the metformin PCID. Brand
names are names of branded products; they are indexed for search and resolve to the
PCID, but they are recorded at the branded level. FDA application numbers and NDCs
attach to products and packages, not to moieties.

### 9.3 Structured strength

Strength is never stored only as text. A strength is a numerator value and unit and,
where the strength is a concentration or a per-actuation dose, a denominator value and
unit. Units follow UCUM so that automated comparison and conversion are possible.
Strength belongs to the clinical drug component and product levels. It does not belong
on a moiety, and it does not belong on a combination product's PCID (Section 14).

\---

## 10\. Cross-references and resolution

### 10.1 One identifiers table, governed by a namespace registry

External identifiers live in a single normalized table rather than as a growing row of
columns on the drug record. Each row states the namespace, the identifier, the level it
attaches to (moiety, substance, product, package, or class), the entity it attaches
to, whether it is the preferred identifier in that namespace for that entity, and the
assertion that supports it.

The namespaces themselves are data, held in a **namespace registry**. Each namespace
record carries:

|Registry field|Purpose|
|-|-|
|Namespace code and display name|Stable reference used across the system|
|Validation pattern|Rejects malformed identifiers at ingestion|
|URL template|Generates outbound links without per-source code|
|Attachment level|Declares whether the identifier names a moiety, substance, product, package, or class|
|Authority|Regulatory body, curated database, community project, and so on|
|License and redistribution terms|Determines what can be republished and under what terms|
|Default evidence posture|Starting point for evidence strength of assertions from this source|

Adding a new identifier system means adding a registry row, not changing the schema.
The registry also enforces level discipline: an RxNorm precise-ingredient code for a
specific hydrate cannot be attached to a moiety, because the registry and the
term type say it names a substance.

### 10.2 Identifier resolution as a service

Resolving an arbitrary input (a CAS number, a DrugBank ID, a brand name, a misspelling)
to a PCID is a first-class capability of the platform, used by search, by ingestion,
and by the AI layer. Resolution proceeds from most to least certain and records how
each match was made.

|Match type|Basis|Typical confidence|
|-|-|-|
|`exact`|Identifier lookup in an indexed namespace|Definitive|
|`synonym`|Exact match on a curated name|High|
|`fuzzy`|Trigram or edit-distance match on names|Moderate; shown with alternatives|
|`semantic`|Embedding similarity on descriptions|Low; never used for identifiers|
|`manual`|Curator decision|Definitive, with a recorded rationale|

A resolver response always states the match type. Ambiguous input returns candidates
rather than a guess, and identifier-shaped input never falls through to semantic
matching.

### 10.3 Names

Names are modeled independently of identifiers: each name records its text, language,
script, name type (preferred, international nonproprietary, brand, systematic,
abbreviation, common misspelling, legacy, translated), the level it describes, and its
source. Language tags are required and meaningful. A Spanish or Italian name tagged as
English defeats the multilingual goal, and a misspelling tagged as a synonym misleads
anyone who reuses the name list.

\---

## 11\. Relationships and classes

### 11.1 A sourced graph in PostgreSQL

Pharmacy Commons functions as a pharmaceutical knowledge graph without a dedicated
graph database. The graph is a relationship table in which each edge has a subject, a
predicate, an object, an assertion type, and a pointer to the assertion(s) that
support it. PostgreSQL's recursive queries handle the traversals the platform needs
(class hierarchies, combination components, substance families), and the data stays in
the same transactional store as everything else.

### 11.2 Classes are entities

Drug classes are PCID-3 entities with their own pages, not strings attached to a drug.
The ATC hierarchy occupies PCID-3000001 through PCID-3099999, and the ChemOnt chemical
taxonomy occupies PCID-3100001 through PCID-3199999. The hierarchy within each system
is expressed as `subclass\_of` edges between class entities.

A statement such as "lisinopril is an ACE inhibitor" is therefore an edge,
`member\_of`, from a PCID-1 entity to a PCID-3 entity, supported by an assertion from
the WHO ATC index, from the FDA's established pharmacologic class, or from a curator.
Classification systems themselves (ATC, ChemOnt, FDA EPC, MeSH pharmacologic actions)
are described once in a small metadata table: their publisher, version, and license.
FDA EPC concepts and MeSH pharmacologic actions can be brought into the class block as
the platform grows, following the same pattern.

Treating classes as entities also resolves an older limitation. Many interactions are
described at the class level: NSAIDs, strong CYP3A4 inhibitors, potassium-sparing
diuretics. When classes had no identity, those interactions could only be plain text.
With class PCIDs, an interaction can point at a class, and every member drug's page can
display it with a link.

### 11.3 The predicate registry

Relationship types are governed by a **predicate registry**, just as identifier
systems are governed by the namespace registry. Each predicate declares:

* which entity kinds may appear as its subject and object (its domain and range);
* its inverse, if it has one, so that each relationship is stored once and displayed
from both ends;
* whether it is symmetric (interactions are recorded once per pair, never as two
reversed rows);
* its inheritance policy for combination products (Section 14).

An initial predicate vocabulary includes `member\_of`, `subclass\_of`, `has\_component`,
`has\_substance`, `salt\_of`, `hydrate\_of`, `metabolite\_of`, `transforms\_to`,
`interacts\_with`, `targets`, `inhibits`, `activates`, `has\_indication`,
`contraindicated\_in`, `successor\_of`, and `has\_product`. A value that is not in the
registry cannot be written.

\---

## 12\. Assertions, curation, and canonical facts

### 12.1 Every claim is an assertion

The central structural decision in Pharmacy Commons is the separation between **what
sources say** and **what Pharmacy Commons publishes**. Every incoming claim, whatever
its origin, is written first as an assertion that records:

* the subject (a PCID or a lower-level key), the predicate, and the object or value;
* the source, the source's own record identifier, the source version, and the
retrieval date;
* the import batch or contribution that produced it;
* the jurisdiction the claim applies to, where that matters;
* the assertion type: `direct` (the source said it), `inherited` (propagated from a
component under a declared policy), or `derived` (computed or synthesized by
Pharmacy Commons, with its derivation path recorded);
* the evidence strength, assessed separately from the authority of the source
(Section 12.3);
* a review status.

Conflicting assertions coexist. If one source classifies a drug one way and another
source classifies it differently, both assertions remain available indefinitely.

### 12.2 Canonical tables are a curated projection

The tables that power the public site (identifiers, names, relationships,
physicochemical properties, environmental values) are the canonical record. Each
canonical row links to the assertion or assertions that support it, and where
assertions conflicted, the canonical row records which one was chosen and why.

This makes a separate, generic "facts" table unnecessary. A generic entity–attribute–
value store tends to become a catch-all that is hard to validate and hard to query.
Typed canonical tables with support links give the same traceability with real
constraints.

### 12.3 Authority is not evidence strength

It is tempting to rank evidence by where it came from: regulators first, curated
databases second, literature third, everything else last. Source authority matters, but
it is not the same as the strength of a specific claim. The FDA publishes both
approved labeling and spontaneous adverse event reports, and the second is signal-level
evidence regardless of the agency's authority. A curated database value may simply
restate a label.

Pharmacy Commons therefore records two things: the **authority** of each source, held
in the source and namespace registries, and the **evidence strength** of each
assertion, held on the assertion. Provenance classes distinguish the kinds of origin a
reader and an AI system need to tell apart.

|Provenance class|Examples|How it is presented|
|-|-|-|
|Regulatory|FDA labeling and approvals, WHO ATC, NLM RxNorm, FDA GSRS|Cited directly|
|Curated database|ChEBI, ChEMBL, PubChem, DrugCentral, DrugBank|Cited directly; license shown where it constrains reuse|
|Literature|Peer-reviewed studies and reviews|Cited with the reference|
|Pharmacist-curated|Reviewed interpretations, canonical choices, community edits approved by a moderator|Marked as Pharmacy Commons curation, with reviewer and rationale|
|Computed|Risk quotients, unit conversions, inherited class sets|Marked as derived, with the derivation path|
|Machine-generated, unreviewed|AI summaries and suggested links|Never published as fact; visible only as labeled drafts or in the review queue|

Keeping pharmacist-curated interpretation separate from machine-generated output is
deliberate. Reviewed human judgment is one of the most valuable things the platform
offers, and it should not share a tier with unreviewed model output.

### 12.4 Wiki editing is the same pipeline

Community editing does not need a separate data path. A contributor's edit is an
assertion whose source is that contributor. It enters the existing `revisions` staging
queue, a moderator reviews it, and the `approve\_revision()` function, running as a
`security definer` function behind Row Level Security, promotes it into the canonical
tables with its support link intact. Automated ingestion from openFDA or ECOTOX and
suggestions from an AI system follow the same route, differing only in their source
record and review requirements.

This gives the moderator interface, which lives in the Commons view (Section 17.7), a
precise job: show the proposed assertion, the assertions it competes with, and their
provenance, then record the decision and its rationale. It also means that every
published value, whether it came from a regulator or a volunteer, can answer the same
question: who said this, when, and who approved it.

\---

## 13\. Time and jurisdiction

Pharmaceutical knowledge changes. Labels are revised, schedules change, classifications
are reorganized, and source databases re-release. Two different questions about the
past are both legitimate, and they require two different clocks.

|Question|Clock|Recorded as|
|-|-|-|
|"What was true of this drug in 2024?"|Valid time: when the fact applied in the world|valid-from / valid-to|
|"What did Pharmacy Commons publish about this drug in 2024?"|Transaction time: when the platform recorded it|recorded-at / superseded-at|

Keeping both makes the platform bitemporal. A schedule change effective on a given date
is recorded with that valid date, even if it was ingested weeks later. A correction to a
wrongly entered value supersedes the old row in transaction time without pretending the
old value was never published, which is what makes public corrections possible.

Many facts also depend on place. Regulatory status, controlled-substance scheduling,
approved indications, and environmental exposure all vary by jurisdiction. Assertions
and canonical rows carry a jurisdiction wherever the value is not universal, so the
platform can later serve more than one regulatory context without restructuring.

\---

## 14\. Combination products

A combination product receives its own PCID in block 2. It does not duplicate the
knowledge of its components; it references each component's PCID through
`has\_component` edges, and each component edge may note the specific substance used
(budesonide with formoterol fumarate dihydrate, for example).

The hard question is which properties a combination inherits from its components. The
answer differs by property, so inheritance is declared per predicate in the predicate
registry rather than assumed globally.

|Property|Policy|Reasoning|
|-|-|-|
|Class membership|Union of component classes, marked `inherited`|A combination containing an ACE inhibitor is, for browsing purposes, in that class|
|Mechanism of action|Union, marked `inherited`|Each component acts independently|
|Identifiers and names|Never inherited|A component's CAS number is not the combination's|
|Physicochemical properties|Never inherited|A product has no single structure|
|Controlled-substance schedule|Never inherited; product-specific|Some combinations are scheduled differently from their components. Codeine alone is Schedule II, while certain low-concentration codeine combinations are Schedule V|
|Interactions|Curated or computed, never automatic|Interactions do not simply add together, and combinations can introduce their own|
|Pregnancy and lactation data|Not inherited|Component data informs, but does not establish, a combination's profile|
|Environmental risk|Computed from each component's mass per product|Each component reaches the environment separately and in its own quantity|

Component strengths belong to products, not to the combination's PCID. A single
combination such as budesonide/formoterol is marketed in more than one strength
pairing, and the entity-level record must remain true for all of them.

Every inherited or computed value keeps its derivation path: which components, which
component assertions, and which policy produced it. When a component's data changes,
dependent combination values can be identified and recomputed.

\---

## 15\. Ecopharmacovigilance as a first-class domain

### 15.1 What the indicator actually is

The environmental risk indicator on a Pharmacy Commons page is a risk quotient:

```
RQ = PEC / PNEC
```

**PEC**, the predicted environmental concentration, estimates how much of a drug
reaches surface water. **PNEC**, the predicted no-effect concentration, estimates the
concentration below which harm to aquatic organisms is not expected. An RQ at or above
1 indicates that predicted exposure has reached the level at which effects are
anticipated. Where a **MEC**, a measured environmental concentration from real
sampling, exists, it is shown alongside the prediction and trusted over it. The
platform tracks related indicators (including DPD) on the same footing.

Each of these is a chain of estimates, and the architecture exists to keep that chain
visible.

### 15.2 Where each input lives

The environmental model reuses the layers already described rather than bolting on a
separate silo.

|Input|Layer|Typical source|
|-|-|-|
|Ecotoxicity endpoints (species, endpoint, duration, concentration)|Substance-level assertions|EPA ECOTOX quarterly bulk export, keyed by CAS number|
|Physicochemical properties (log K<sub>ow</sub>, pKa, water solubility)|Substance-level canonical properties|CAS Common Chemistry, PubChem|
|Excreted fraction as parent compound|Relationship between moiety and substance, with a value|Pharmacokinetic literature, labeling|
|Major metabolites and transformation products|Substances linked by `metabolite\_of` and `transforms\_to`|Literature, curated databases|
|Consumption volume|Assertion scoped by jurisdiction and year|Utilization data sources|
|Wastewater treatment removal|Assertion scoped by substance and, where known, treatment type|Literature|
|Dilution|Parameter scoped by jurisdiction|Regulatory guidance defaults|
|PEC|Derived value per substance, jurisdiction, and year|Computed|
|PNEC|Derived value per substance, with the assessment factor recorded|Computed from ecotoxicity endpoints|
|RQ|Derived value with full derivation path|Computed|
|MEC|Direct assertion with sampling location, date, and matrix|Monitoring studies|

Because ecotoxicity data is keyed by CAS number, it lands naturally on the substance
layer described in Section 9, and the moiety page aggregates it. Because PEC depends on
consumption, it is scoped by jurisdiction and year, which the bitemporal model already
supports. Because RQ is computed, it is stored as a derived value whose derivation path
names every input assertion, the assessment factor, and the method version.

### 15.3 Presenting uncertainty honestly

A single number looks more authoritative than the estimates behind it. The platform's
presentation rules follow from that:

* The indicator is a **comparative** signal between therapeutically interchangeable
agents. A consistent order-of-magnitude difference is meaningful; a small difference
between compounds with different data quality is noise.
* Every page shows which inputs were measured and which were estimated, and how thin
the underlying toxicity data is.
* An RQ below 1 is not presented as "safe." A value of 0.9 and a value of 0.001 are
both below threshold and mean very different things.
* Environmental accents in the interface are visually reserved and sparse, so that they
signal rather than decorate.

### 15.4 Seeding the domain

Environmental coverage starts with the compounds most likely to have usable data: the
pharmaceuticals and personal-care products in EPA Methods 1694 and 1698, roughly a
hundred compounds, cross-referenced to the ECOTOX bulk export. Coverage expands from
there as physicochemical backfill and excretion data make PEC estimation possible for
more of the catalog.

\---

## 16\. Machine-readable surfaces and AI

### 16.1 Three retrieval layers

Search and AI retrieval route each query to the layer suited to it.

|Layer|Handles|Implementation|
|-|-|-|
|Exact lookup|PCIDs, DAMs, CAS numbers, UNIIs, RxCUIs, DrugBank IDs, and other identifiers|Indexed identifier table via the namespace registry|
|Lexical search|Names, synonyms, brand names, class names, misspellings|PostgreSQL full-text search and trigram similarity|
|Semantic search|Natural-language questions, mechanism and class descriptions|Vector embeddings of curated text, never of identifiers|

The static catalog already delivers the first two layers for names and slugs entirely
in the browser.

### 16.2 Resolve first, then retrieve

Before an AI system answers a question about a specific drug, the question passes
through the resolver (Section 10.2). The resulting PCID drives structured retrieval of
canonical rows and their supporting assertions, and only then does a model compose an
answer. This prevents a model from answering from its own memory about a drug it has
misidentified.

### 16.3 The evidence contract

AI answers are returned with a structured record of what they relied on. An
illustrative shape:

```json
{
  "answer": "…",
  "entities": \["PCID-1002556"],
  "canonical\_rows\_used": \["…"],
  "assertions\_used": \["…"],
  "sources": \["…"],
  "derived\_claims": \[],
  "conflicts\_reported": \[],
  "uncertainties": \[],
  "record\_as\_of": "2026-09-15"
}
```

The contract makes three behaviors enforceable. Where evidence exists, the answer cites
it. Where evidence conflicts, the answer reports the conflict and the sources on each
side. Where evidence is absent, the answer says so rather than filling the gap.

### 16.4 Generated documents

Compact per-PCID documents for retrieval-augmented generation are regenerated from the
canonical record, never edited by hand. Each document stores a hash of the canonical
data it was built from, so a stale document can be detected by comparing hashes rather
than by guessing. Generated summaries and profiles are labeled as generated wherever
they appear and never replace structured facts.

The same documents can be published as static JSON under the site's `public/`
directory, following the pattern already used for the drug catalog. That turns the
website itself into a free, cacheable, read-only data endpoint. Each drug page can also
embed schema.org `Drug` markup in JSON-LD, so search engines and outside tools can read
the page's identity and cross-references without scraping. The Machine view
(Section 17.5) is the human-visible entry point to these surfaces.

### 16.5 AI suggestions enter the queue

When a model proposes something new (a missing synonym, a likely class membership, a
candidate duplicate), the proposal is written as an unreviewed, machine-generated
assertion and waits in the same review queue as a human contribution. Nothing a model
produces reaches the canonical record without review.

### 16.6 Graceful degradation

The complete identity spine ships as a static file with the site, and a hydration hook
fills in detail from the database when it is available. Pages declare how complete
their data is and render accordingly. A backend outage therefore reduces the detail a
page can show without making any drug unreachable, and search keeps working.

\---

## 17\. Views: one record, many readers, one shared workspace

### 17.1 Perspectives, not tiers

A patient, a pharmacist, a researcher, a pharmacology student, and a software pipeline
all need something different from the same drug page, and the people who maintain that
page need something different again. Pharmacy Commons serves all of them with
**views**: different presentations of one canonical record, each designed for a
different kind of reader, system, or task.

|View|Tagline|Designed for|Emphasizes|Keeps in the background|
|-|-|-|-|-|
|**Patient**|Understand my medicine|Patients and caregivers|What the medicine is for, how it is generally taken, common and serious side effects, important interactions, safe disposal, questions to ask a pharmacist or prescriber|Registry numbers, structures, classification codes, statistical detail|
|**Clinical**|Use in practice|Pharmacists, physicians, nurses, and other clinicians|Indications, dosing and dose adjustment, contraindications, warnings, interactions, monitoring, pregnancy and lactation, renal and hepatic considerations, formulations and strengths, regulatory and controlled-substance status, drug classes|Chemical and database detail not needed at the point of care|
|**Research**|Explore the evidence|Scientists and investigators|Assertions with their evidence strength, conflicting claims, mechanisms and targets, metabolites, structures and physicochemical properties, pharmacokinetics and pharmacodynamics, literature, the full environmental chain, historical changes, derivations|Simplified explanations|
|**Academic**|Learn and teach|Students and educators|Definitions, mechanisms explained, class and structure–activity relationships, the moiety–substance–product–package distinction, historical development, related drugs and classes, glossary links, references|Operational detail such as package-level data|
|**Machine**|Use the data|Software, data pipelines, and AI systems|Identifiers, relationships, provenance fields, and structured downloads|Prose|
|**Commons**|Help steward the record|Contributors, reviewers, and curators|Record status and completeness, assertions with their review status, competing claims, proposed changes, sources, discussion, and history|Reader-oriented explanation|

The six views fall into three groups. The **perspectives** (Patient, Clinical,
Research, Academic) are ways of reading the record. **Machine** is a way of accessing
it. **Commons** is a way of maintaining it. The first five consume knowledge; the
sixth is where knowledge is built, reviewed, corrected, and kept current.

Four principles govern the set.

**Views are not a ranking.** The order of the views does not mean increasing expertise
or authority. The Research view is not more authoritative than the Clinical view; each
is designed for a different task. Research and Academic in particular are separate
perspectives rather than steps on a ladder: a student may want a clear introduction, a
researcher may want raw evidence, and one person may be both.

**Views are not versions.** There is no "patient version" of a drug. There is one
record, and the Patient view is one way of reading it. The labels describe an
information context (Clinical) rather than a type of person (Clinician), and readers
can switch views freely.

**The interface reflects the three groups.** The perspectives, the Machine view, and
the Commons view are presented as different kinds of choice rather than six equal tabs:

```text
Explore:     Patient · Clinical · Research · Academic
Access:      Machine
Contribute:  Commons
Always available:  Evidence \& provenance
```

**Evidence and provenance are not a view.** They are a transparency layer available
from every view (Section 17.6).

### 17.2 The view invariant

Views may differ in **selection, order, density, terminology, and explanation**. They
never differ in facts. A view may leave something out; it may never say something the
canonical record does not support. Every statement a view displays traces to a
canonical row and, through it, to the supporting assertions (Section 12.2). A
correction made to the record therefore appears in every view at once.

The Commons view is the one place where content outside the canonical record appears,
because reviewing proposals is its purpose. Proposed, disputed, and rejected assertions
are shown there, always labeled with their review status. Unreviewed content never
appears in the reading perspectives or in the Machine view's canonical exports.

Leaving things out has a limit. Each human view carries a **safety floor**: boxed
warnings, contraindications, clinically serious interactions, and controlled-substance
status appear in all four reading perspectives, phrased for the reader but never
omitted. The exact contents of the floor are an open decision
(Section 20).

### 17.3 Progressive depth

Within every view, a page moves from **understanding** to **detail** to **evidence** to
**source**. The same drug read four ways:

|View|Opening of the metformin page|
|-|-|
|Patient|A medicine that helps control blood sugar in type 2 diabetes|
|Clinical|Biguanide antihyperglycemic, followed by dosing, renal considerations, contraindications, and interactions|
|Research|Mechanism and targets, pharmacokinetics, supporting studies and their evidence strength, environmental data|
|Machine|`PCID-1001923` → DAM → identifiers → relationships → assertions → JSON|
|Commons|Record status and completeness, then assertions with their review status, open proposals, conflicts, and history|

Environmental information follows the same pattern, so the project's environmental
commitment reaches every reader at an appropriate depth. The Patient view explains how
to dispose of unused medicine. The Clinical view shows the comparative risk indicator
between interchangeable agents. The Research view exposes the full PEC, PNEC, and RQ
chain with every input. The Academic view explains how a risk quotient works and where
it is weakest. The Machine view delivers the derived values with their derivation
paths (Section 15).

### 17.4 View-specific writing

Some views need writing that the structured record does not contain: plain-language
explanations for patients, teaching notes for students. That writing is its own kind
of content, and it follows the same rules as everything else.

* **It is attached, not free-standing.** Each explanation links to the canonical rows
it explains and stores a hash of them, as generated documents do (Section 16.4). When
the underlying record changes, the explanation is flagged for review instead of
silently going stale.
* **It is reviewed.** View-specific writing enters the `revisions` queue like any other
contribution. Patient-facing text requires pharmacist review before publication,
because it is the surface where a misleading simplification can do the most harm.
* **AI may draft; it may not publish.** A model can propose a plain-language summary,
but the proposal is an unreviewed suggestion until a reviewer approves it
(Section 16.5).
* **Facts are corrected once.** Contributors correct facts in the canonical record, not
inside a view. A view-specific explanation can be rewritten, but it cannot introduce
a fact.

### 17.5 The Machine view

The Machine view is the human-visible front door to the machine-readable surfaces in
Section 16. For any PCID it shows:

* **identity:** PCID, DAM, and every external identifier at its declared level (CAS
number, UNII, RxCUI, DrugBank ID, ChEBI, ChEMBL, and others);
* **relationships:** the entity's edges, labeled with predicates from the predicate
registry;
* **provenance:** for each value, the source, source record, source version, retrieval
date, jurisdiction, assertion type, evidence strength, and review status;
* **formats:** the static per-PCID JSON document, JSON-LD, tabular extracts, and, as they
arrive, API endpoints. Linked-data serializations such as RDF can follow if there is
demand.

It is the same record the AI layer reads, and it is subject to the same upstream license
filters (Section 18).

### 17.6 Evidence, provenance, and history

Every view offers a way to see where information comes from. In the Patient view this is
a plain "Where this information comes from" panel that expands on request. In the other
reading perspectives it is fuller and closer to the surface.

The complete audit trail lives in the Commons view (Section 17.7): source assertions and
conflicts, evidence strength, derivations and calculation methods, curation decisions
and who approved them, corrections, publication history, and the PCID's lifecycle
events. Because the fact model is bitemporal (Section 13), that history can answer both
"what was true at the time?" and "what did Pharmacy Commons publish at the time?" Few
references can answer the second question at all.

### 17.7 The Commons view

The Commons view is where stewardship becomes visible and practical. On any record it
shows the following.

* **Record status.** The PCID and DAM, lifecycle state (Section 8.4), publication
status, when the record was last reviewed, and whether that review is current.
* **Completeness.** Which parts of the record are populated and which are missing:
identity, names, classes, regulatory identifiers, pharmacology, metabolites,
environmental fate, patient-facing text. Completeness is computed from the view
registry and the canonical record, so a gap becomes a task a contributor can pick up.
With hundreds of stub records in the current spine, this is where much of the early
work will be found.
* **Assertions.** Each published statement shown in its underlying form, for example
*metformin → `member\_of` → biguanides*, with its source, assertion type, evidence
strength, and review status, and with competing assertions side by side.
* **Proposed changes.** Pending edits from contributors, ingestion runs, and AI
suggestions, each with its source. Reviewers can accept, reject, or request more
evidence, and every decision records a rationale (Section 12.4).
* **Sources.** The sources behind the record, with their authority and license terms
(Section 18).
* **Discussion.** A thread attached to the record for questions that are not yet
proposals.
* **History.** Publication history, corrections, and lifecycle events, readable as of
any date.

Across the site, the Commons view also provides a workspace: a contributor's own
contributions and their outcomes, the review queue, suggested edits, records with
missing data, records with unresolved conflicts, a source library, open discussions, and
contribution history.

The Commons view changes who can propose changes, not how changes are made. Every edit
it submits is an assertion in the `revisions` queue, and only the `approve\_revision()`
function, running as `security definer` behind Row Level Security, can promote it into
the canonical record. The view grants no direct write access to anything.

Participation is tiered, and every change must name a source.

|Role|Can do|
|-|-|
|Reader|Browse the Commons view's record status, assertions, sources, and history|
|Contributor|Propose changes with a source, join discussions, and draft view-specific writing|
|Reviewer|Accept, reject, or request evidence on proposed changes within their scope|
|Pharmacist reviewer|Approve patient-facing text and clinically sensitive changes|
|Steward|Approve identity changes such as merges, splits, and block corrections, and manage registries|

Identity changes carry the highest bar, because a PCID event is permanent. Patient-facing
text carries the next highest, for the reasons in Section 17.4. Which parts of the
Commons view can be read without an account, the exact thresholds for each role, and the
terms under which contributions are licensed and attributed are open decisions
(Section 20).

### 17.8 How views are implemented

Views are defined as data, in a **view registry**, following the same pattern as the
namespace and predicate registries. For each view, the registry declares which sections
and predicates appear, their order, their default depth, the terminology set used for
labels, for the Patient view a target reading level, and for the Commons view the
actions each role may take. Adjusting a view is a data
change, not a code change, and a new view can be added without touching the record.

The selected view is part of the page URL (for example, `?view=clinical`), consistent
with the site's existing URL-driven navigation. A view is therefore linkable, shareable,
and compatible with static hosting. Views degrade the same way pages do: a stub entry
shows what its completeness allows in every view (Section 16.6).

\---

## 18\. Licensing and upstream terms

The platform's code is licensed under the **GNU General Public License v3.0**, a
copyleft license chosen so that improvements remain open and the codebase cannot be
enclosed for private monetization. Aggregated datasets are published under
**Creative Commons** terms. Some earlier project documents referenced other licensing
terms; those references are being reconciled so that the license text in the
repository is unambiguous before the trademark filing proceeds.

Upstream licensing is tracked per source in the namespace registry, because it
constrains what can be republished. Several valuable sources are licensed for
non-commercial use only (DrugBank and CAS Common Chemistry are both published under
CC BY-NC 4.0), and others, such as KEGG, carry their own redistribution terms. A
non-commercial upstream license can conflict with the terms under which Pharmacy
Commons publishes aggregated data. The options under consideration are:

* storing only identifiers and outbound links from restricted sources, without
republishing their content;
* isolating values derived from restricted sources in a separately licensed dataset
tier;
* replacing restricted values with equivalent values from openly licensed or public
domain sources where they exist.

Because every canonical value links to its supporting assertions and every assertion
names its source, whichever option is chosen can be applied mechanically and audited.

\---

# Part III — Status and path forward

## 19\. Where we are today

Pharmacy Commons is deliberately transparent about the difference between what exists
and what is still being built. The project would rather describe an unfinished system
accurately than present planned capabilities as though they already exist. The
roadmap is part of the public record, and progress is measured against the
architecture and validation requirements in this paper.

### 19.1 Live

* **Domain and site.** pharmacycommons.org is served from GitHub Pages and deployed
through GitHub Actions. The frontend is Vite, React 19, and TypeScript, styled with
Tailwind CSS v4 and routed with React Router v7 using human-readable slugs.
* **The identity spine.** A static catalog of **3,433 PCIDs** ships with the site:
3,265 solo medications in block 1 and 168 combination products in block 2. Of these,
485 entries carry a controlled-substance schedule and 339 are stubs awaiting fuller
records. The catalog weighs roughly 47 KB compressed.
* **Search and browsing without a backend.** Name search, slug routing, and an A–Z
catalog with adjustable page sizes run entirely in the browser against the static
spine.
* **Public writing.** The build log and a methodology post on reading risk quotients are
published.

### 19.2 Designed, not yet deployed

* **Core schema v2.** A rebuilt PostgreSQL schema of 25 tables and 9 functions, with Row
Level Security throughout and `security definer` functions as the only write path to
live tables (edits staged in `revisions` and applied by `approve\_revision()`). The
production database is currently empty. A previous database state was cleared, and
the rebuilt schema has not yet been applied.
* **The concepts in this paper.** The namespace and predicate registries, the assertion
layer, the PCID event log and slug redirects, bitemporal columns, the environmental
derivation model, and the view layer are design commitments. Each still needs to be
mapped onto a table in schema v2 or added in a follow-up migration.

### 19.3 To be rebuilt

The extract–transform–load pipeline that turns the source workbooks into load-ready
files needs to be regenerated against schema v2. Known hazards from earlier attempts are
documented, including load-order dependencies between applications and products,
integer columns that serialize as floats, and text-encoding corruption in some source
files.

### 19.4 Open curation work

* Four spine rows present in an earlier repaired file are unaccounted for in the current
3,433.
* Eight synonym records point at PCIDs that do not exist in the spine.
* A small set of candidate duplicate merges needs clinical review, including one pair
whose sources disagree about controlled-substance schedule.
* Class links are empty across the spine. Backfilling them through DrugBank-to-PCID
mapping is the only current route to populating class membership, and it carries the
licensing question in Section 18.
* The spine should be audited for combination products filed in the solo block, which
the lifecycle rules in Section 8.4 are designed to correct.

### 19.5 Validation before scale

The architecture will be exercised on a small set of fixtures before bulk ingestion.
The fixtures are chosen by the concept they stress, not by popularity:

|Concept under test|Kind of fixture|
|-|-|
|Salt and hydrate separation|A moiety with anhydrous and hydrate forms, and one with multiple salts|
|Stereochemistry|A racemate with a separately marketed enantiomer|
|Prodrug handling|A prodrug with a pharmacologically active metabolite|
|Combination inheritance|A two-component inhaled combination marketed in multiple strengths|
|Product-specific scheduling|A controlled-substance combination scheduled differently from its component|
|Non-moiety entities|A biologic and a non-drug interaction partner|
|Environmental chain|A widely monitored pharmaceutical with measured concentrations and ecotoxicity data|
|Lifecycle|A merge, a split, and a block correction applied to test records|

Fixtures use their real spine PCIDs. Placeholder identifiers are never allocated,
because any PCID that is used once is permanent.

\---

## 20\. Open decisions

These questions need a recorded decision before the dependent work proceeds. Each will
be documented publicly when resolved.

|Decision|Depends on it|
|-|-|
|Moiety policy for prodrugs, enantiomers, mixtures, biologics, and botanicals|PCID allocation for the remaining catalog|
|Whether non-drug interaction partners receive PCIDs or remain substances|Interaction modeling|
|Canonical storage form of PCIDs in the database|Every foreign key|
|Treatment of non-commercially licensed upstream data|Class backfill, physicochemical backfill, dataset license|
|Final dataset license version and attribution terms|Public data exports|
|Evidence-strength scale for assertions|Curation interface, AI evidence contract|
|Jurisdictions supported at launch|Scheduling, regulatory status, PEC scoping|
|Moderator roles and review thresholds for contributor and machine assertions|Commons view, wiki editing|
|Resolution of the spine discrepancies in Section 19.4|Initial load|
|Default view for first-time readers, and whether a reader's choice is remembered|View layer, landing experience|
|Contents of the safety floor shown in every human view|Patient and Academic views|
|Reading-level target and review requirements for patient-facing text|Patient view|
|Which parts of the Commons view are readable without an account|Commons view, trust commitments|
|Contributor terms: license grant for contributions, attribution and pseudonymity, and conflict-of-interest disclosure|Commons view, dataset license|

\---

## 21\. Roadmap

Pharmacy Commons is being developed in deliberate stages rather than through immediate
large-scale ingestion.

|Phase|Focus|Outcome|
|-|-|-|
|0|Foundations|Open decisions in Section 20 recorded; license text reconciled; namespace and predicate registries drafted|
|1|Schema and load|Schema v2 reconciled with this paper and deployed; ETL regenerated; spine loaded and validated against the public static catalog|
|2|Fixtures|The architecture exercised end to end on the deliberately difficult cases in Section 19.5, including lifecycle events|
|3|Enrichment|Physicochemical backfill, class relationships, and openFDA labeling, NDC directory, and adverse-event data, drawn from sources that can be legally and transparently incorporated|
|4|Environmental layer|ECOTOX import for the EPA 1694/1698 seed set; excretion and metabolite data; PEC, PNEC, and RQ computed with complete derivation paths|
|5|Commons and reader views|Commons view with review queue, completeness, assertions, proposed changes, discussion, and history; contributor accounts and roles; public correction notes; view registry; Clinical, Research, and Academic views; pharmacist-reviewed Patient view content; Evidence \& Provenance panel|
|6|Search, AI, and Machine view|Full-text and trigram search; identifier resolver service; embeddings; evidence-aware AI retrieval; Machine view with static per-PCID JSON, JSON-LD, and extracts|
|7|Extension|Multilingual names; additional jurisdictions; patient-facing tools such as medication reconciliation, adherence scheduling, and printable summaries|

Large-scale ingestion will not begin until phases 1 and 2 have shown that the identity,
provenance, level-discipline, and lifecycle rules hold on deliberately difficult real
records.

\---

## 22\. Get involved

Pharmacy Commons is meant to be useful not only to people who visit the website but
also to people who want to build on the knowledge underneath it. There are many ways to
take part:

* use the public reference, and report what is wrong or missing;
* explore and reuse the machine-readable data;
* contribute corrections and knowledge;
* help write or review plain-language Patient view content, or shape the Academic view
for teaching;
* help evaluate difficult identity and classification cases, such as those listed in
Section 8.3;
* build software against the data and, later, the APIs;
* review the environmental and curation methodology;
* identify licensing or provenance problems;
* collaborate on the clinical, technical, environmental, or governance side of the
project.

As the Commons view matures, community contributions will enter the same review
pipeline as imported source data and machine-generated suggestions, and the view's
completeness checks will point contributors to where help is most needed. The goal is not to
make every contribution automatically authoritative, but to make every contribution
**reviewable, attributable, and traceable**.

Pharmacy Commons is being built as infrastructure that others can use, question,
improve, and extend. To get in touch, write to **contact@pharmacycommons.org**.

\---

## 23\. Conclusion

Pharmacy Commons is not an attempt to build another copy of existing drug databases. It
is an attempt to build the layer those databases lack between them: stable identities
that never change meaning, cross-references attached at the level they actually
describe, claims kept separate from conclusions, and published values that can always
say where they came from. On that foundation, environmental risk becomes something a
prescriber can see and question, community editing becomes a reviewable contribution
rather than an overwrite, and AI becomes a reader of an auditable record rather than a
source of unexplained confidence.

The identity spine is already public. The next step is to show, on a small and
deliberately difficult set of records, that the rest of the architecture holds before
it is asked to carry the whole catalog.

\---

## Appendix A. Glossary

|Term|Meaning|
|-|-|
|Active moiety|The part of a drug molecule responsible for its pharmacological action, excluding salt-forming or ester-forming groups|
|Assertion|A single sourced claim about an entity, stored before any curation decision|
|ATC|WHO Anatomical Therapeutic Chemical classification|
|Bitemporal|Recording both when a fact was true (valid time) and when it was recorded (transaction time)|
|CAS RN|Chemical Abstracts Service Registry Number, a substance-level identifier|
|ChemOnt|A structure-based chemical taxonomy|
|Commons view|The contributor and curator workspace for reviewing, correcting, and extending the record; the only view that shows unreviewed content, always labeled as such|
|DAM|Drug active moiety identifier; numerically mirrors a solo medication's PCID|
|EPC|FDA Established Pharmacologic Class|
|GSRS|FDA Global Substance Registration System, the issuer of UNIIs|
|ISO IDMP|ISO standards for identification of medicinal products, including ISO 11238 (substances) and ISO 11615 (medicinal products)|
|MEC|Measured environmental concentration|
|NDC|National Drug Code, a US product and package identifier|
|PCID|Pharmacy Commons identifier; permanent, block-allocated, never reissued|
|PEC|Predicted environmental concentration|
|PNEC|Predicted no-effect concentration|
|RQ|Risk quotient, PEC divided by PNEC|
|RxCUI|RxNorm concept unique identifier; its meaning depends on the RxNorm term type|
|UCUM|Unified Code for Units of Measure|
|UNII|Unique Ingredient Identifier, a substance-level identifier issued through GSRS|
|View|A presentation of the canonical record for a kind of reader, system, or task: the four reading perspectives (Patient, Clinical, Research, Academic), Machine, and Commons; views differ in presentation, never in facts|

## Appendix B. Conceptual structures

This appendix lists the structures the architecture implies. It describes concepts,
not final table names. Mapping to schema v2 is Phase 1 work.

|Structure|Purpose|
|-|-|
|Entities (PCID spine)|One row per PCID with block, lifecycle state, preferred name, and slug|
|PCID event log|Every lifecycle change with reason, actor, date, and successors|
|Slug redirects|Every historical slug mapped to its current destination|
|Substances|Specific chemical substances with structure, identifiers, and typed parent links|
|Products and packages|The formulation ladder from clinical drug component to package|
|Namespace registry|Identifier systems, validation patterns, URL templates, levels, authority, and licenses|
|Identifiers|External identifiers attached at their declared level|
|Names|Names with language, script, type, level, and source|
|Predicate registry|Relationship types with domain, range, inverse, symmetry, and inheritance policy|
|Relationships|Sourced edges between entities and substances|
|Classification systems|Publisher, version, and license of each class system represented in the PCID-3 block|
|Sources and import batches|Source authority, versions, retrieval dates, record counts, and status|
|Assertions|Every incoming claim, with provenance, assertion type, evidence strength, jurisdiction, and review status|
|Revisions queue|Proposed changes awaiting moderation, from contributors, ingestion, or AI|
|Contributors and roles|Contributor accounts, review scopes, and role-based permissions for the Commons view|
|Record discussions|Threads attached to a record for questions that are not yet proposals|
|Canonical property tables|Curated published values, each linked to its supporting assertions|
|Environmental parameters and results|Consumption, removal, dilution, PEC, PNEC, RQ, and MEC with derivation paths|
|Generated documents|Per-PCID retrieval documents and profiles with source hashes|
|View registry|Sections, predicates, order, default depth, terminology, and reading level for each view|
|View-specific writing|Plain-language and teaching text linked to, and hashed against, the canonical rows it explains|
|Retired PCIDs|Permanently withdrawn identifiers kept for permalink routing|

\---

*Pharmacy Commons code is licensed under GPL-3.0. Aggregated datasets are published
under Creative Commons terms. This document describes data structures and methodology
and is not medical advice.*

