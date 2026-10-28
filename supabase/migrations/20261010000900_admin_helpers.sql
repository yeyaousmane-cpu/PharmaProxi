-- ============================================================================
-- PharmaProxi — Migration 0009 : outils d'administration
-- ============================================================================

-- Recherche d'utilisateurs (e-mail issu de auth.users, non dupliqué dans profiles)
create or replace function public.admin_find_users(p_query text default null, p_limit int default 50)
returns table (id uuid, email text, full_name text, phone text, roles public.app_role[], created_at timestamptz, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
  select p.id, u.email::text, p.full_name, p.phone,
         coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
         p.created_at, p.deleted_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles r on r.user_id = p.id
  where p_query is null or char_length(trim(p_query)) = 0
     or u.email ilike '%' || trim(p_query) || '%'
     or p.full_name ilike '%' || trim(p_query) || '%'
     or p.phone like '%' || regexp_replace(p_query, '\s', '', 'g') || '%'
  group by p.id, u.email
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Livreurs avec identité (pour la vérification et l'affectation)
create or replace function public.admin_couriers(p_status public.courier_status default null)
returns table (user_id uuid, full_name text, email text, phone text, status public.courier_status, vehicle text,
               zone text, id_document_ref text, is_available boolean, active_deliveries bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
  select c.user_id, p.full_name, u.email::text, c.phone, c.status, c.vehicle,
         concat_ws(', ', cm.name, r.name), c.id_document_ref, c.is_available,
         (select count(*) from public.delivery_assignments a where a.courier_id = c.user_id and a.is_active),
         c.created_at
  from public.couriers c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  left join public.regions r on r.id = c.zone_region_id
  left join public.communes cm on cm.id = c.zone_commune_id
  where p_status is null or c.status = p_status
  order by c.status, c.created_at desc;
end $$;

-- Modification d'une page d'information (journalisée)
create or replace function public.admin_update_content(p_slug text, p_title text, p_body text, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  insert into public.content_pages (slug, title, body, published, updated_at, updated_by)
  values (p_slug, p_title, p_body, p_published, now(), uid)
  on conflict (slug) do update set title = excluded.title, body = excluded.body, published = excluded.published, updated_at = now(), updated_by = uid;
  perform public.log_audit('content.update', 'content', p_slug);
end $$;

-- Traitement d'un signalement (journalisé)
create or replace function public.admin_handle_report(p_report uuid, p_status public.report_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  update public.reports set status = p_status, resolution_note = nullif(trim(p_note), ''), handled_by = uid where id = p_report;
  if not found then raise exception 'PP404: signalement introuvable'; end if;
  perform public.log_audit('report.handle', 'report', p_report::text, jsonb_build_object('status', p_status));
end $$;

-- Mise à jour d'une catégorie de produits (journalisée)
create or replace function public.admin_update_category(p_category uuid, p_authorized boolean, p_delivery boolean, p_prescription boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_delivery and p_prescription then raise exception 'PP422: une catégorie sur ordonnance ne peut pas être livrée'; end if;
  update public.product_categories set is_authorized = p_authorized, delivery_allowed = p_delivery and p_authorized, requires_prescription = p_prescription
  where id = p_category;
  perform public.log_audit('category.update', 'category', p_category::text,
    jsonb_build_object('authorized', p_authorized, 'delivery', p_delivery, 'prescription', p_prescription));
end $$;

-- Ajout d'un élément géographique (journalisé)
create or replace function public.admin_add_geo(p_kind text, p_parent uuid, p_name text, p_source text default null, p_circle uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid; reg uuid;
begin
  perform public.require_admin();
  if coalesce(trim(p_name), '') = '' then raise exception 'PP422: nom requis'; end if;
  if p_kind = 'circle' then
    insert into public.circles (region_id, name, source) values (p_parent, trim(p_name), p_source) returning id into nid;
  elsif p_kind = 'commune' then
    if p_circle is not null and not exists (select 1 from public.circles where id = p_circle and region_id = p_parent) then
      raise exception 'PP422: le cercle n''appartient pas à la région';
    end if;
    insert into public.communes (region_id, circle_id, name, source) values (p_parent, p_circle, trim(p_name), p_source) returning id into nid;
  elsif p_kind = 'locality' then
    insert into public.localities (commune_id, name, source) values (p_parent, trim(p_name), p_source) returning id into nid;
  else
    raise exception 'PP422: type inconnu';
  end if;
  perform public.log_audit('geo.add', p_kind, nid::text, jsonb_build_object('name', p_name, 'source', p_source));
  return nid;
exception when unique_violation then
  raise exception 'PP409: cet élément existe déjà';
end $$;
