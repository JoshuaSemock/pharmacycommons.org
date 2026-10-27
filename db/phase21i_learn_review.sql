-- Phase 21i — Learn: admin review screen (summary, sample, collection publish)
-- Destination: db/phase21i_learn_review.sql
-- All three functions check has_role('admin') themselves. They are SECURITY DEFINER because drafts are
-- invisible to RLS; they are executable by `authenticated` on purpose (expected advisor findings), like learn_set_status.
-- Item status: published = approved; review_needed = flagged for a fix; archived = rejected (kept so the
-- generator's natural_key conflict does not recreate it).

create or replace function public.learn_review_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'title', c.title, 'status', c.status,
        'draft', x.draft, 'review_needed', x.review_needed, 'published', x.published, 'archived', x.archived) order by c.sort_order, c.title)
      from public.learn_collections c
      cross join lateral (
        select count(*) filter (where i.status = 'draft')::int as draft,
               count(*) filter (where i.status = 'review_needed')::int as review_needed,
               count(*) filter (where i.status = 'published')::int as published,
               count(*) filter (where i.status = 'archived')::int as archived
        from public.learn_collection_items ci join public.learn_items i on i.id = ci.item_id
        where ci.collection_id = c.id) x
      where c.is_official), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'template_key', t.template_key, 'draft', t.draft, 'review_needed', t.review_needed,
        'published', t.published, 'archived', t.archived) order by t.template_key)
      from (select template_key,
                   count(*) filter (where status = 'draft')::int as draft,
                   count(*) filter (where status = 'review_needed')::int as review_needed,
                   count(*) filter (where status = 'published')::int as published,
                   count(*) filter (where status = 'archived')::int as archived
            from public.learn_items where is_official and template_key is not null group by template_key) t), '[]'::jsonb));
end $fn$;

-- A deterministic, seed-ordered sample of one template's items in one status (p_offset pages through it).
create or replace function public.learn_review_items(p_template text, p_status text default 'draft',
  p_limit int default 50, p_offset int default 0, p_seed text default 'audit')
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_limit not between 1 and 200 then raise exception 'bad_limit' using errcode = '22023'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.learn_items where is_official and template_key = p_template and status = p_status),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.rk)
      from (select i.id, i.template_key, i.status, i.item_type, i.topic, i.prompt, i.concise_answer,
                   i.clinical_rationale, i.clinical_caveats, i.mcq_options, i.source_agency, i.source_citation,
                   i.third_party_sources, i.primary_pcid, e.name as primary_name,
                   row_number() over (order by md5(i.id::text || p_seed)) as rk
            from public.learn_items i left join public.entities e on e.pcid = i.primary_pcid
            where i.is_official and i.template_key = p_template and i.status = p_status
            order by md5(i.id::text || p_seed) offset p_offset limit p_limit) r), '[]'::jsonb));
end $fn$;

-- Publish or unpublish a whole collection. Publishing needs at least one published item in it.
create or replace function public.learn_set_collection_status(p_collection uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_pub int;
begin
  if not public.has_role('admin') then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'bad_status' using errcode = '22023'; end if;
  if p_status = 'published' then
    select count(*) into v_pub from public.learn_collection_items ci
      join public.learn_items i on i.id = ci.item_id and i.status = 'published' and i.is_official
      where ci.collection_id = p_collection;
    if v_pub = 0 then raise exception 'no_published_items' using errcode = '22023'; end if;
  end if;
  update public.learn_collections set status = p_status, updated_at = now() where id = p_collection and is_official;
  if not found then raise exception 'collection_not_found' using errcode = 'P0002'; end if;
  return p_status;
end $fn$;

revoke execute on function public.learn_review_summary(), public.learn_review_items(text, text, int, int, text),
  public.learn_set_collection_status(uuid, text) from public, anon;
grant execute on function public.learn_review_summary(), public.learn_review_items(text, text, int, int, text),
  public.learn_set_collection_status(uuid, text) to authenticated;
