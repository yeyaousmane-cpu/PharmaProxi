-- v053b — Rapprochement assisté des conventions avec l'annuaire
-- Propose à l'administrateur les fiches les plus proches (similarité du nom, même
-- région) pour une convention non reliée. Aucune liaison automatique : c'est
-- l'administrateur qui choisit (admin_link_convention).

create or replace function public.admin_convention_candidates(p_ids uuid[])
returns table (convention_id uuid, target_kind text, target_id uuid, target_name text, place text, score real)
language plpgsql stable security definer set search_path to 'public', 'extensions' as $f$
begin
  perform public.require_admin();
  return query
  select c.convention_id, c.target_kind, c.target_id, c.target_name, c.place, c.score from (
    select ip.id as convention_id, x.target_kind, x.target_id, x.target_name, x.place, x.score,
           row_number() over (partition by ip.id order by x.score desc) rn
    from public.insurer_providers ip
    cross join lateral (
      select 'listing'::text target_kind, l.id target_id, l.name target_name,
             concat_ws(', ', l.area_label, co.name) place,
             extensions.similarity(public.pharmacy_name_key(l.name), public.pharmacy_name_key(ip.name)) score
        from public.pharmacy_listings l left join public.communes co on co.id = l.commune_id
       where ip.category = 'pharmacie' and l.region_id = ip.region_id and l.is_published and not l.is_demo
         and extensions.similarity(public.pharmacy_name_key(l.name), public.pharmacy_name_key(ip.name)) >= 0.35
      union all
      select 'pharmacy', p.id, p.name, concat_ws(', ', p.address), extensions.similarity(public.pharmacy_name_key(p.name), public.pharmacy_name_key(ip.name))
        from public.pharmacies p
       where ip.category = 'pharmacie' and p.region_id = ip.region_id and p.status = 'verified' and not p.is_demo
         and extensions.similarity(public.pharmacy_name_key(p.name), public.pharmacy_name_key(ip.name)) >= 0.35
      union all
      select 'facility', f.id, f.name, concat_ws(', ', f.quarter, f.city_label),
             extensions.similarity(public.normalize_text(f.name), public.normalize_text(ip.name))
        from public.facility_listings f
       where ip.category <> 'pharmacie' and f.region_id = ip.region_id and f.is_published
         and extensions.similarity(public.normalize_text(f.name), public.normalize_text(ip.name)) >= 0.35
    ) x
    where ip.id = any(p_ids[1:100]) and ip.pharmacy_id is null and ip.listing_id is null and ip.facility_id is null
  ) c where c.rn <= 3
  order by c.convention_id, c.score desc;
end $f$;
revoke all on function public.admin_convention_candidates(uuid[]) from public, anon;
grant execute on function public.admin_convention_candidates(uuid[]) to authenticated;
