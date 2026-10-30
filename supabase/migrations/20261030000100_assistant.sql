-- ============================================================================
-- PharmaProxi — Migration : assistant santé (IA)
-- Compteur journalier anonyme uniquement : aucune question, aucune réponse,
-- aucune adresse IP n'est enregistrée.
-- ============================================================================
create table if not exists public.assistant_usage (
  day date primary key default ((now() at time zone 'utc')::date),
  requests int not null default 0,
  emergencies int not null default 0,
  refused int not null default 0
);
alter table public.assistant_usage enable row level security;
drop policy if exists "pp_assistant_usage_admin" on public.assistant_usage;
create policy "pp_assistant_usage_admin" on public.assistant_usage for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.assistant_usage from anon, authenticated;
grant select on public.assistant_usage to authenticated;

-- Compte une question. p_kind : 'ai' (appel à l'IA), 'emergency' (réponse d'urgence fixe).
-- Renvoie false si le plafond journalier d'appels à l'IA est atteint (la question n'est alors pas envoyée).
create or replace function public.assistant_count(p_kind text, p_daily_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; n int;
begin
  insert into public.assistant_usage (day) values (d) on conflict (day) do nothing;
  if p_kind = 'emergency' then
    update public.assistant_usage set emergencies = emergencies + 1 where day = d;
    return true;
  end if;
  select requests into n from public.assistant_usage where day = d for update;
  if n >= greatest(coalesce(p_daily_limit, 2000), 0) then
    update public.assistant_usage set refused = refused + 1 where day = d;
    return false;
  end if;
  update public.assistant_usage set requests = requests + 1 where day = d;
  return true;
end $$;
revoke execute on function public.assistant_count(text, int) from public, anon, authenticated;
grant execute on function public.assistant_count(text, int) to service_role;

create or replace function public.purge_assistant_usage()
returns int language sql security definer set search_path = public as $$
  with d as (delete from public.assistant_usage where day < (now() at time zone 'utc')::date - 400 returning 1) select count(*)::int from d
$$;
revoke execute on function public.purge_assistant_usage() from public, anon, authenticated;
