-- Phase 29: resolve 'Salt form (base not in list)' precise forms (applied 2026-11-02 via
-- apply_migration as "phase29_salt_base_moieties").
-- Joshua's calls (2026-11-02): mint a core moiety for the clean ones and relabel the salt
-- 'Salt form'; relabel combination/premix rows 'Combination product'; hold the rest.
--
-- Mint batch, moiety PCIDs 1015973-1015988 (next_pcid 1015973 -> 1015989), in salt-PCID order:
--   1015973 benzgalantamine   (3000109)   1015981 sepantronium  (3001226)
--   1015974 iberdomide        (3000549)   1015982 fosfestrol    (3001241)
--   1015975 rusfertide        (3000992)   1015983 zuclomiphene  (3001253)
--   1015976 tebipenem pivoxil (3001063)   1015984 BGT-226       (3001255)
--   1015977 levamfetamine     (3001200)   1015985 CP 615003     (3001260)
--   1015978 cefoselis         (3001206)   1015986 LY 334370     (3001261)
--   1015979 methoxypromazine  (3001215)   1015987 OSU 6162      (3001262)
--   1015980 mercufenol        (3001224)   1015988 SAR407899     (3001263)
-- moieties.base_name = the salt's precise_forms.base_name, which is what moiety_hierarchy joins on.
-- Also relabelled 'Salt form' with NO mint (base already attached in moiety_hierarchy, label was
-- stale): 3000183 cefiderocol, 3000250 clindamycin palmitate HCl, 3000490 fosnetupitant,
-- 3000629 levomefolate, 3000630 levomethadyl, 3000732 mezlocillin, 3001248 sulfathiazole.
-- Relabelled 'Combination product' (22): 3000009 3000010 3000011 3000055 3000097 3000114 3000115
-- 3000157 3000168 3000208 3000271 3000296 3000321 3000326 3000332 3000399 3000408 3000429
-- 3000637 3000755 3001015 3001016.
--
-- STILL 'Salt form (base not in list)' (29), held for Joshua:
--  base exists under another name: benoxinate 3000107 (= oxybuprocaine 1011851),
--   diamthazole 3001196 (= dimazole 1007877), 8-hydroxyquinoline citrate 3001229 (= oxyquinoline 1002162),
--   WIN 55,212-2 mesylate 3001264 (two moieties already: 1000249 and 1014666 - duplicate pair),
--   carbenicillin indanyl 3000172/3000173 (carbenicillin 1000914), (R)-bambuterol 3001242
--   (bambuterol 1006206), fingolimod lauryl sulfate 3000461 (fingolimod 1001455).
--  base is not a real moiety / odd: ferric citrate 3000446, strontium lactate/salicylate 3001246/7,
--   cellulose sodium phosphate 3000200, choline magnesium salicylate 3000229, cholesteryl
--   succinate 3001235, ethyl fumarate 3001239, vinyl chloride 3001252, thiosulfate sodium 3001092,
--   bismuth sodium tartrate 3001220, diethylamine salicylate 3001236, methoxymethyl salicylate
--   3001243, monopotassium glutamate 3001244, calcium cyclamate 3001233, tricholine citrate
--   3001250, technetium Tc 99m gluconate 3001064, edetate disodium 3000389, ampicillin/ampicillin
--   trihydrate 3000060, patiromer sorbitex calcium 3000844, ranitidine bismuth citrate 3000963,
--   bithionolate sodium 3001201.
-- Post-step (cannot run in a transaction): refresh materialized view concurrently
--   moiety_hierarchy, then ingredient_moiety_map, then entity_brand_names (done 2026-11-02).
BEGIN;
SET LOCAL pc.change_source = 'phase29_salt_base_moieties';

DO $$
DECLARE v_next bigint; v_n int;
BEGIN
  SELECT next_pcid INTO v_next FROM public.pcid_blocks WHERE entity_kind = 'moiety' FOR UPDATE;

  CREATE TEMP TABLE _mint ON COMMIT DROP AS
  SELECT m.salt_pcid, m.ename, pf.base_name,
         v_next - 1 + row_number() OVER (ORDER BY m.salt_pcid) AS pcid
  FROM (VALUES
    (3000109,'benzgalantamine'),(3000549,'iberdomide'),(3000992,'rusfertide'),
    (3001063,'tebipenem pivoxil'),(3001200,'levamfetamine'),(3001206,'cefoselis'),
    (3001215,'methoxypromazine'),(3001224,'mercufenol'),(3001226,'sepantronium'),
    (3001241,'fosfestrol'),(3001253,'zuclomiphene'),(3001255,'BGT-226'),
    (3001260,'CP 615003'),(3001261,'LY 334370'),(3001262,'OSU 6162'),(3001263,'SAR407899')
  ) AS m(salt_pcid, ename)
  JOIN public.precise_forms pf ON pf.pcid = m.salt_pcid
  WHERE pf.term_type = 'Salt form (base not in list)';

  SELECT count(*) INTO v_n FROM _mint;
  IF v_n <> 16 THEN RAISE EXCEPTION 'expected 16 salts to mint for, got %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM _mint WHERE upper(ename) <> upper(base_name)) THEN
    RAISE EXCEPTION 'base_name mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM _mint x JOIN public.entities e
             ON e.slug = trim(both '-' from regexp_replace(lower(x.ename),'[^a-z0-9]+','-','g'))
             OR lower(e.name) = lower(x.ename)) THEN
    RAISE EXCEPTION 'slug/name collision'; END IF;

  INSERT INTO public.entities (pcid, entity_type, slug, slug_uri, name, created_at, updated_at)
  SELECT pcid, 'moiety', s.slug, 'pc:moiety:' || s.slug, ename, now(), now()
  FROM (SELECT pcid, ename,
               trim(both '-' from regexp_replace(lower(ename),'[^a-z0-9]+','-','g')) AS slug
        FROM _mint) s;

  INSERT INTO public.moieties (pcid, term_type, base_name, primary_source, source_count)
  SELECT pcid, 'Core moiety', upper(base_name),
         'Pharmacy Commons phase 29 (base moiety for a salt form with no base in the list)', 1
  FROM _mint;

  UPDATE public.pcid_blocks SET next_pcid = v_next + v_n WHERE entity_kind = 'moiety';

  UPDATE public.precise_forms SET term_type = 'Salt form'
  WHERE term_type = 'Salt form (base not in list)' AND pcid IN (SELECT salt_pcid FROM _mint);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 16 THEN RAISE EXCEPTION 'expected 16 relabels, got %', v_n; END IF;

  UPDATE public.precise_forms SET term_type = 'Salt form'
  WHERE term_type = 'Salt form (base not in list)'
    AND pcid IN (3000183,3000250,3000490,3000629,3000630,3000732,3001248);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 7 THEN RAISE EXCEPTION 'expected 7 stale relabels, got %', v_n; END IF;

  UPDATE public.precise_forms SET term_type = 'Combination product'
  WHERE term_type = 'Salt form (base not in list)'
    AND pcid IN (3000009,3000010,3000011,3000055,3000097,3000114,3000115,3000157,3000168,3000208,
                 3000271,3000296,3000321,3000326,3000332,3000399,3000408,3000429,3000637,3000755,
                 3001015,3001016);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 22 THEN RAISE EXCEPTION 'expected 22 combination relabels, got %', v_n; END IF;
END $$;

COMMIT;
