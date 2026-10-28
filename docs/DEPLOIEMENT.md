# Mettre PharmaProxi en ligne — pas à pas

Durée : environ une heure. Aucune installation de logiciel n'est obligatoire : tout se fait dans le navigateur, sauf l'étape 1 (au choix).

Vous aurez besoin de trois comptes gratuits : **GitHub** (le code), **Supabase** (la base de données et les comptes), **Vercel** (le site).

> **Coûts.** Pour tester, tout est gratuit. Pour un lancement public, prévoyez :
> - **Vercel Pro** (20 $/mois) : l'offre gratuite Hobby est réservée à un usage personnel non commercial ;
> - **Supabase Pro** (25 $/mois) : sur l'offre gratuite, le projet se met en pause après 7 jours sans visite, et les sauvegardes sont limitées.
>
> Vérifiez les tarifs actuels sur vercel.com/pricing et supabase.com/pricing.

---

## Étape 1 — Mettre le code sur GitHub

1. Créez un compte sur github.com.
2. Cliquez sur **New repository**. Nom : `pharmaproxi`, visibilité **Private**, ne cochez rien d'autre, puis **Create repository**.
3. Envoyez le code dans ce dépôt, au choix :
   - **Sans terminal** : installez *GitHub Desktop*, ouvrez le dossier `pharmaproxi` décompressé (*File › Add local repository*), puis **Publish**.
   - **Avec un terminal** (dans le dossier décompressé) :
     ```bash
     git init && git add -A && git commit -m "PharmaProxi v0.3"
     git branch -M main
     git remote add origin https://github.com/VOTRE-COMPTE/pharmaproxi.git
     git push -u origin main
     ```

> Le fichier `.env.local` (qui contiendra vos clés) n'est jamais envoyé sur GitHub : il est exclu automatiquement.

## Étape 2 — Créer la base de données (Supabase)

1. Sur supabase.com : **New project**.
   - Nom : `pharmaproxi`.
   - **Mot de passe de la base** : générez-le et conservez-le dans un gestionnaire de mots de passe.
   - Région : choisissez la région européenne la plus proche, Paris si elle est proposée, sinon Francfort. Ce sont les plus proches du Mali.
2. Attendez 2 minutes que le projet soit prêt.
3. Menu **SQL Editor › New query**. Ouvrez le fichier `supabase/installation-complete.sql` du projet, copiez **tout** son contenu, collez-le, puis cliquez sur **Run**.
   - Résultat attendu : « Success ». L'installation ne doit être faite **qu'une seule fois**.
   - Contrôle : dans **Table Editor**, la table `regions` contient 20 lignes.
4. Menu **Project Settings › API**. Notez trois valeurs :
   - **Project URL** (`https://xxxx.supabase.co`) ;
   - la clé **anon / public** ;
   - la clé **service_role** : elle est **secrète**, ne la partagez jamais.

## Étape 3 — Configurer l'authentification

Menu **Authentication** :

1. **Providers › Email** : activé, avec **Confirm email** activé.
2. **Settings › mot de passe** : longueur minimale **8**.
3. **URL Configuration** : à faire après l'étape 4, quand vous connaîtrez l'adresse du site.
4. **SMTP — obligatoire avant d'ouvrir les inscriptions au public.** Sans service d'envoi configuré, Supabase n'envoie les e-mails (confirmation d'inscription, mot de passe oublié) **qu'aux adresses des membres de votre équipe Supabase**, et seulement 2 par heure. Les autres personnes ne recevraient jamais leur lien de confirmation.
   - Créez un compte chez un service d'envoi (Brevo, Resend…), vérifiez votre domaine d'envoi, puis renseignez ses paramètres dans **Authentication › Emails › SMTP Settings**.
   - Pour vos propres tests avant cette étape, votre adresse (propriétaire du projet) reçoit bien les e-mails.

## Étape 4 — Mettre le site en ligne (Vercel)

