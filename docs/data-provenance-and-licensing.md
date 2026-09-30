# Pharmacy Commons — Data Provenance and Licensing Policy

**Effective Date:** September 29, 2026

**Website:** [https://pharmacycommons.org](https://pharmacycommons.org)

**Operator:** Pharmacy of the Commons, LLC

**Maintainer:** Dr. Joshua Semock, PharmD

**Contact:** contact@pharmacycommons.org

Pharmacy Commons operates as an open-access public trust and computational knowledge layer designed to liberate clinical pharmacotherapy and regulatory data from proprietary enclosures. Grounded in the institutional design principles of Nobel laureate Elinor Ostrom, the project manages pharmaceutical information as a durable, shared resource for humans and machines alike.

This policy establishes the platform’s dual-layer open licensing model, defines the statutory boundaries governing upstream records, outlines our provenance and auditability architecture, and details our notice-and-takedown protocol for third-party intellectual property.

### 1. Source Code Licensing (GPL-3.0-or-later)

All software created and maintained by Pharmacy Commons—including frontend React applications, automated Python ingestion and normalization pipelines, SQL schema migrations, Edge Functions, and Model Context Protocol (MCP) servers—is licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**.

* **Copyleft Protection:** GPL-3.0 is a strong copyleft license created by the Free Software Foundation. You are free to inspect, run, modify, fork, and redistribute the codebase. However, any derivative works or distributed modifications must be released under the exact same GPL-3.0 terms.


* **Barrier Against Enclosure:** This licensing requirement creates a legal barrier preventing commercial health-tech corporations or proprietary publishers from privately appropriating the Commons' code, modifying it internally, and re-selling it behind paywalls or closed APIs.



### 2. Original Structured Data (CC0 1.0 Universal)

Original database schemas, normalization logic, entity relationships, custom taxonomies, and curated dataset structures authored directly by Pharmacy Commons are dedicated to the worldwide public domain under **Creative Commons Zero 1.0 Universal (CC0 1.0)**.

* **Worldwide Rights Waiver:** To the maximum extent permitted by applicable law, Pharmacy Commons waives all copyright, database rights, and neighboring intellectual property rights in its original data architectures.


* **Downstream Freedom:** Clinicians, researchers, academic institutions, and artificial intelligence developers may freely copy, export, adapt, and build upon these structured models for non-commercial or commercial applications without licensing fees or permissions.


* **Operationalizing the Commons:** In alignment with Ostrom's governance principles, this waiver eliminates the "anti-commons" dynamic—where overlapping property rights paralyze scientific inquiry—ensuring that the underlying data architecture remains an unencumbered public foundation.



### 3. Upstream Data Sources & Third-Party Licensing Retention

Pharmacy Commons acts as a structured conduit for clinical evidence rather than the creator of primary medical data. In accordance with `api_meta.data_license_scope`, **all ingested third-party records, foreign classifications, and upstream datasets retain their original source licenses and terms of use**.

#### Federal Public Domain (17 U.S.C. § 105)

A significant portion of the Commons aggregates data from United States Federal Government agencies, including the Food and Drug Administration (FDA Structured Product Labeling, Drugs@FDA, Orange Book), the National Library of Medicine (DailyMed, RxNorm/RxNav basic vocabulary), the Centers for Disease Control and Prevention (CDC), and the Department of Veterans Affairs (VA RxClass).

* Pursuant to **17 U.S.C. § 105**, copyright protection is unavailable for works prepared by officers or employees of the United States Government as part of their official duties.


* These records are intrinsically public domain and are ingested, indexed, and displayed without proprietary encumbrances.



#### Attributed & Restricted Upstream Compendia

Where external vocabularies, chemical ontologies, and academic datasets are integrated, they remain governed by their originating publishers:

* **CAS Common Chemistry:** Physicochemical properties sourced from the Chemical Abstracts Service remain licensed under **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.


* **ClassyFire / ChemOnt:** Chemical taxonomy derived via Wishart Lab is governed by their academic terms of use and does not permit unrestricted commercial redistribution.


* **World Health Organization (WHO) ATC:** Anatomical Therapeutic Chemical classifications are subject to WHO terms and are never represented as CC0.


* **DrugBank Cross-References:** Identifier cross-references utilize the open DrugBank vocabulary while respecting the proprietary boundaries of the broader DrugBank Knowledgebase.



#### Factual Extraction & Fair Use

Where the platform references proprietary literature, peer-reviewed clinical studies, or clinical practice guidelines, it extracts purely factual relationships, ontological triples, and metadata (such as indications, dosages, study endpoints, or receptor targets). Pharmacy Commons does not reproduce expressive, copyrightable text. Every claim is paired with explicit provenance (e.g., DOI or PMID) directing users back to the original publication.

### 4. Provenance Architecture & Auditability

The core design principle of Pharmacy Commons is **humans → machines → humans**. Every fact must carry its own provenance so users and automated systems can independently verify clinical claims against primary sources.

* **PCID Identification:** Every pharmaceutical entity is anchored to a stable, 9-block Pharmacy Commons Identifier (e.g., Block 1 for base active moieties, Block 2 for precise salts, Block 4 for commercial formulations).


* **The Single Triple Store:** Relationships are recorded deterministically within the `clinical_statements` table as predicate triples (e.g., `subject_pcid` ──[`predicate`]──> `object_pcid`).


* **Native Citation Metadata:** Every triple is bound to an explicit source record containing the issuing agency or publisher, the source document SetID or accession number, the exact label section or clinical trial PMID, the publication date, and the retrieval timestamp.


* **Surfacing Disagreement:** Where authoritative sources conflict regarding an indication, dosing threshold, or safety classification, Pharmacy Commons records both claims with their respective source citations rather than arbitrarily resolving the discrepancy.


* **Immutable Snapshots and Cryptographic Hashing:** Through `entity_versions` and append-only `entity_changes` tables, the database maintains complete change tracking. Historical snapshots include cryptographic SHA-256 hashes, ensuring that every version of a drug record remains permanent and verifiable.



### 5. Intellectual Property & Takedown Protocol

Pharmacy Commons respects the intellectual property rights of private publishers, scientific societies, and researchers. If an author, institution, or publisher believes that any content, excerpt, or cross-reference indexed within the platform infringes upon their copyright or exceeds legal boundaries of fair use, they may submit an expedited notice for review and removal.

To file a formal notice, email **contact@pharmacycommons.org** with the subject line *"Content Removal Request"* containing the following details:

1. **Identification of the Work:** The title, citation, and specific proprietary material claimed to be infringed.


2. **Location on Platform:** The exact URL, Pharmacy Commons Identifier (PCID), or `clinical_statements` record ID where the material appears.


3. **Proof of Authority:** Clear evidence demonstrating that you are the copyright holder or are legally authorized to act on behalf of the owner.


4. **Contact Details:** Your legal name, title, organization, physical address, email address, and telephone number.


5. **Statement of Good Faith:** A declaration that you have a good-faith belief that the contested use is not authorized by the copyright owner, its agent, or the law.


6. **Statement of Accuracy:** A statement, made under penalty of perjury, that the information in your notice is accurate and that you are authorized to enforce the rights at issue.



Upon receipt of a valid notice, the maintainers will immediately restrict public access to the cited record or statement during evaluation. If an infringement, licensing conflict, or fair-use discrepancy is confirmed, the material will be permanently removed or modified.