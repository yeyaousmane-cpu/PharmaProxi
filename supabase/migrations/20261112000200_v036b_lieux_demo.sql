-- 0.36b — Les lieux de démonstration (source « DÉMO ») n'apparaissent jamais dans les filtres de l'annuaire national.
create or replace function public.directory_places()
returns table (level text, id uuid, parent_id uuid, name text, n bigint) language sql stable security definer set search_path = public as $$
  select 'region', r.id, null::uuid, r.name, (select count(*) from public.facility_listings f where f.region_id = r.id and f.is_published and f.claimed_clinic_id is null)
    from public.regions r
  union all
  select 'cercle', c.id, c.region_id, c.name, (select count(*) from public.facility_listings f where f.circle_id = c.id and f.is_published and f.claimed_clinic_id is null)
    from public.circles c
  union all
  select 'commune', m.id, coalesce(m.circle_id, m.region_id), m.name, (select count(*) from public.facility_listings f where f.commune_id = m.id and f.is_published and f.claimed_clinic_id is null)
    from public.communes m where coalesce(m.source, '') <> 'DÉMO'
  order by 1, 4;
$$;
grant execute on function public.directory_places() to anon, authenticated;
