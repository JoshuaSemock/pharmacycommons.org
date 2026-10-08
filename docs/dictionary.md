# Medical dictionary for Word (`/tools/dictionary`)

Shipped 2026-10-03 (phase 14). A custom dictionary file for Microsoft Word, plus the
dictionary itself as a browsable A–Z page, plus The Joint Commission "Do Not Use" list.

## Pieces

| Piece | Where |
| --- | --- |
| Source | Joshua's `Dictionary.xlsx` (53,929 rows: ID, PCID, Letter, Terminology, Definition, Abbreviation or Term, Types, Do Not Use flag) |
| Cleaning | `scripts/dictionary_clean.py` → `db/data/dictionary_2026-10-03.json` (trims whitespace, repairs mojibake such as `ãžâ±` → α and `â€™` → ’, computes `bucket` and `sort_key`) |
| Table | `public.dictionary_terms` — one row per source row; `member_pcid` links drug and brand names to their record |
| `.dic` text | `dictionary_words()` / `dictionary_dic()` (SQL, security invoker) |
| Letter counts | `dictionary_buckets()` |
| Do Not Use list | `lists` PCID **10000038**, slug `joint-commission-do-not-use`, 19 term items (`list_items.term_id`) |
| Page | `src/tools/Dictionary.tsx`; helpers `src/dictionary.ts` (tests `src/dictionary.test.ts`) |
| Shared pieces | `src/components/CharacterIndex.tsx` (moved out of `SearchView.tsx`), `src/components/DrugPreviewLink.tsx` |
| SQL mirror | `db/phase14_dictionary.sql` |

## The `.dic` file

- Built in the database on each download, so edits to `dictionary_terms` show up without a deploy.
- Word checks spelling one word at a time and breaks words at spaces, slashes, brackets, commas,
  semicolons and colons, so terms are split on all of those (phase 14f; before that, chemical names
  produced ~4,400 unusable fragments such as `di(4`). Hyphenated words are included whole and in
  parts. Surrounding quotes are trimmed; a lone trailing period is dropped (`q.d.` keeps its periods).
  Words are 2–64 characters and contain a letter.
- An all-lower-case word already covers its Capitalised and UPPER-CASE forms in Word, so other case
  variants are dropped when a lower-case one exists.
- CRLF line endings, saved as **UTF-8 with a byte-order mark** (the plan asked for UTF-8; the BOM is
  what lets Word recognise the encoding of non-ASCII words such as α-methylfentanyl). A UTF-16 LE
  link sits beside the main button because that is the encoding Word writes its own dictionaries in;
  use it if accented letters come out wrong on an older Word.
- 2026-10-03 (after 14f): 42,893 words, about 515 KB. Checked as the anon role: all 53,928 terms
  readable, 41 letter buckets, `dictionary_dic()` returns the full text, the Do Not Use list stays hidden until published.
