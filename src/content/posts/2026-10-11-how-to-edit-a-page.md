---
title: "How to Edit a Page on Pharmacy Commons"
author: Joshua Semock, PharmD
date: 2026-10-11
summary: "A complete guide to the page editor: sections, links, live values, citations, Quick Facts, brand names, renal dosing, review, history and the rules that keep pages safe."
tags: [Pharmacy Commons, Guide, Editing]
draft: true
---

Every page on Pharmacy Commons can be edited by a verified healthcare professional. This guide covers everything the editor can do, from fixing a typo to adding a cited renal dosing table, with examples you can copy.

If you only read one part, read [the five rules](#the-five-rules) at the end.

## Before you start

**Who can edit.** Anyone can read every page without an account. To edit, you need an account with a verified, active NPI. Verify it once from your Account page. The first time you edit, you also choose a public handle.

**How you're credited.** Every change is signed with your handle and the credential listed for your NPI in the NPI Registry, for example `@rxjosh · PharmD`. You can hide the credential and show only your handle. Your NPI number, legal name and email are never shown.

**What happens when you publish.** Most pages update as soon as you publish. A reviewer then checks the change afterwards ("publish, then patrol"), the way Wikipedia works. A small set of high-risk pages are **reviewed** pages: your edit waits for a reviewer before it appears. These include anticoagulants, insulins, sulfonylureas, high-potency opioids, narrow-therapeutic-index drugs, methotrexate and fluorouracil. The editor tells you when you're on one.

**Licence.** Text you write is published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), the same licence as Wikipedia, so it can move between the two with attribution. Structured facts you add, such as Quick Facts values, brands and dosing thresholds, are released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) like the rest of the database.

## Two ways to edit

**Edit a section.** Every section heading has an **edit** link, and so do the lead, Quick Facts and the brand names. It opens just that part of the page. Use it for most edits: it's quicker, and two people editing different sections at the same time never get in each other's way.

**Edit page.** The **Edit page** tab opens the whole page as one text document. Use it when you want to add a new section, move sections around, or make a change that spans several sections.

Both have the same three parts:

- **Source**: the text you edit.
- **Preview**: exactly what the page will look like when you publish.
- **Publish**: saves your change, with a short **edit summary** describing what you changed and why. The summary is required.

Your draft saves itself as you type, so a closed tab or a failed publish never loses your work.

## What a page looks like in the editor

When you open **Edit page** on metformin, the start of the text looks like this:

```
# metformin

:::brands
FORTAMET                # source
Glucophage              # source
GLUCOPHAGE XR           # source
Glumetza                # source
Riomet                  # source
:::

:::infobox
epc_class:              # source: Biguanide
acb_score:              # source: 1
do_not_crush: Extended-release tablets: swallow whole; never crush, cut or chew [@dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f]  # source: Modified-release
qtc_risk:               # source: none
:::

::fda-label-link
::identifiers

Metformin is a biguanide that lowers blood glucose in [[type 2 diabetes]]. …

::hierarchy

::fda-label

## Renal dosing

:::renal-dosing
egfr < 30: contraindicated; stop if eGFR falls below 30 [@dailymed:…]
egfr 30-45: do not start; if already taking, assess the benefit and risk of continuing [@dailymed:…]
:::

## Patient education

- Take it with meals.
```

That one document holds everything on the page. There are five kinds of thing in it:

| What you see | What it is | Can you change it? |
| --- | --- | --- |
| `# metformin` | The page title | No. Ask a reviewer to rename a page. |
| Plain text and `## Headings` | The lead and the sections people write | Yes, freely. |
| `:::name` … `:::` | A **structured block**: facts stored as data | Yes, line by line, with citations. |
| `::name` | A **locked section** that comes from the sources (FDA label, classifications…) | You can move it, but not edit or remove it. |
| `# source: …` after a line | A note showing what the sources say | No. It's only a note. |

## The page layout

Pages keep the same layout everywhere, so readers always know where to look.

**Side column** (left on a computer, at the top on a phone): the jump-to-label link, **Quick Facts** and **Identifiers**. These always stay in the side column, wherever you put them in the text.

**Main column, in this order by default:**

1. **Lead**: the opening paragraphs, with no heading. Everything you write before the first `##` heading is the lead. Say what the drug is and how it's used, in two or three short paragraphs.
2. Drug hierarchy (locked)
3. FDA prescribing information (locked)
4. **Renal dosing** (template section)
5. **Patient education** (template section)
6. Guidelines, Classifications, Lists (locked)
7. **References**, built automatically from your citations (locked)
8. Additional metadata (locked)

