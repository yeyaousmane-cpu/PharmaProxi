-- ============================================================================
-- PharmaProxi — Migration : formulaire de contact
-- Messages envoyés depuis la page Contact (avec ou sans compte), boîte de
-- réception de l'administration, notification des administrateurs.
-- ============================================================================
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('question', 'erreur', 'donnees', 'pharmacie', 'medecin', 'partenariat', 'autre')),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or public.valid_phone(phone)),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  page_url text check (char_length(coalesce(page_url, '')) <= 300),
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  admin_note text check (char_length(coalesce(admin_note, '')) <= 1000),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index contact_messages_status on public.contact_messages (status, created_at desc);
create trigger contact_messages_touch before update on public.contact_messages for each row execute function public.touch_updated_at();
alter table public.contact_messages enable row level security;
create policy "pp_contact_admin_read" on public.contact_messages for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;

create or replace function public.send_contact_message(p_topic text, p_name text, p_email text, p_phone text, p_message text, p_page text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid; v_phone text := public.normalize_ml_phone(p_phone); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); a record;
begin
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then raise exception 'PP422: numéro de téléphone invalide'; end if;
  if v_email is null and v_phone is null then raise exception 'PP422: indiquez un e-mail ou un téléphone pour que nous puissions vous répondre'; end if;
  if char_length(btrim(coalesce(p_message, ''))) < 10 then raise exception 'PP422: votre message est trop court'; end if;
  -- Anti-abus : 5 messages par heure pour un même e-mail ou téléphone
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour'
      and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) >= 5 then
    raise exception 'PP429: trop de messages envoyés, réessayez plus tard';
  end if;
  insert into public.contact_messages (topic, name, email, phone, message, page_url, user_id)
  values (coalesce(p_topic, 'autre'), btrim(p_name), v_email, v_phone, btrim(p_message), nullif(btrim(coalesce(p_page, '')), ''), auth.uid())
  returning id into mid;
  for a in select user_id from public.user_roles where role = 'admin' loop
    perform public.notify_user(a.user_id, 'contact', 'Nouveau message de contact',
      format('%s : %s', btrim(p_name), left(btrim(p_message), 120)), null, '/admin/messages');
  end loop;
  return mid;
exception
  when check_violation then raise exception 'PP422: vérifiez les informations saisies (nom, e-mail, message de 10 à 3 000 caractères)';
end $$;

create or replace function public.admin_update_contact_message(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin();
begin
  update public.contact_messages set status = p_status, admin_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = uid where id = p_id;
  if not found then raise exception 'PP404: message introuvable'; end if;
exception when check_violation then raise exception 'PP422: statut invalide';
end $$;

-- Purge : messages traités de plus de 2 ans
create or replace function public.purge_contact_messages()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.contact_messages where status = 'closed' and updated_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end $$;

-- Texte de la page Contact, si l'administration ne l'a pas encore modifié
update public.content_pages
set body = 'Une question, une information erronée (pharmacie fermée, numéro faux, garde inexacte), une demande concernant vos données personnelles ou une proposition de partenariat ? Écrivez-nous avec le formulaire ci-dessous : nous vous répondons par e-mail ou par téléphone.

## Urgence médicale

PharmaProxi ne traite pas les urgences. En cas d''urgence, rendez-vous au service d''urgence le plus proche ou consultez la page Urgences.

## Professionnels de santé

Pharmaciens, médecins, cliniques et laboratoires : vous pouvez inscrire votre établissement directement sur la plateforme, ou nous écrire pour être accompagnés.

## Vos données

Vous pouvez consulter, corriger ou supprimer vos informations depuis « Mon compte ». Pour toute autre demande relative à vos données, choisissez le sujet « Mes données personnelles ».'
where slug = 'contact' and body like '%à compléter par l''administration%';

revoke execute on function public.admin_update_contact_message(uuid, text, text), public.purge_contact_messages() from public, anon;
grant execute on function public.admin_update_contact_message(uuid, text, text) to authenticated;
grant execute on function public.send_contact_message(text, text, text, text, text, text) to anon, authenticated;