- **Every row goes in, including the Do Not Use abbreviations** (Joshua's call, 2026-10-03). Word will
  therefore not underline QD, IU, U and the rest; the page says so under the Do Not Use list.
  `dictionary_terms.in_dic` exists if that changes: set it false on the rows to leave out.

## PCID linking (2026-10-03)

| How | Rows |
| --- | --- |
| PCID given in the workbook (all 33,016 matched an existing entity; brand rows point at their generic) | 33,016 |
| Brand → generic through "The brand drug form of X" (exact name, salt-stripped ingredient set, or a hand-checked map) | 788 |
| Generic row matched through its definition | 3 |
| Word pieces linked to the one record they belong to (detemir → insulin detemir), and hand-checked synonyms/abbreviations/misspellings (Cortisol, Apap, Lido, Midozalam …) | 210 |
| Left unlinked on purpose: words shared by many records (lactobacillus, bismuth, botulinum, edetate …) and FDA-name fragments ("Sulfate-Dexamethasone") | 37 |

**Minted** (Joshua approved after review): 60 moieties 1015621–1015680 and 120 combinations
2002471–2002590 — the generics of brands that had no record, plus 18 new substances. Seven in-batch
duplicates were merged first. `primary_source = 'Pharmacy Commons dictionary import 2026-10-03 (Dictionary.xlsx)'`.

## The Joint Commission "Do Not Use" list

- Official set, verified against The Joint Commission's Standards FAQ (last updated 2026-04-21):
  U, u · IU · Q.D., QD, q.d., qd · Q.O.D., QOD, q.o.d., qod · trailing zero · lack of leading zero · MS · MSO4 · MgSO4.
- The workbook's own flag differed: it marked DOR, TAF and TDF (ISMP error-prone abbreviations) and
  missed MS and MgSO4. Joshua chose **official list + ISMP extras**: DOR, TAF, TDF are on the list with
  `legal_status = 'ISMP addition'` and shown separately on the page.
- `list_items` can now hold terms that are not drug records (`member_pcid` null, `term_id` set);
  `get_list` returns them with `pcid`/`slug` null and `entity_type = 'term'`. List pages, Compare and
  CSV handle them. A list made only of terms (`isTermList` in `src/lists.ts`) says "entries" instead of
  "drugs", shows each entry's note, and exports an `entry` and `note` column; the Lists index learns
  which lists hold terms from `list_term_counts()` (phase 14g). Every list's status filter, column
  and sort now use `lists.status_label` ("Source", "Risk", "Reason", "Schedule") when set.

## Differences from the original plan

- **No `[[pc:moiety:…]]` markup renderer exists in the codebase**, so drug names render with
  `DrugPreviewLink` (link to `/id/PCID-n`, card on hover/focus) rather than through wiki markup.
- **Indications are not in the hover card**: the database has no structured indications (3 `treats`
  triples); they live only in FDA label text, which is too heavy to fetch on hover. The card shows the
  record type, PCID, one-line description and classes (FDA EPC/MOA first).
- There is no `btn-primary` class; the download uses the letterpress `Button` (the design system is colorless).

## On /topics (2026-10-07)

`/topics` has two "From the dictionary" chips: **Abbreviations** (Abbreviation + Grammar, 7,864)
and **Medical terms** (Term rows that aren't generic/brand names, 12,010). Drug and brand names
stay out because they are drug pages already. Terms are shown, not minted: each medical term
offers "Start a page" (`/new?name=…`), or "Open the page" when an entity with the same slug
exists (848 terms match a drug, class or topic by slug; about 60 more match only by name, and
`create_page()` still refuses those with a link to the existing page). Only 29 of the 12,010
medical terms carry a definition other than the term itself, and the set mixes conditions
("sleep apnea") with ingredient and plain words ("diisostearyl", "thousand").

## Open

1. ~~Publish the Do Not Use list~~ — published 2026-10-03 after PR #42 deployed.
2. Misspellings in the source become "correct" in Word: e.g. `Midozalam`, `Chlorpheniramne`,
   `Bethamethasone` (the last two come from FDA product names). Decide whether to set `in_dic = false` on them.
3. Live `entities.name` still carries mojibake on 15 records (e.g. `Î±-Methylfentanyl`,
   `2-deoxy-2-fluoro-Î²-D-mannose`; `name ~ 'Î|Ã|â€|Â'`). The dictionary has the repaired spellings.
   Fixing the records is a production bulk edit — Joshua's call.
4. Master workbook: record PCIDs 1015621–1015680, 2002471–2002590 and 10000038 in `Dispatch_Log` and
   `PCID_Blocks` (next: 1 → 1015681, 2 → 2002591, 10 → 10000039).
5. Staging tables from the import can be dropped: `stg_dictionary_raw`, `stg_dictionary_match`,
   `stg_dictionary_combo`, `stg_dictionary_combo2`, `stg_dictionary_idx`, `stg_dictionary_m2`,
   `stg_dictionary_frag`, `stg_dictionary_fraglink`, `stg_dictionary_gen`, `stg_dictionary_mint`.
6. The `api` Edge Function does not serve the dictionary (or lists) yet.