1. Sur vercel.com, connectez-vous **avec votre compte GitHub**.
2. **Add New › Project**, choisissez le dépôt `pharmaproxi`, puis **Import**.
3. Avant de déployer, ouvrez **Environment Variables** et ajoutez :

   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL (étape 2) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé service_role |
   | `NEXT_PUBLIC_SITE_URL` | `https://pharmaproxi.vercel.app` (à corriger après le premier déploiement si l'adresse diffère) |
   | `CRON_SECRET` | une longue phrase aléatoire (30 caractères ou plus) |
   | `APP_ENV` | `production` |

4. Cliquez sur **Deploy** et attendez 2 à 3 minutes. Vercel affiche l'adresse du site.
5. Si l'adresse n'est pas celle indiquée dans `NEXT_PUBLIC_SITE_URL` : corrigez la variable (*Settings › Environment Variables*), puis **Deployments › … › Redeploy**.
6. Retour dans Supabase, **Authentication › URL Configuration** :
   - **Site URL** : l'adresse du site ;
   - **Redirect URLs** : ajoutez `https://VOTRE-ADRESSE/auth/callback`.

## Étape 5 — Créer votre compte administrateur

1. Sur le site, cliquez sur **Connexion › Créer un compte** avec votre adresse e-mail, puis confirmez-la grâce à l'e-mail reçu.
2. Dans Supabase, ouvrez **SQL Editor** et exécutez :
   ```sql
   select public.bootstrap_admin('votre@adresse.com');
   ```
3. Déconnectez-vous puis reconnectez-vous : le menu **Administration** apparaît.

## Étape 6 — Vérifications

- [ ] `https://VOTRE-ADRESSE/api/health` affiche `"database":"ok"`.
- [ ] **Administration › Intégrité** affiche « Stocks, réservations et commandes sont cohérents ».
- [ ] Après 10 à 20 minutes, la même page liste une première maintenance. C'est la preuve que la tâche automatique (pg_cron) tourne.
- [ ] Inscrivez une pharmacie de test avec un second compte, déposez un justificatif (PDF), puis validez-la depuis l'administration. Cette étape vérifie le stockage privé des documents.
- [ ] Ajoutez un produit, faites une demande depuis un troisième compte, confirmez-la, puis remettez le produit.
- [ ] Supprimez ensuite ces données de test (pharmacie, comptes) avant l'ouverture au public.

## Étape 7 — Avant l'ouverture au public

- **Nom de domaine** (ex. `pharmaproxi.ml`) : Vercel › *Settings › Domains*. Pensez ensuite à mettre à jour `NEXT_PUBLIC_SITE_URL` et les URL de Supabase.
- **Surveillance** : créez une sonde gratuite (UptimeRobot, Better Stack…) sur `/api/health`, avec une alerte par e-mail ou SMS.
- **Sauvegardes** : vérifiez celles de Supabase (*Database › Backups*).
- **Géographie** : importez cercles, communes et quartiers depuis *Administration › Géographie*.
- **Textes juridiques** : faites valider confidentialité et conditions, puis modifiez-les dans *Administration › Contenus*.
- **Vérifications réglementaires** : voir `VERIFICATIONS-REGLEMENTAIRES.md`. La livraison reste désactivée tant qu'elles ne sont pas faites.

## Mettre à jour le site plus tard

- **Code** : chaque envoi sur la branche `main` de GitHub redéploie automatiquement le site.
- **Base de données** : une nouvelle migration (fichier dans `supabase/migrations/`) s'exécute dans le *SQL Editor*, **uniquement le nouveau fichier**. Ne relancez jamais `installation-complete.sql` sur une base déjà installée.

### Passer de la v0.2 à la v0.3 (annuaire médical)

1. Envoyez le nouveau code sur GitHub (Vercel redéploie).
2. Dans Supabase › *SQL Editor*, collez et exécutez **uniquement** `supabase/migrations/20261027000100_medical_directory.sql`.
3. Si l'API répond « function not found » juste après, exécutez `notify pgrst, 'reload schema';` (ou attendez une minute).
4. Dans *Administration › Paramètres*, renseignez `emergency_numbers` avec des numéros vérifiés.
5. Vérifiez : `/medecins`, `/cliniques`, `/specialites` s'affichent ; *Administration › Annuaire* est accessible.

Pour une **nouvelle installation**, `installation-complete.sql` contient déjà toutes les migrations, annuaire compris.

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Bandeau « Configuration incomplète » | Variables `NEXT_PUBLIC_SUPABASE_*` absentes ou mal copiées → corriger puis *Redeploy*. |
| Les nouveaux inscrits ne reçoivent pas l'e-mail de confirmation | SMTP non configuré (étape 3.4) : Supabase n'envoie qu'aux membres de l'équipe. |
| Le lien de l'e-mail de confirmation mène à une erreur | *Site URL* / *Redirect URLs* de Supabase incorrectes (étape 4.6). |
| `/api/health` renvoie `unreachable` | Projet Supabase en pause (offre gratuite) ou clé erronée. |
| Échec du déploiement mentionnant « cron » | `vercel.json` modifié avec une fréquence trop élevée pour l'offre gratuite. |
| Les demandes n'expirent jamais | Maintenance pg_cron non active : relancer les deux dernières lignes de `installation-complete.sql`. |
