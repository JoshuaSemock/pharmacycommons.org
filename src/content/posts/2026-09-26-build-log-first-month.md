---
title: "Build Log: From Twelve Mock Drugs to 31,306 Records"
author: Joshua Semock, PharmD
date: 2026-09-26
summary: "How Pharmacy Commons went from a prototype to a versioned, machine-readable drug knowledge base in September 2026, and what shipped this week: lists, FDA product linking, and a faster site."
tags: [Pharmacy Commons,Build Log]
---
**September 26th, 2026
Joshua Semock, PharmD · pharmacycommons.org**

This is the first build log for Pharmacy Commons. It covers the month from the first prototype to today: what we built, what we threw away, and what's still open. The [founding essay](/blog/This-is-Our-Commons) explains why the project exists. This post is about how it is being built.

## The rule everything follows

One principle shapes every decision: **humans → machines → humans.** Every drug record should have a page a person can read, a stable address, a permanent identifier, a structured JSON version a program can read, its sources, and a history of every change. The website is one way into that knowledge, not the place where it is locked up. And when two public sources disagree, the site shows the disagreement instead of quietly picking a winner.

## Early September: a prototype, then a restart

The first version was a design scaffold (React, Vite and Tailwind) showing twelve made-up drugs from a static file. Next came a real database in Supabase (PostgreSQL) holding 23 test drugs, including metformin, sertraline, lisinopril and a few combinations like Augmentin, along with an API layer and a set of tests.

A lot of that first pass did not survive. The first drug identifier was a hash of the drug's name. That breaks the moment a name is corrected, so we dropped it, along with two other identifier schemes that came after it. The lesson stuck: **an identifier has to outlive every fact attached to it.**

## September 19: the real foundation

Around the 19th the project was rebuilt on a formal schema and loaded from my master workbook.

- **The PCID.** Every entity gets a Pharmacy Commons Identifier, allocated from numbered blocks: active moieties in 1,000,001 and up, combination products in 2,000,001, salts and esters in 3,000,001, marketed formulations in 4,000,001, pharmacologic classes in 5,000,001, and so on. PCIDs are never reused. CAS numbers, UNIIs, NDCs, RxCUIs and ATC codes are stored as attributes, never as keys, because each of them belongs to someone else's system.
- **Clinical statements** are stored as subject–predicate–object triples ("metformin — has indication — type 2 diabetes") with the evidence level and source attached, using a controlled list of predicates.
- **One write path.** Changes from users go into a review queue and only reach the live record once approved. Row-level security is on for every table.

The site then switched from the static catalog to live data. Search was also narrowed: typing "metformin" used to return every salt, brand and combination as a separate hit. Now search returns the moiety, and everything related to it is nested on the moiety's page.

The same week I ran the first batch dispatch of unclassified workbook rows. It minted 702 new moieties, correctly kept 14 stereoisomers and salts separate instead of merging them, held 157 rows for my review, and parked 634 rows that had no identifiers to go on. The takeaway: **check for collisions and in-batch duplicates before minting anything**, and use UNII and CAS to tell a true duplicate from a distinct stereoisomer or salt.

## September 22–23: labels, brands, classes and the API

- **Label text.** 52,571 DailyMed label documents and 2.33 million sections are indexed. The readable text of a section is fetched from openFDA the first time someone asks for it and cached after that. Each drug page ranks its labels, preferring single-ingredient, PLR-format and manufacturer labels over repackagers.
- **Brand names** come from Drugs@FDA and RxNorm (12,417 RxNorm brand rows). Single-ingredient brands attach to the moiety and multi-ingredient brands to the matching combination.
- **Drug classes** from RxClass, ClassyFire and ChemOnt: 4,981 classes and about 242,000 memberships, each with its own page under [/classes](/classes).
- **A public, machine-readable API.** This is the part I'm proudest of. One database function builds the document for a PCID, and both the website and the API read from it, so they can't drift apart. Each record is available as JSON and JSON-LD, with a schema, version snapshots and a field-level change log.
- **Permanent addresses.** `/id/PCID-n` always redirects to a record's current page. A retired PCID answers "gone" instead of pointing somewhere new.

