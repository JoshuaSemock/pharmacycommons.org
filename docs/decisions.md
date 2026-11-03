# Pharmacy Commons — Decisions Log

> Joshua's stated decisions, by feature, carried over from the previous Claude Project's memory on 2026-11-02.
> Dates are when the decision was stated. Where a later decision replaced an earlier one, both are shown and the later one marked as current.
> This file records **what Joshua decided**. Build status lives in `ROADMAP.md` and `CLAUDE.md`; check there before assuming something shipped.
> Add new decisions here as they're made, with a date.

## Contents

1. [Project direction](#project-direction)
2. [Data, licensing and cleanup](#data-licensing-and-cleanup)
3. [Public API and Developers page](#public-api-and-developers-page)
4. [Drug pages](#drug-pages)
5. [Community editing](#community-editing)
6. [Lists](#lists)
7. [Learn and education](#learn-and-education)
8. [Tools](#tools)
9. [Accounts and comments](#accounts-and-comments)
10. [Design and UI](#design-and-ui)
11. [Reference sources](#reference-sources)
12. [Open questions Joshua is still weighing](#open-questions-joshua-is-still-weighing)

---

## Project direction

**Knowledge model / classification (2026-10-20)**
- Pharmacy Commons is developing its own pharmaceutical-science classification system. Its purpose is to build understanding along the chain: molecular origin → chemical structure → target interaction → pharmacological action → physiological effect (therapeutic and adverse) → therapeutic use → area of medicine.
- It should help find the best therapy for a use case, including off-target and off-label uses (e.g. propranolol or hydroxyzine for anxiety, GLP-1 agonists for depression).
- It should also optimize pharmacotherapy for personalized medicine, using everything the site holds (lists, adverse effects, drug interactions, disease-state interactions, labs such as renal clearance, classifications, guideline recommendations) to suggest changes for environmental favorability, cost, effectiveness, reducing adverse effects and prescribing cascades, and avoiding Beers criteria, QT-list and ACB risks.
- Target use cases: a prescriber wants a non-formulary drug the patient can't afford → best alternatives; first-line therapy isn't working (e.g. metformin in a patient with obesity → GLP-1); a psychiatric patient failing several medications → could another drug in the same class help.

**PharmacopeAi (2026-10-27)**
- Planned AI product for Pharmacy Commons: a RAG system on Postgres in Supabase, using data such as FDA labels.

## Data, licensing and cleanup

**Licensing**
- Content authored by Pharmacy Commons is CC0 1.0 (2026-09-24); third-party fields keep their source license. Code is GPL-3.0-or-later.
- CAS Common Chemistry is CC BY-NC 4.0. Joshua wants to work through the non-commercial question before any CAS backfill, possibly by not using other CAS information.
- USPTO trademark filing: low priority; Joshua decides timing.

**Non-core moiety rows**
- Earlier intent: salts get a non-salt version (quinine hydrochloride → quinine); formulations get a non-formulation version (lactated Ringer's solution → lactated Ringer's); combination/category text rows become a note (legal status / alternative scheduling) on the drug moiety they reference.
- 2026-10-21: chose to hide them from search only (keep rows, PCIDs, list entries); a retire-and-delete run was cancelled.
- **Current (2026-10-30):** after reviewing the 137 rows, chose to delete the junk statute-text row, relabel mislabeled single compounds to Core moiety, merge salts and brand products into their generic moiety, and merge silver sulfadiazine cream into silver sulfadiazine. Applied as phase 25a. The 69 rows left non-core by design are still to be hidden from search (the 2026-10-21 hide-only choice applies to them).

**Other cleanup (2026-10-30)**
- Approved dropping `moieties.class_pcid` / `class_name` (phase 13c, applied).
- Shelved the empty `physiochemical` table for future projects.
- Keep images out of Git LFS; drop `oxfmt`; log the phase 23/24 mint batches.
- Approved deleting dead files (old class pages, legacy HTML/SVG, `.md/`).

**Priorities**
- High: remaining non-core moieties, `needs_manual_review` (157 rows), `Unclassified_Holding` (634 rows). Higher still: `merge_candidates.csv` and `_unresolved_merges.csv`.
- Low: the 65 FDA duplicate pairs, the 27 mixed-ingredient brand lines, the USPTO filing.
- Wants a spreadsheet to work through `Unclassified_Holding` and `needs_manual_review`.

## Public API and Developers page

- 2026-09-28: serve the public API at `pharmacycommons.org/api` through a Cloudflare proxy in front of GitHub Pages (chosen over a static export); DNS moved from Porkbun to Cloudflare. (Live 2026-10-30.)
- Wants a Developers page (`/developers`) with an API playground usable by both software engineers and non-programmers.

## Drug pages

**One-line descriptions (2026-10-04)**
- One line per drug, written by Joshua by hand; also editable by any verified user (see Community editing).
- Stored in `moieties.description_text` (moieties only), replacing `class_pcid`; no length rule.
- Joshua writes them in a spreadsheet and Claude loads them into Supabase.
- Shown under the drug name; if blank or "Unassigned", show nothing.

**Legal status line in Quick facts (2026-11-01)**
- Always a single line. Allowed values: CS schedules, Legend, OTC, Supplement, etc.
- Legend means Rx only (lisinopril → "Legend"); a drug also sold OTC shows "Legend and OTC" (ibuprofen).
- FDA marketing status (e.g. "Discontinued") must not appear there.

**Look-alike/sound-alike names (2026-11-02)**
- LASA list from Joshua's TallMan.xlsx (which names each drug is confused with, and whether it has Tall Man lettering), linked to PCIDs and shown in each drug page's Quick facts box.

**REMS products (2026-11-03)**
- New list from REMS_Products.csv: one row per generic moiety, affected brand names alongside, with Active and Inactive sublists.
- Each drug page's Quick facts box gets a REMS row (programs, status, elements, brands).
- Combination products list the REMS-driving moiety only, unless the REMS covers both components.

## Community editing

**Page layout**
- Order: header → jump-to-FDA-label link → Quick facts → open markdown section → uneditable sections (classification, lists, etc.). Keep the current section order and the rail/main-column split.
- Header: drug name permanent; brand names editable.
- Quick facts is the infobox and is fully editable. Text can pull a property live, e.g. `{ACB_score:metformin}`.
- Open section is Wikipedia-style: users add paragraphs and their own headings. The description/Overview is its lead section; the old Overview editor folds into the full-page editor.
- FDA label text stays locked. Classification and identifiers accept cited overrides shown beside the source. Renaming a page is reviewer-only. Contributors can reorder sections but not delete them.

**Editing model**
- Publish, then patrol (Wikipedia style), not pre-moderation.
- Wikipedia-style full-page edit view (whole page as source, preview, publish), starting from the existing page template.
- Content architecture: hybrid, leaning database-first (the database is canonical).
- Prose citations use structured `[@key]` syntax backed by a references table. Prose stays separate from structured facts but traceable.
- Build structured block templates now.
- One view for everyone; patient education goes in its own page sections.
- Page protections: only the initial high-alert/NTI list (no chemotherapy rule beyond methotrexate and fluorouracil).
- Community-prose license choice was left to Claude.

**User-created pages**
- Any page type in v1, including drugs. Types include drug, dietary supplement, herbal therapy, symptom, indication, adverse effect, classification (e.g. psychedelics) and a misc terminology category (e.g. lungs). The system mints the PCID from the right block.
- Wiki-style links between pages, resolved by slug or page name.
- "Create a page" lives on the Topics page (abbreviations there offer it too), not the account page.
- Pages whose name has a known acronym show it after the title (e.g. HACE).

**Administration (2026-10-27)**
- Joshua's own account is the head administrator ("owner"): it can review its own edits and pages without a second account, and the admin page is easy to reach from Account.

## Lists

- Lists are separate from drug classes and have their own page.
- All lists are public; users can create and edit lists. Only current editions are shown publicly.
- Sortable and filterable by rank, number and alphabetically.
- Lists may hold plain terms with no PCID (e.g. Do Not Use abbreviations).
- Scrapped every list sourced from UWorld RxPrep and McGraw Hill.
- Kept or added:
  - Joshua's Notable Drugs list (+17 category sub-lists).
  - MEPS "most patients per year", built from raw MEPS data as a 5-year average.
  - Drugs Which Affect Risk of Arrhythmias (Joshua's compilation) with Brugada and Long QT sub-lists; the low/absent-risk sub-list dropped; drug-specific references only.
  - Anticholinergic Burden: one list with score 1/2/3 sub-lists, score shown per entry, brands folded to generics (mint a PCID if the generic lacks one). Sources include the Anticholinergic Cognitive Burden Scale 2012 (Aging Brain Program, Indiana University).
  - Federal Controlled Substances (DEA Orange Book alphabetical list), replacing the old MPJE-relevant list. High/Medium/Low Importance replaces the MPJE relevance metric. Sub-lists by schedule group (All, C2, C3–5, C2–5) crossed with Importance, loaded as Lists. Minting PCIDs approved for all importance levels.
  - Look-Alike/Sound-Alike names (see Drug pages).
- Georgia MPJE lists removed from the site (2026-10-30).
- Planned later: authority lists (NIOSH, Beers, ISMP).

## Learn and education

**Learn (2026-10-27)**
- Built as a complete free feature for now, using what's already in Supabase.
- In-app admin review page (approve/flag/reject items, publish collections) instead of CSV audits.
- Personal study sets are public. LLM-drafted items are allowed. Keep the ported FSRS scheduler rather than the library.
- ACB and Joint Commission third-party licensing flags acknowledged but open.
- Privacy policy updated for study data. All seven official collections published.

**Funding ideas (not decided)**
- Shape the site into an educational tool for pharmacists and students (NAPLEX, board specialty, MPJE) and fund it through test prep and CE/CME content, without outside funding.
- Possible model: testing material free on the web, nominal fee for the app; paid content free on a "scholarship" request.
- Price anchors from Joshua's experience: about $50 for 6 months of a NAPLEX app; $100–200 for MPJE practice exams.

## Tools

**Medication Reconciliation**
- Under the Tools tab; one version for clinicians, patients and students (no toggle).
- Data stays in the browser; save/reload as CSV; PDF export too.
- No sig shorthand or abbreviations anywhere; follow the ISMP do-not-use list.
- Allergies: what, reaction, severity (changed medication, ER visit, EpiPen), with dropdowns plus Other.
- Sig builder verbs include apply, instill, inhale, etc. Covers Rx, OTC, supplements, herbals, alternative medicines, caffeine, nicotine, alcohol and recreational substances.
- Medication list is a table with one column per aspect; the sig is its own column.
- Clinical lists (Anticholinergic Burden summed, QTc risk, Do Not Crush) feed flags, table markers and the printable list; non-clinical lists are excluded; the registry is extensible.

**Days Supply / Quantity Dispense** (ScriptCalc is the reference)
- Takes a sig and returns the quantity for a target days supply (28, 30, 60, 84, 90; "81" meant 84). Accounts for package sizes, PRN maximum daily use and rounding days down. Eye drops use drops/mL that differ between manufacturer and payer (e.g. 20 vs 16), with laterality.
- Sig comes from the med rec structured builder, plus an optional paste-directions helper that fills the builder.
- Manufacturer and payer values entered side by side each time (no stored payer profiles).
- Includes injectables such as GLP-1s, tapers/dose step-ups, and a topical fingertip-unit estimate. Audience: everyone, mostly pharmacy.
- Refill badges are flat ink stamps (no color); the refill calendar shows only run-out / next fill date.
- Curated packaging facts for all inhalers, insulins, injectables, eye drops and ear drops; the package picker is a dropdown of known products, not a search. FDA label text saved in Supabase is the source for those facts. Priming isn't a priority. NDC package lookup deferred.

**Medical Dictionary** (`/tools/dictionary`)
- Downloadable Word `.dic` of medical terms, abbreviations and drug/brand names from Joshua's Dictionary.xlsx, with definitions on the web view. The `.dic` includes every term, Do Not Use abbreviations too.
- Unmatched drug terms link to existing records; mint PCIDs only for genuinely new substances and brand generics.
- Joint Commission "Do Not Use" list: TJC's official set, plus DOR/TAF/TDF shown separately as ISMP additions.

## Accounts and comments

**Sign-up**
- Choose patient, practitioner or researcher; practitioners can enter an NPI.
- Mandatory age check: 18 or older.
- Other common onboarding fields as options (phone, address, ZIP, etc.).

**Blog comments (2026-10-12)**
- Any signed-in account may comment (not just NPI-verified users).
- Publish, then patrol; one level of replies.

## Design and UI

**Letterpress look**
- Colorless, photorealistic letterpress: elements stamped from the paper, depth from light and shadow only. No colored rims, fills or outlines anywhere; no colored focus outlines; no text shadows.
- Anything clickable is embossed and debosses on hover; fields being typed in stay debossed; non-clickable labels and stamps are flat (no embossing, no color). Behavior is central so every page acts the same.
- No bold text on embossed or debossed elements.
- Nav: home, search, Browse/Lists/Tools embossed, debossed on hover and on their own page; "Signed In" debossed; "Log in / Register" embossed; hamburger embossed, debossed when open, animating into an X. Nav bar and dropdowns carry the paper grain; all dropdowns stay colorless.
- Browse: drug cards embossed (deboss on hover); selected A–Z letter debossed; page-size dropdown embossed, debossed while open.
- Sans-serif only; same letter spacing everywhere. Old color-scheme names (sage, aqua, etc.) removed from styling docs.

**Color exceptions**
- Mint foil `#62d6b2` for focused search bars (overlaid so paper shows through), selected text, scrollbars and small accents. Focused search fill later moved to mint-200 `#a1f6d8`.
- Lichen background hue-shifted toward the mint, kept high-resolution; proposed serving two center-cropped columns as side flanks.
- Some home-page cards in pastel brand colors (mint, hepatica, salmon only): 100 shade at rest, deeper 200 shade on hover/deboss (e.g. `#fcb9ab` → `#ffa08d`).

**Mobile (2026-10-18)**
- Thumb-zone layout with the nav bar at the bottom on phones. Slots left to right: Tools, search, centered logo (home), hamburger, account, with small labels under the icons. Approved as built (PR #96).
- Fix layout problems such as overflow centrally, not page by page.

## Reference sources

- Medscape (reference.medscape.com/drugs): a scraper exports one row per drug to Excel. **Reference only — never uploaded to the Pharmacy Commons database.**

## Open questions Joshua is still weighing

- **Site scope (2026-11-02):** whether Wikipedia-style open editing conflicts with building a pgvector-embedded database, since editable pages don't fold into the database neatly.
- Whether raw HTML in page text is rejected or stripped on save.
- The CAS non-commercial license question.
- Paid tier / app model for education content.
