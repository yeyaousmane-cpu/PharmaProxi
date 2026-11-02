-- ============================================================================
-- PharmaProxi — Migration : questions aux pharmaciens + comparaison des équivalents
--   1. Un utilisateur pose une question ; les pharmaciens des pharmacies vérifiées
--      répondent sous leur nom. L'identité du demandeur n'est jamais montrée.
--      Publication (anonyme) seulement si le demandeur l'accepte.
--   2. Équivalents d'un médicament : même principe actif et même dosage, avec la
--      fourchette des prix déclarés par les pharmacies vérifiées.
-- Peut être relancé sans erreur.
-- ============================================================================

create table if not exists public.pharmacist_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 15 and 1000),
  about text not null default 'moi' check (about in ('moi', 'enfant', 'femme_enceinte', 'personne_agee', 'autre')),
  allow_public boolean not null default false,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  search_text text generated always as (public.normalize_text(question)) stored
);
create index if not exists pq_status on public.pharmacist_questions (status, created_at desc) where not hidden;
alter table public.pharmacist_questions enable row level security;
drop policy if exists "pp_pq_owner" on public.pharmacist_questions;
create policy "pp_pq_owner" on public.pharmacist_questions for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.pharmacist_questions from anon, authenticated;
grant select on public.pharmacist_questions to authenticated;

create table if not exists public.pharmacist_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.pharmacist_questions(id) on delete cascade,
  pharmacist_id uuid references public.profiles(id) on delete set null,
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 120),
  pharmacy_name text not null,
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pa_question on public.pharmacist_answers (question_id);
create unique index if not exists pa_one_per_pharmacist on public.pharmacist_answers (question_id, pharmacist_id);
alter table public.pharmacist_answers enable row level security;
drop policy if exists "pp_pa_read" on public.pharmacist_answers;
create policy "pp_pa_read" on public.pharmacist_answers for select to authenticated using (
  public.is_admin() or exists (select 1 from public.pharmacist_questions q where q.id = question_id and q.user_id = auth.uid()));
revoke all on public.pharmacist_answers from anon, authenticated;
grant select on public.pharmacist_answers to authenticated;

-- Pharmacien d'une pharmacie vérifiée (au moins une)
create or replace function public.is_verified_pharmacist()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pharmacy_members m join public.pharmacies p on p.id = m.pharmacy_id
                  where m.user_id = auth.uid() and p.status = 'verified')
$$;