A creatinine clearance calculator, 14 clinical guidelines and this blog went up around the same time.

## This week (September 24–26)

**Lists.** Lists are collections of drugs made for a purpose, such as studying for an exam or seeing what is most prescribed. They are separate from pharmacologic classes, each list gets its own PCID, and they live at [/lists](/lists). Thirty lists are live, with 8,760 entries:

- **Most used drugs in the US.** Patients per year from AHRQ's Medical Expenditure Panel Survey, averaged over 2019–2023 (247 drugs).
- **Notable Drugs**, my own ranked list of 1,093 drugs, with 17 category sub-lists.
- **Georgia MPJE.** Legend drugs, controlled substances (cited to the Georgia Controlled Substances Act, O.C.G.A. §§ 16-13-25 to 16-13-29) and exceptions, plus a parent list that combines all three.
- **Do Not Crush.** 226 entries with sub-lists by reason (modified-release, transmucosal, irritant, unpleasant taste, hazardous/teratogenic, other). Each entry notes the specific brands and dosage forms it applies to and which other references also list it.

Every list can be sorted by rank, value, name or status, cut to a top N, filtered, and downloaded as a CSV with PCIDs. Up to three lists can be compared side by side. Each drug page now shows the lists that drug appears on, including when it's on a list only through a combination ("as hydrocodone/acetaminophen").

Loading the lists meant matching about 3,150 names as they were written in the sources to existing records. Most matched exactly. The rest went through typo fixes, synonym and salt matching, or ingredient matching for combinations. That turned up a handful of real gaps, such as the vaccine antigens used in titer testing and several inhaler combinations, and 27 new PCIDs were minted to fill them.

**FDA products are now linked.** Until this week, 12,261 FDA products and 6,372 applications sat in the database without being connected to any drug. Now 10,631 products (87%) and 5,161 applications are linked to a PCID, and 6,443 new "has component" statements connect formulations to their moieties. So metformin's page can finally reach Glucophage and Janumet, and metoprolol's can reach Toprol-XL and Lopressor. Where FDA's "active moiety" differs from how a pharmacist would record the drug, both answers are stored side by side, in keeping with the rule above.

**A faster, more findable site.** A performance pass following PageSpeed and Search Console findings:

- Pages now load only the code they need.
- The background texture is served as WebP.
- A 1 MB app icon is now 6 KB.
- The drug catalog loads when you start typing instead of on arrival.

In local Lighthouse runs, mobile performance went from 59 to about 90 and accessibility from 93 to 100. The site also now has a sitemap (readable in a browser, and linked in the footer), a `robots.txt`, structured data for search engines, an `llms.txt` for AI agents, and real page titles on deep links. "Citations" is now [References](/references), and [Resources](/resources) is a curated set of outside links: guidelines, trial registries, other drug lists, and reporting and disposal resources.

## By the numbers (checked against the live database today)

| | Sept 24 | Sept 26 |
| --- | --- | --- |
| Entities with a PCID | 31,248 | 31,306 |
| Clinical statements | 252 | 6,695 |
| Moiety hierarchy links | 5,076 | 11,546 |
| FDA products linked to a PCID | 0 | 10,631 |
| Lists / list entries | 0 | 30 / 8,760 |
| Recorded field-level changes | 0 | 12,972 |

## What's next

1. **Show the FDA links on the page.** The data is linked, but drug pages don't yet have a "Products & approvals" card.
2. **Put lists in the API.** List pages don't have machine-readable panels yet.
3. **Chemical structures.** SMILES, InChI and formula for every record that has a CAS number.
4. **Environmental risk.** An ECOTOX loader, plus a published definition of how the risk quotients are calculated before any number goes on a page.
5. **Community editing.** A moderator review screen for the contribution queue, and community-made lists.
6. **The API on this domain,** with the data license in its metadata, bulk exports and a published schema.

Everything above traces back to public data: FDA, NLM, NIH, AHRQ and WHO. The goal hasn't changed: knowledge the public already paid for, organized so that people and machines can both use it, with the sources showing.
