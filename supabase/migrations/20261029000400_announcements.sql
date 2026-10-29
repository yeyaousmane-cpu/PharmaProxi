-- ============================================================================
-- PharmaProxi — Migration : annonces aux inscrits et message de bienvenue
--   * L'administration envoie une annonce : notification dans le compte de chaque
--     destinataire ; l'e-mail est envoyé par le serveur du site (SMTP).
--   * Chaque nouvel inscrit reçoit automatiquement une notification de bienvenue.
-- Les comptes de démonstration (@pharmaproxi.invalid) ne reçoivent rien.
-- ============================================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 10 and 3000),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&#%.-]*$'),
  audience text not null check (audience in ('tous', 'clients', 'pharmaciens', 'medecins', 'etablissements', 'livreurs')),
  kind text not null default 'announcement' check (kind in ('announcement', 'welcome')),
  in_app_count int not null default 0,
  email_requested boolean not null default false,
  email_sent int not null default 0,
  email_failed int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "pp_announcements_admin" on public.announcements;
create policy "pp_announcements_admin" on public.announcements for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;

-- Personnes ayant déjà reçu l'e-mail de bienvenue (pour ne jamais l'envoyer deux fois)
create table if not exists public.welcome_emails (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.welcome_emails enable row level security;
revoke all on public.welcome_emails from anon, authenticated;

-- Destinataires d'une audience (comptes réels uniquement)
create or replace function public.announcement_recipients(p_audience text)
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.full_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email not like '%@pharmaproxi.invalid'
    and case p_audience
      when 'tous' then true
      when 'clients' then exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'customer')
      when 'pharmaciens' then exists (select 1 from public.pharmacy_members m where m.user_id = p.id)
      when 'medecins' then exists (select 1 from public.doctors d where d.user_id = p.id)
      when 'etablissements' then exists (select 1 from public.clinic_members c where c.user_id = p.id)
      when 'livreurs' then exists (select 1 from public.couriers c where c.user_id = p.id)
      else false end
$$;
revoke execute on function public.announcement_recipients(text) from public, anon, authenticated;

-- Envoi d'une annonce : notifications immédiates ; renvoie la liste des e-mails
-- pour l'envoi par le serveur (réservé à l'administration).
-- p_kind = 'welcome' : notification seulement à ceux qui ne l'ont pas encore,
-- e-mail seulement à ceux qui ne l'ont pas encore reçu par e-mail.
create or replace function public.admin_send_announcement(p_title text, p_body text, p_link text, p_audience text, p_email boolean, p_kind text default 'announcement')
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_admin(); aid uuid; n int; recipients jsonb; welcome boolean := coalesce(p_kind, 'announcement') = 'welcome';
begin
  insert into public.announcements (title, body, link, audience, kind, email_requested, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_audience, coalesce(p_kind, 'announcement'), coalesce(p_email, false), uid)
  returning id into aid;
  insert into public.notifications (user_id, kind, title, body, link)
  select r.user_id, case when welcome then 'welcome' else 'announcement' end, btrim(p_title), btrim(p_body),
         coalesce(nullif(btrim(coalesce(p_link, '')), ''), '/compte/notifications')
  from public.announcement_recipients(p_audience) r
  where not welcome or not exists (select 1 from public.notifications x where x.user_id = r.user_id and x.kind = 'welcome');
  get diagnostics n = row_count;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'email', r.email, 'name', r.full_name)), '[]'::jsonb) into recipients
  from public.announcement_recipients(p_audience) r
  where coalesce(p_email, false) and r.email is not null
    and (not welcome or not exists (select 1 from public.welcome_emails w where w.user_id = r.user_id));
  update public.announcements set in_app_count = n where id = aid;
  perform public.log_audit('announcement.send', 'announcement', aid::text, jsonb_build_object('audience', p_audience, 'notifications', n, 'email', p_email));
  return jsonb_build_object('id', aid, 'count', n, 'recipients', recipients);
exception
  when check_violation then raise exception 'PP422: titre (3 à 120 caractères), message (10 à 3 000) et lien interne (commençant par /) à vérifier';
end $$;

create or replace function public.admin_announcement_email_result(p_id uuid, p_sent int, p_failed int, p_welcomed uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.announcements set email_sent = greatest(p_sent, 0), email_failed = greatest(p_failed, 0) where id = p_id;
  insert into public.welcome_emails (user_id) select unnest(coalesce(p_welcomed, '{}')) on conflict do nothing;
end $$;

-- E-mail de bienvenue envoyé à l'inscription (appelé par le serveur avec la clé de service)
create or replace function public.mark_welcome_emailed(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.welcome_emails (user_id) values (p_user) on conflict do nothing
$$;

-- Bienvenue automatique (notification) pour chaque nouvel inscrit
create or replace function public.send_welcome(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, 'welcome', 'Bienvenue sur PharmaProxi !',
         'Merci de votre inscription. Trouvez la pharmacie qui a votre médicament, les pharmacies de garde, un médecin, un laboratoire, et prenez rendez-vous en ligne. '
         || 'La plateforme est en phase de test : vos remarques nous aident à l''améliorer, écrivez-nous depuis la page Contact. Bonne expérience ! — L''équipe PharmaProxi',
         '/'
  where not exists (select 1 from public.notifications n where n.user_id = p_user and n.kind = 'welcome')
    and not exists (select 1 from auth.users u where u.id = p_user and u.email like '%@pharmaproxi.invalid')
$$;
create or replace function public.welcome_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_welcome(new.id);
  return new;
end $$;
drop trigger if exists profiles_welcome on public.profiles;
create trigger profiles_welcome after insert on public.profiles for each row execute function public.welcome_new_profile();

revoke execute on function public.send_welcome(uuid), public.welcome_new_profile() from public, anon, authenticated;
revoke execute on function public.admin_send_announcement(text, text, text, text, boolean, text), public.admin_announcement_email_result(uuid, int, int, uuid[]) from public, anon;
grant execute on function public.admin_send_announcement(text, text, text, text, boolean, text), public.admin_announcement_email_result(uuid, int, int, uuid[]) to authenticated;
revoke execute on function public.mark_welcome_emailed(uuid) from public, anon, authenticated;
grant execute on function public.mark_welcome_emailed(uuid) to service_role;
