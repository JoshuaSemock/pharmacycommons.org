-- Quinine slug fix (applied 2026-10-13 via execute_sql, run id slug-fix-quinine-2026-10-13).
-- PCID-1002408 (moiety "Quinine") held `quinine-and-urea-hydrochloride`; the combination
-- PCID-2001730 had been given the suffixed `quinine-and-urea-hydrochloride-2`.
-- Result: moiety -> `quinine`, combination -> `quinine-and-urea-hydrochloride`.
-- Checked first: slug `quinine` free; no saved_entities rows; page_links 0; page_content 0.
-- Followed by refresh of moiety_hierarchy, ingredient_moiety_map, entity_brand_names.
-- Note: an old bookmark of /drugs/quinine-and-urea-hydrochloride now opens the combination.
begin;
set local pc.change_source = 'slug-fix-quinine-2026-10-13';
update entities set slug = 'tmp-quinine-swap', slug_uri = 'pc:combination:tmp-quinine-swap' where pcid = 2001730;
update entities set slug = 'quinine', slug_uri = 'pc:moiety:quinine' where pcid = 1002408;
update entities set slug = 'quinine-and-urea-hydrochloride', slug_uri = 'pc:combination:quinine-and-urea-hydrochloride' where pcid = 2001730;
commit;