create or replace function public.ask_pharmacist(p_question text, p_about text default 'moi', p_public boolean default false, p_urgent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_id uuid;
begin
  if (select count(*) from public.pharmacist_questions where user_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'PP429: 3 questions par jour au maximum';
  end if;
  insert into public.pharmacist_questions (user_id, question, about, allow_public, urgent)
  values (uid, btrim(p_question), coalesce(nullif(p_about, ''), 'moi'), coalesce(p_public, false), coalesce(p_urgent, false))
  returning id into v_id;
  return v_id;
exception
  when check_violation then raise exception 'PP422: question entre 15 et 1 000 caractères';
end $$;

create or replace function public.close_my_question(p_id uuid, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth();
begin
  if p_delete then delete from public.pharmacist_questions where id = p_id and user_id = uid;
  else update public.pharmacist_questions set status = 'closed' where id = p_id and user_id = uid; end if;
end $$;

-- File des questions pour les pharmaciens (sans identité du demandeur)
create or replace function public.pharmacist_question_queue(p_filter text default 'open', p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, urgent boolean, status text, created_at timestamptz, answers bigint, mine boolean, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_verified_pharmacist() then raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées'; end if;
  return query
  select q.id, q.question, q.about, q.urgent, q.status, q.created_at,
         (select count(*) from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid()),
         count(*) over ()
    from public.pharmacist_questions q
   where not q.hidden and q.status <> 'closed'
     and case p_filter when 'open' then q.status = 'open'
                       when 'mine' then exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and a.pharmacist_id = auth.uid())
                       else true end
   order by q.urgent desc, q.created_at asc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.pharmacist_question_answers(p_question uuid)
returns table (id uuid, author_name text, pharmacy_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_verified_pharmacist() or public.is_admin()
          or exists (select 1 from public.pharmacist_questions q where q.id = p_question and (q.user_id = auth.uid() or (q.allow_public and not q.hidden)))) then
    raise exception 'PP403: accès refusé';
  end if;
  return query select a.id, a.author_name, a.pharmacy_name, a.body, a.created_at from public.pharmacist_answers a
    where a.question_id = p_question and not a.hidden order by a.created_at;
end $$;

create or replace function public.answer_question(p_question uuid, p_pharmacy uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_auth(); v_name text; v_ph text; v_id uuid; v_owner uuid;
begin
  if not public.is_pharmacy_member(p_pharmacy) or not exists (select 1 from public.pharmacies where id = p_pharmacy and status = 'verified') then
    raise exception 'PP403: réservé aux pharmaciens des pharmacies vérifiées';
  end if;
  select nullif(btrim(full_name), '') into v_name from public.profiles where id = uid;
  if v_name is null then raise exception 'PP422: renseignez votre nom dans Mon compte : il est affiché avec votre réponse'; end if;
  select name into v_ph from public.pharmacies where id = p_pharmacy;
  select user_id into v_owner from public.pharmacist_questions where id = p_question and not hidden and status <> 'closed';
  if v_owner is null then raise exception 'PP404: question introuvable ou close'; end if;
  insert into public.pharmacist_answers (question_id, pharmacist_id, pharmacy_id, author_name, pharmacy_name, body)
  values (p_question, uid, p_pharmacy, v_name, v_ph, btrim(p_body))
  on conflict (question_id, pharmacist_id) do update set body = excluded.body, pharmacy_id = excluded.pharmacy_id, pharmacy_name = excluded.pharmacy_name, created_at = now()
  returning id into v_id;
  update public.pharmacist_questions set status = 'answered', answered_at = coalesce(answered_at, now()) where id = p_question;
  perform public.notify_user(v_owner, 'question', 'Un pharmacien a répondu à votre question', 'Réponse de ' || v_name || ' (' || v_ph || ').', null, '/questions-pharmacien/mes-questions');
  return v_id;
exception
  when check_violation then raise exception 'PP422: réponse entre 10 et 2 000 caractères';
end $$;

create or replace function public.public_pharmacist_questions(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, question text, about text, answered_at timestamptz, answers jsonb, total_count bigint)
language sql stable security definer set search_path = public, extensions as $$
  with q0 as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t)
  select q.id, q.question, q.about, q.answered_at,
         (select coalesce(jsonb_agg(jsonb_build_object('author', a.author_name, 'pharmacy', a.pharmacy_name, 'body', a.body, 'at', a.created_at) order by a.created_at), '[]')
            from public.pharmacist_answers a where a.question_id = q.id and not a.hidden),
         count(*) over ()
    from public.pharmacist_questions q cross join q0
   where q.allow_public and not q.hidden and q.status in ('answered', 'closed')
     and exists (select 1 from public.pharmacist_answers a where a.question_id = q.id and not a.hidden)
     and (q0.t is null or not exists (select 1 from regexp_split_to_table(q0.t, '\s+') w where w <> '' and q.search_text not like '%' || w || '%'))
   order by q.answered_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_moderate_question(p_question uuid, p_answer uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_answer is not null then update public.pharmacist_answers set hidden = p_hidden where id = p_answer;
  else update public.pharmacist_questions set hidden = p_hidden where id = p_question; end if;
  perform public.log_audit('question.moderate', 'pharmacist_question', coalesce(p_answer, p_question)::text, jsonb_build_object('hidden', p_hidden));
end $$;

revoke execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() from public, anon;
grant execute on function public.ask_pharmacist(text, text, boolean, boolean), public.close_my_question(uuid, boolean), public.pharmacist_question_queue(text, int, int),
  public.answer_question(uuid, uuid, text), public.admin_moderate_question(uuid, uuid, boolean), public.is_verified_pharmacist() to authenticated;
grant execute on function public.public_pharmacist_questions(text, int, int), public.pharmacist_question_answers(uuid) to anon, authenticated;

-- Purge à la suppression du compte (questions privées)
create or replace function public.purge_personal_health_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.children where user_id = new.id;
    delete from public.treatments where user_id = new.id;
    delete from public.health_measures where user_id = new.id;
    delete from public.user_alert_prefs where user_id = new.id;
    delete from public.pharmacist_questions where user_id = new.id and not (allow_public and status <> 'open');
    delete from public.femme_days where user_id = new.id;
    delete from public.femme_periods where user_id = new.id;
    delete from public.femme_reminders where user_id = new.id;
    delete from public.femme_access_log where user_id = new.id;
    delete from public.femme_profiles where user_id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Équivalents : même principe actif et même dosage
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_key(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), '[^a-z0-9+ ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function public.dose_key(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(public.normalize_text(coalesce(p, '')), ',', '.', 'g'), '\s+', '', 'g')
$$;

-- Prix déclarés (pharmacies vérifiées, stock non périmé) par produit du catalogue
create or replace function public.equivalent_products(p_catalog uuid)
returns table (catalog_id uuid, brand_name text, dosage text, form text, packaging text, manufacturer text, is_same boolean,
               min_price int, max_price int, pharmacies bigint)
language sql stable security definer set search_path = public as $$
  with ref as (select public.ingredient_key(coalesce(nullif(active_ingredient, ''), generic_name)) as ing, public.dose_key(dosage) as dk,
                      public.normalize_text(coalesce(form, '')) as fm
                 from public.medicine_catalog where id = p_catalog),
  cands as (
    select c.* from public.medicine_catalog c, ref
     where c.merged_into is null and c.review_status <> 'rejected' and ref.ing <> ''
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = ref.ing
       and public.dose_key(c.dosage) = ref.dk
       and (ref.fm = '' or public.normalize_text(coalesce(c.form, '')) = '' or public.normalize_text(c.form) = ref.fm))
  select c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer, c.id = p_catalog,
         min(i.price_xof), max(i.price_xof), count(distinct i.pharmacy_id) filter (where i.price_xof is not null)
    from cands c
    left join public.pharmacy_inventory i on i.catalog_id = c.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by c.id, c.brand_name, c.dosage, c.form, c.packaging, c.manufacturer
   order by min(i.price_xof) nulls last, c.brand_name
   limit 30
$$;

-- Recherche par nom → groupes « principe actif + dosage » avec la fourchette de prix
create or replace function public.compare_prices(p_query text, p_limit int default 20)
returns table (ingredient text, dosage text, form text, products bigint, min_price int, max_price int, pharmacies bigint, sample_catalog uuid, brands text[])
language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(public.normalize_text(left(coalesce(p_query, ''), 80)), '') as t),
  hits as (
    select public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) as ing, public.dose_key(c.dosage) as dk
      from public.medicine_catalog c, q
     where q.t is not null and c.merged_into is null and c.review_status <> 'rejected'
       and c.search_text like '%' || q.t || '%'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) <> ''
     group by 1, 2 limit 20),
  grp as (
    select h.ing, h.dk, c.id, c.brand_name, coalesce(nullif(c.active_ingredient, ''), c.generic_name) as ing_label, c.dosage, c.form
      from hits h join public.medicine_catalog c on c.merged_into is null and c.review_status <> 'rejected'
       and public.ingredient_key(coalesce(nullif(c.active_ingredient, ''), c.generic_name)) = h.ing and public.dose_key(c.dosage) = h.dk)
  select min(g.ing_label), min(g.dosage), min(g.form), count(distinct g.id), min(i.price_xof), max(i.price_xof),
         count(distinct i.pharmacy_id), (array_agg(g.id order by i.price_xof nulls last))[1], array_agg(distinct g.brand_name)
    from grp g
    left join public.pharmacy_inventory i on i.catalog_id = g.id and i.price_xof is not null and i.quantity > 0 and i.is_available and i.stock_updated_at > now() - interval '30 days'
     and exists (select 1 from public.pharmacies p where p.id = i.pharmacy_id and p.status = 'verified')
   group by g.ing, g.dk
   order by count(distinct i.pharmacy_id) desc, min(g.ing_label)
   limit least(greatest(coalesce(p_limit, 20), 1), 40)
$$;
alter function public.compare_prices(text, int) set statement_timeout = '5s';
grant execute on function public.equivalent_products(uuid), public.compare_prices(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Santé essentielle : sections « Que faire » et « À ne pas faire » (fiches de premiers secours)
-- ---------------------------------------------------------------------------
create or replace function public.health_clean_body(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(v), 6000))), '{}'::jsonb)
  from jsonb_each_text(coalesce(p, '{}'::jsonb)) as t(k, v)
  where k in ('definition', 'gestes', 'a_eviter', 'importance', 'situations', 'prevention', 'examens', 'deroulement', 'preparation',
              'resultats', 'quand_consulter', 'urgence', 'ou_au_mali')
    and nullif(btrim(v), '') is not null
$$;