You can add your own sections anywhere in the main column, for example `## Mechanism of action`, `## Dosing`, `## Monitoring` or `## Vancomycin dosing calculations`. You can move any section, including the locked ones.

**What can't be removed:** the locked sections and the template sections (Renal dosing and Patient education). If you delete one by mistake, the editor tells you and offers to put it back. Sections that contributors added can be removed by a later edit.

Concept pages (conditions, symptoms, labs, targets, herbals) follow the same idea with fewer parts: lead, "In the knowledge base", Patient education, References and metadata.

## Writing text

The text is Markdown, the same format GitHub, Reddit and many note-taking apps use.

| You write | You get |
| --- | --- |
| `## Monitoring` | A section heading |
| `### Pediatrics` | A subheading inside a section |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~struck~~` | ~~struck~~ |
| `- item` at the start of a line | A bulleted list |
| `1. item` | A numbered list |
| `> quoted text` | A quotation |
| `` `code` `` | Inline code |
| A blank line | A new paragraph |
| `[FDA safety communication](https://www.fda.gov/…)` | A link to another website |
| `---` on its own line | A horizontal rule |

**Tables** use pipes, with a line of dashes under the header:

```
| Product | Start | Maximum |
| --- | --- | --- |
| Immediate-release | 500 mg twice daily | 2,550 mg/day |
| Extended-release | 500 mg once daily | 2,000 mg/day |
```

**Code blocks.** Put three backticks on the lines above and below. Anything inside is shown exactly as typed, which is handy for showing a calculation or a formula.

**Not available:**

- **Single `#` headings.** The title is the only `#` heading; start sections with `##`.
- **Images.** These are turned off for now.
- **Raw HTML** (see below).

## Linking to other pages

Wrap a page name in double square brackets.

| You write | You get |
| --- | --- |
| `[[metformin]]` | A link to the metformin page |
| `[[metformin\|Glucophage]]` | A link to metformin that reads "Glucophage" |
| `[[PCID-1001923]]` | A link by permanent ID, which never breaks |
| `[[type 2 diabetes]]` | A link by page name |

Type `[[` and a list of matching pages appears, so you rarely need to know the exact name. Links match a page's ID, then its address (slug), then its name.

**Red links.** If no page matches yet, the link is shown dashed. Anyone verified can click it to create that page, with the name already filled in. That's how the knowledge base grows: link what *should* exist.

**What links here.** Every page lists the pages that link to it. Your link to `[[lactic acidosis]]` shows up on the lactic acidosis page.

## Showing a live value

Double curly braces pull a value from the database, so the text never goes stale when the data changes.

| You write | You get |
| --- | --- |
| `{{acb_score}}` | This page's ACB score |
| `{{acb_score:amitriptyline}}` | Amitriptyline's ACB score, written on any page |

Keys you can use:

| Key | Value |
| --- | --- |
| `indications` | Indications (from the FDA label) |
| `dosing` | Dosing (from the FDA label) |
| `contraindications` | Contraindications (from the FDA label) |
| `boxed_warning` | Boxed warning (from the FDA label) |
| `epc_class` | FDA pharmacologic class |
| `legal_status` | Legal status (Rx, OTC, controlled schedule) |
| `most_used` | Rank on the most-used drugs in the US list |
| `do_not_crush` | Do-not-crush status and reason |
| `acb_score` | Anticholinergic burden score |
| `qtc_risk` | QT prolongation risk category |

The value shows with its source when you hover over it. If there's no value, it says "not recorded" rather than leaving a blank. Values that come from the FDA label link to the right section of the label.

## Citing sources

Put a citation in square brackets with `@`, straight after the sentence it supports:

```
Metformin can lower vitamin B12 levels.[@pmid:26900641]
```

| Kind | Write | Example |
| --- | --- | --- |
| PubMed article | `[@pmid:number]` | `[@pmid:26900641]` |
| Anything with a DOI | `[@doi:10.…]` | `[@doi:10.2337/dc25-S009]` |
| FDA label on DailyMed | `[@dailymed:set id]` | `[@dailymed:1ed9dde4-339c-486f-a346-dde33a5e493f]` |
| Any web page | `[@url:https://…]` | `[@url:https://www.fda.gov/drugs/…]` |
| A reference already on the site | `[@short-name]` | `[@ada-soc-2025]` |

To cite several sources at once, write `[@pmid:111; @pmid:222]` or put brackets side by side: `[@pmid:111][@pmid:222]`.

You never need to set up a reference first. Pharmacy Commons looks up the PMID, DOI or DailyMed label when you publish and fills in the title, authors and journal. Every citation becomes a numbered note, collected in the **References** section at the bottom of the page.

**Finding the DailyMed set id.** Open the label on [DailyMed](https://dailymed.nlm.nih.gov/). The set id is the `setid=` part of the address. Type `[@` in the editor to search PubMed and DailyMed without leaving the page.

**When a citation is required:**

- **Always:** every line in a structured block that you change or add.
- **For prose:** cite anything a colleague could reasonably question, such as doses, thresholds, frequencies, study results, and "first-line" or "avoid" statements. Uncited clinical claims are the first thing reviewers check.

## Quick Facts

Quick Facts is the box in the side column. In the editor it's the `:::infobox` block, one fact per line:

```
:::infobox
acb_score:              # source: 1
do_not_crush: Extended-release tablets: swallow whole [@dailymed:…]  # source: Modified-release
qtc_risk:               # source: none
:::
```

- **Leave a value blank to use the source.** The `# source:` note shows what the source says. Blank lines store nothing, so when the source updates, the page updates too.
- **Type a value to correct the source.** Your value replaces the source on this page and must have a citation. The page shows your value with its citation and a small "community" mark, and the source value stays one tap away. Disagreements are shown, never hidden.
- **Write `[NONE]` to say "the source is wrong and there is no value."** It must be the whole value, in capitals, with a citation:

```
qtc_risk: [NONE] [@pmid:…]
```

Only the exact `[NONE]` counts. Writing `none`, `None known` or `no QT risk` is treated as ordinary text, so you can never wipe a value by accident.

- **Use only the keys listed.** If you type a key that doesn't exist, the editor suggests the nearest one, or points you to the right block. Typing `kidney_warning:`, for example, sends you to Renal dosing.
- **The full list of keys** is the same as for live values above. The editor shows them in its side panel too.

## Brand names

The brand names under the page title are the `:::brands` block:

```
:::brands
Glucophage              # source
Riomet                  # source
Newbrand [@dailymed:…]
~~Wrongname~~ [@url:https://…] not a metformin product
:::
```

| You want to | Write |
| --- | --- |
| Keep a brand from the sources | Leave its line as it is |
| Add a brand the sources are missing | `Name [@citation]` |
| Mark a source brand as wrong | `~~Name~~ [@citation] short reason` |

You can't delete a source brand. Strike it through instead: it stays listed with a line through it and your reason, so readers can see why.

## Renal dosing

Renal dosing lives under `## Renal dosing` in a `:::renal-dosing` block. Write one kidney-function range per line, then a colon, then what to do:

```
:::renal-dosing
egfr < 30: contraindicated [@dailymed:…]
egfr 30-45: do not start; if already taking, assess the benefit and risk of continuing [@dailymed:…]
egfr >= 45: no dose adjustment [@dailymed:…]
crcl < 10: avoid [@pmid:…]
dialysis: not removed by hemodialysis; give after the session [@pmid:…]
:::
```

**Measures:**

| Measure | Unit |
| --- | --- |
| `egfr` | mL/min/1.73 m² |
| `crcl` | mL/min (Cockcroft-Gault) |
| `dialysis` | Takes no number: patients on dialysis |

**Ranges:**

| Write | Means |
| --- | --- |
| `< 30` | below 30 |
| `<= 30` or `≤ 30` | 30 or below |
| `30-45`, `30–45` or `30 to 45` | from 30 up to (not including) 45 |
| `>= 45` or `≥ 45` | 45 or above |
| `> 45` | above 45 |

**Rules:**

- Every line needs a citation.
- Ranges for the same measure can't overlap. `egfr < 30` and `egfr 30-45` are fine because they meet at 30. `egfr < 45` and `egfr 30-60` overlap, and the editor says which line it clashes with.
- You can mix measures, for example eGFR lines from the label and CrCl lines from a dosing reference, as long as each measure's own ranges don't overlap.
- Put anything that isn't a simple range, such as contrast instructions or dialysis timing details, as text under the block, with its own citation.

Because these lines are stored as data rather than text, they can be searched across every drug ("what's contraindicated below eGFR 30?") and served through the API.

## Patient education

`## Patient education` is on every page. Write plain-language counselling points the way you'd say them at the counter: short sentences, everyday words, and what to do rather than why.

```
## Patient education

- Take it with meals. Diarrhea and nausea are common at first; starting low helps.
- Swallow extended-release tablets whole. Don't crush, cut or chew them.
- Get medical help right away if you feel very weak, have trouble breathing or have unusual muscle pain.
```

Cite where the points came from. The FDA patient information or Medication Guide is a good source for this.

## Things the editor won't accept, and what to write instead

**Raw HTML.** Pasting HTML is refused, with a message showing the Markdown to use instead:

| Instead of | Write |
| --- | --- |
| `<b>`, `<strong>` | `**bold**` |
| `<i>`, `<em>` | `*italic*` |
| `<br>` | a blank line |
| `<a href="…">` | `[text](https://…)` or `[[page]]` |
| `<table>` | a Markdown table with `\|` |
| `<sup>`, `<sub>` | plain text (mg/m2, CO2); citations use `[@key]` |
| `<!-- comment -->` | a note in your edit summary |

A plain `<` is fine: `eGFR <30` and `a < b` work as you'd expect. HTML inside backticks is fine too, because it's shown as code.

**Everything else is checked as you type**, with the problem underlined and explained on the line. Publish stays greyed out until every error is fixed. The most common errors are:

| Message | Fix |
| --- | --- |
| Needs a citation | Add `[@pmid:…]`, `[@dailymed:…]` or `[@url:…]` to the line |
| Unknown key / unknown block | Pick the suggested name from the side panel |
| Can't be removed | Put the section back; you can move it instead |
| Ranges overlap | Adjust one of the two lines it names |
| The title can't be changed | Leave `# Title` as it is; ask a reviewer to rename |
| Start a section with `## Heading` | Text after a locked section needs a heading above it |
| `[NONE]` must be the whole value | Write `key: [NONE] [@…]` and nothing else |

**Warnings** (in a softer colour) don't block publishing. For example, "this is the same as the source value" means you can leave the line blank.

## The side panel

While you type, the panel beside the editor (a drawer on a phone) shows what you can write where the cursor is:

- **In Quick Facts:** every key, its current source value, and `[NONE]`.
- **In Renal dosing:** the line forms and the units.
- **In a section:** link, value and citation syntax.
- **Between sections:** the locked sections you can place, and how to start a new one.

Click any entry to insert it. Autocomplete works the same way: type `[[` for pages, `{{` for value keys, `[@` for references, and `:::` or `::` for block and section names.

## If someone else is editing too

The edits are merged section by section:

- If someone published a change to a **different** section while you were editing, your change is merged in and both are kept. Nothing to do.
- If they changed the **same** section, the editor shows your version next to theirs and keeps your draft. Combine the two, then publish.
- Two people correcting **different** Quick Facts lines at the same time never conflict.

## Starting a new page

From the **Topics** page, choose **Create a page**, or click any red link. Pick what kind of page it is:

| Group | Kinds |
| --- | --- |
| Drugs and supplements | single active ingredient · salt or ester form · combination product · branded product · dietary supplement (a defined chemical) · herbal or biological source |
| Classifications | drug class or category |
| Clinical concepts | disease or condition · symptom · adverse effect · contraindication · risk factor |
| Terminology | anatomy · physiologic process · organism · procedure or therapy · dosage form · route of administration · other medical term |
| Labs and biology | lab test or measurement · biological target |

As you type the name, the form shows existing pages that match, so you don't create a duplicate. For drugs you can add a UNII or CAS number, which catches duplicates under other names. Each new page gets a permanent PCID straight away and starts from the standard layout for its kind.

## History, reverting and review

- **History** (the tab beside Edit page) lists every change, with author, summary and size. Click any two versions to see exactly what changed, including each structured line ("acb_score: blank → 2").
- **Restore** puts back an earlier version of the page, or of a single section. Anyone verified can restore. Restoring a version marks the undone edits as reverted.
- **Reviewers** check new edits and new pages from the review queue. On reviewed pages they accept or reject held edits. A rejection always comes with a note, which you can see under **My contributions** on your Account page.
- **Limits:** 60 publishes an hour and 20 new pages a day, to slow down vandalism. Reviewers are exempt.

## The five rules

1. **Cite it.** Every structured line needs a citation, and so does every clinical claim a colleague might question.
2. **Correct, don't erase.** Leave source values blank to use them. Write over them with a citation to correct them, or `[NONE]` with a citation if there should be no value. Strike through wrong brands rather than deleting them.
3. **Write for the next pharmacist.** Lead first and plain, details in sections, patient points in plain language.
4. **Link generously.** `[[ ]]` every drug, condition and lab you mention. Red links are invitations.
5. **Summarise your edit.** One line saying what you changed and why helps reviewers, and helps you when you look back at the history.

Questions, or something the editor won't let you do? Say so in your edit summary, or email [contact@pharmacycommons.org](mailto:contact@pharmacycommons.org).
