-- v052 — Retrait du module de livraison
--
-- SantéProxi ne livre pas de médicaments. Le module est désactivé sans
-- destruction de données :
--   • aucune table, colonne, ligne ou valeur d'énumération supprimée
--     (couriers : 1 ligne, deliveries / delivery_assignments / delivery_incidents :
--     0 ligne au 12/11/2026, orders : 1 commande en retrait, expirée) ;
--   • les fonctions propres aux livreurs ne sont plus exécutables par les
--     utilisateurs (REVOKE) — elles restent en base pour un retour arrière ;
--   • create_order refuse déjà la livraison (v051) ;
--   • le réglage delivery_enabled passe à false (il valait true), avec trace.
-- Le rôle « courier » ne peut être attribué que par admin_review_courier, désormais
-- inaccessible : plus aucun livreur ne peut être créé. Le compte livreur existant
-- est conservé, sans accès à aucun écran.
--
-- Retour arrière : GRANT EXECUTE ... TO authenticated sur les cinq fonctions,
-- et remettre delivery_enabled à la valeur voulue.

revoke execute on function public.courier_apply(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_review_courier(uuid, public.courier_status, text, text) from public, anon, authenticated;
revoke execute on function public.assign_courier(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.report_delivery_incident(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_couriers(public.courier_status) from public, anon, authenticated;

do $s$
declare before jsonb;
begin
  select value into before from public.platform_settings where key = 'delivery_enabled';
  update public.platform_settings set value = 'false'::jsonb where key = 'delivery_enabled' and value is distinct from 'false'::jsonb;
  if found then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (null, 'settings.update', 'platform_settings', 'delivery_enabled',
            jsonb_build_object('from', before, 'to', false, 'migration', 'v052', 'motif', 'Retrait du module de livraison'));
  end if;
end $s$;

comment on table public.couriers is 'Module de livraison retiré (v052, 12/11/2026). Données conservées, plus utilisées par l''application.';
comment on table public.deliveries is 'Module de livraison retiré (v052, 12/11/2026). Données conservées, plus utilisées par l''application.';
