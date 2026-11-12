-- v051b — Vues « À renseigner » et « Sur commande » dans la gestion des stocks
-- Même signature et même type de retour : remplacement sans suppression.
-- Le tri place les lignes à renseigner en tête de la vue « Tous ».

create or replace function public.pharmacy_stock_page(p_pharmacy uuid, p_view text default 'tous', p_query text default null, p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, catalog_id uuid, quantity integer, reserved_quantity integer, price_xof integer, is_available boolean, low_stock_threshold integer, stock_updated_at timestamptz, row_version integer, brand_name text, dosage text, form text, packaging text, review_status text, freshness text, total_count bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
declare q text := nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '');
begin
  if not (public.is_pharmacy_member(p_pharmacy) or public.is_admin()) then raise exception 'PP403: accès refusé'; end if;
  return query
  with s as (
    select i.*, c.brand_name as c_brand, c.dosage as c_dosage, c.form as c_form, c.packaging as c_packaging,
           c.review_status as c_review, c.search_text,
           public.stock_status(i.quantity, i.reserved_quantity, i.is_available, i.stock_updated_at, i.low_stock_threshold, i.on_order, i.declared) as st
    from public.pharmacy_inventory i join public.medicine_catalog c on c.id = i.catalog_id
    where i.pharmacy_id = p_pharmacy and (q is null or c.search_text like '%' || q || '%')
  )
  select s.id, s.catalog_id, s.quantity, s.reserved_quantity, s.price_xof, s.is_available, s.low_stock_threshold, s.stock_updated_at, s.row_version,
         s.c_brand, s.c_dosage, s.c_form, s.c_packaging, s.c_review, s.st, count(*) over ()
  from s
  where case coalesce(p_view, 'tous')
          when 'disponibles' then s.declared and s.is_available and s.quantity - s.reserved_quantity > 0
          when 'indisponibles' then s.declared and (not s.is_available or s.quantity - s.reserved_quantity <= 0)
          when 'faibles' then s.declared and s.is_available and s.quantity - s.reserved_quantity <= s.low_stock_threshold
          when 'anciens' then s.st in ('stale', 'to_confirm')
          when 'a_renseigner' then not s.declared
          when 'sur_commande' then s.on_order
          else true end
  order by (not s.declared) desc, public.normalize_text(concat_ws(' ', s.c_brand, s.c_dosage, s.c_form, s.c_packaging)), s.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $function$;
