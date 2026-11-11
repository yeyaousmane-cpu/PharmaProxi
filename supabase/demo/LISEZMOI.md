# Environnement de démonstration SantéProxi

Projet Supabase séparé : **santeproxi-demo** (`wamhqsxouqgesvsqpyzf`). Aucune donnée réelle.

1. Dans l'éditeur SQL du projet **santeproxi-demo** (jamais celui de production), exécuter dans l'ordre
   `installation-demo-partie-1-sur-5.sql` … `partie-5-sur-5.sql` (la dernière peut signaler pg_cron : sans conséquence), puis `installation-demo-complement-0.28.sql` `installation-demo-complement-0.31.sql` `installation-demo-complement-0.32.sql` et `installation-demo-complement-0.33.sql`.
2. Installer les comptes : `seed-demo.sql` (remplacer `__MOT_DE_PASSE__`). Le script refuse de s'exécuter
   si la base contient un compte qui n'est pas en `@pharmaproxi.invalid`.
3. Vercel : nouveau projet à partir du même dépôt, variables
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clés du projet de démonstration), `NEXT_PUBLIC_SITE_URL`,
   `APP_ENV=demo`, `DEMO_PASSWORD`, `FEMME_ENCRYPTION_KEY`. Ne pas définir SMTP, SMS ni clé d'assistant.
4. Sur le site réel, définir `NEXT_PUBLIC_DEMO_URL` (adresse du site de démonstration) pour afficher le lien depuis /demo.

Garde-fous : `isDemoEnv()` exige `APP_ENV=demo` ET une base différente de la production ; les fonctions SQL
`demo_*` exigent le réglage `demo_environment` ; les règles d'accès (RLS) sont identiques à la production.
En démonstration : aucun e-mail, inscription, réinitialisation ou changement d'adresse ; double authentification
non imposée (comptes fictifs).
