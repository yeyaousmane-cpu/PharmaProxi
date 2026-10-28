# PharmaProxi

**Votre pharmacie, plus proche de vous.** Plateforme malienne pour localiser les pharmacies, connaître les médicaments qu'elles déclarent disponibles (avec la date de mise à jour), demander une confirmation, réserver pour un retrait et — lorsque c'est autorisé — se faire livrer. Depuis la v0.3, elle comprend aussi un **annuaire médical vérifié** : médecins par spécialité, établissements où ils consultent, jours de consultation et contacts.

Version **0.3.0** — éditeur : Yéya Ousmane Touré.

> PharmaProxi ne recommande aucun médicament ni aucun médecin, ne pose aucun diagnostic et ne remplace pas l'avis d'un professionnel de santé. En cas d'urgence, appelez les secours.

---

## Sommaire

1. [Fonctionnalités](#1-fonctionnalités)
2. [Architecture](#2-architecture)
3. [Démarrage rapide](#3-démarrage-rapide)
4. [Configuration de Supabase](#4-configuration-de-supabase)
5. [Premier administrateur et données de démonstration](#5-premier-administrateur-et-données-de-démonstration)
6. [Déploiement (Vercel)](#6-déploiement-vercel)
7. [Tests](#7-tests)
8. [Sécurité et protection des données](#8-sécurité-et-protection-des-données)
9. [Sauvegardes, conservation et suppression des données](#9-sauvegardes-conservation-et-suppression-des-données)
10. [Robustesse et exploitation](#10-robustesse-et-exploitation)
11. [Évolutions prévues](#11-évolutions-prévues)

Documents complémentaires :
- [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) — mise en ligne pas à pas, sans connaissances techniques.
- [`docs/ETAT-DES-FONCTIONNALITES.md`](docs/ETAT-DES-FONCTIONNALITES.md) — ce qui est terminé, partiel ou non configuré.
- [`docs/VERIFICATIONS-REGLEMENTAIRES.md`](docs/VERIFICATIONS-REGLEMENTAIRES.md) — vérifications à mener avant le lancement réel.
- [`docs/PROCEDURES-ADMINISTRATION.md`](docs/PROCEDURES-ADMINISTRATION.md) — validation des pharmacies et des livreurs, incidents.

---

## 1. Fonctionnalités

| Espace | Contenu |
|---|---|
| **Public / client** | Recherche (nom commercial, générique, principe actif ; insensible aux accents, à la casse, aux espaces, tolérante aux fautes), suggestions, filtres (région, commune, quartier, prix, distance, disponibles, ouvertes), tri (pertinence, disponibilité récente, prix, proximité), carte OpenStreetMap, fiches pharmacie et produit, demande de confirmation / réservation, suivi de commande, notifications, adresses, signalements, suppression du compte. |
| **Pharmacien** | Équipe (propriétaire + collaborateurs), inscription (statut « en attente », jamais vérifiée d'office), dépôt de justificatifs (stockage privé), tableau de bord, gestion des stocks (mise à jour rapide sur téléphone, « confirmer à l'identique » en un clic), catalogue partagé dédoublonné, lots et péremptions, import / export CSV, historique des mouvements, traitement des commandes. |
| **Administrateur** | Indicateurs réels par période et région, validation des médecins et établissements (liste de contrôle en 5 points, justificatifs), spécialités, fiches anciennes, transfert de propriétaire d'une pharmacie, validation / refus / suspension / réactivation des pharmacies avec liste de contrôle, horaires vérifiés, catalogue (fiches à vérifier, doublons, fusion, catégories), utilisateurs et rôles, livreurs, supervision des commandes et incidents, remboursements, signalements, géographie (ajout, import CSV), paramètres, pages d'information, journal d'audit, export de rapport non sensible. |
| **Annuaire médical** | Recherche de médecins par spécialité, nom, zone, langue, genre, établissement, jour de consultation ou « consulte aujourd'hui » ; fiches médecin (spécialités, langues, lieux et plannings, absences, numéro de rendez-vous) ; fiches clinique / cabinet / centre de santé (services, urgences 24 h/24, horaires, médecins, pharmacies proches, carte) ; page « Quel spécialiste pour quoi ? » ; signalement d'une information erronée. Ordre **neutre** (alphabétique ou distance), aucun classement payant. |
| **Espace médecin** | Référencement avec consentement à la publication, justificatifs privés (Ordre, diplômes, identité), statut de vérification, proposition de lieux d'exercice, plannings, absences, confirmation périodique des informations, retrait de la publication à tout moment. |
| **Espace établissement** | Inscription d'une clinique / cabinet / centre, justificatifs, équipe, invitation de médecins vérifiés, acceptation des demandes, horaires et services. Un lieu d'exercice n'est publié qu'après **double acceptation** (médecin et établissement) et vérification des deux. |
| **Livraison** | Candidature livreur, habilitation par l'administration, disponibilité, affectation, collecte, remise, échec, incidents, encaissement confirmé. **Désactivée par défaut.** |

Règles métier essentielles (imposées en base de données) :

- Une disponibilité est une **déclaration datée** : « Stock déclaré disponible » (< 24 h), « Disponibilité à confirmer » (24–72 h), « Indisponible », « Information ancienne » (> 72 h). Seuils paramétrables.
- Rien n'est réservé avant la **confirmation de la pharmacie** ; la réservation est alors transactionnelle (verrous, contrôle `réservé ≤ quantité`), avec expiration automatique.
- **Idempotence** : une même demande envoyée deux fois ne crée qu'une commande ; un statut appliqué deux fois ne déduit pas deux fois le stock.
- **Jamais « payé » sans confirmation explicite** par la pharmacie ou le livreur ; une annulation après paiement passe en « remboursement à effectuer ».
- **Ordonnance** : retrait en pharmacie uniquement, sur présentation de l'ordonnance ; jamais livré.
- **Livraison** : interrupteur global désactivé par défaut, catégories autorisées une à une, livreurs vérifiés uniquement.
- **Annuaire** : seuls les médecins et établissements **vérifiés** et ayant **consenti** apparaissent ; numéro d'Ordre et téléphone personnel jamais publiés ; fiche « à confirmer » après 90 jours sans confirmation, retirée de l'annuaire après 180 jours (seuils paramétrables) ; rappels automatiques.

## 2. Architecture

```
Next.js 16 (App Router, TypeScript, Tailwind, composants style shadcn/ui)
   │  Server Components + Server Actions (aucune clé secrète côté client)
   ▼
Supabase
   ├─ Auth (e-mail + mot de passe)
   ├─ PostgreSQL : schéma relationnel, RLS sur toutes les tables,
   │  fonctions SECURITY DEFINER pour toutes les opérations sensibles
   └─ Storage : bucket privé « pharmacy-documents »
Leaflet + OpenStreetMap (carte), PWA (manifeste + service worker prudent)
```

Choix principaux :

- **La logique critique vit dans PostgreSQL** (`supabase/migrations/`). Commandes, réservations, transitions de statut, validations, statistiques : tout passe par des fonctions qui vérifient `auth.uid()` et les rôles, dans une transaction unique. L'interface ne peut pas contourner ces règles, même avec la clé publique.
- **Aucune écriture directe** n'est accordée sur les tables sensibles (`orders`, `stock_reservations`, `user_roles`, `audit_logs`…). Les quantités et prix ne se modifient que via `set_inventory()` (un déclencheur bloque les mises à jour directes).
- **Le public ne voit jamais les quantités exactes** : la recherche renvoie un indicateur de fraîcheur, pas le stock.
- **Pages légères** : pas de client Supabase dans le navigateur (les suggestions passent par `/api/suggestions`), pas de police web, pas de préchargement des liens, logos en WebP. Page d'accueil ≈ 126 ko de JS.
- **Hors ligne** : le service worker ne met en cache que les fichiers statiques et une page « hors connexion ». Aucune donnée de stock n'est conservée hors ligne.
- Extensible à d'autres pays : `regions.country_code`, téléphones au format E.164, devise portée par la colonne `*_xof`.

Arborescence :

```
supabase/migrations/   10 migrations SQL versionnées (schéma, fonctions, RLS, stockage, données de référence, démo)
src/app/               pages (public, compte, pharmacien, admin, livraison), actions serveur, routes API
src/components/        interface (ui/, orders/, pharmacy/, map/…)
src/lib/               supabase, validation (zod), formatage, CSV, limitation de débit, CSP, journalisation, notifications
src/proxy.ts           session, pages protégées, CSP à jeton (convention « proxy » de Next.js 16)
scripts/demo.mjs       installation / suppression des données de démonstration
tests/unit/            tests unitaires (Vitest)
tests/db/              tests base de données : RLS, concurrence, transitions (PostgreSQL réel)
tests/e2e/             parcours navigateur + pile Supabase locale sans Docker
```

## 3. Démarrage rapide

Prérequis : Node.js ≥ 20.9 (22 recommandé), un projet Supabase (hébergé, ou local avec la [CLI Supabase](https://supabase.com/docs/guides/cli) et Docker).

```bash
npm install
cp .env.example .env.local      # puis renseigner les valeurs (voir §4)
npm run dev                     # http://localhost:3000
```

Variables (`.env.local`) :

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL publique (liens des e-mails). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projet Supabase (clé **anon** publique uniquement). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Serveur uniquement. Recommandée en production** : limitation de débit partagée entre instances, route de maintenance, suppression définitive des comptes, script de démonstration. |
| `CRON_SECRET` | Protège `/api/cron/maintenance`. |
| `SUPABASE_TIMEOUT_MS` | Délai maximum d'un appel à Supabase (défaut 10 000 ms). |
| `APP_ENV` | `production` interdit l'installation des données de démonstration. |
| `DEMO_PASSWORD` | Mot de passe des comptes de démonstration (aléatoire si vide). |

## 4. Configuration de Supabase

1. **Créer le projet** (région la plus proche des utilisateurs disponible).
2. **Appliquer les migrations** — le plus simple : coller `supabase/installation-complete.sql` dans *SQL Editor* et l'exécuter une fois (toutes les migrations + la maintenance pg_cron). Ou, en ligne de commande :
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push            # applique supabase/migrations/*.sql dans l'ordre
   ```
   À défaut, exécuter les fichiers de `supabase/migrations/` dans l'ordre depuis l'éditeur SQL.
   Les migrations créent : extensions (`pg_trgm`, `unaccent`, `pgcrypto`), tables, index, contraintes, fonctions, politiques RLS, bucket privé `pharmacy-documents`, régions officielles (Loi n°2023-006), communes du District de Bamako, catégories de produits, pages d'information provisoires.
3. **Authentification** (Authentication › Providers / URL Configuration) :
   - activer E-mail + mot de passe et la **confirmation de l'adresse e-mail** ;
   - *Site URL* = `NEXT_PUBLIC_SITE_URL` ; *Redirect URLs* : `https://votre-domaine/auth/callback` ;
   - longueur minimale du mot de passe : 8 ; laisser actives les limites de débit de Supabase Auth ;
   - configurer un **SMTP** dédié : **obligatoire**, car sans lui Supabase n'envoie les e-mails qu'aux membres de l'équipe du projet (2 par heure).
4. **Maintenance automatique** (toutes les 10 minutes) : expiration des demandes et réservations, purge des données périmées, comptage des incohérences. Au choix :
   - **pg_cron** (recommandé, inclus dans Supabase) — dans l'éditeur SQL :
     ```sql
     create extension if not exists pg_cron;
     select cron.schedule('pharmaproxi-maintenance', '*/10 * * * *', $$select public.run_maintenance()$$);
     ```
   - **Vercel Cron** (secours) : `vercel.json` appelle `/api/cron/maintenance` une fois par jour (seule fréquence acceptée par l'offre gratuite de Vercel ; une fréquence plus élevée y fait échouer le déploiement) (en-tête `Authorization: Bearer CRON_SECRET`, nécessite `SUPABASE_SERVICE_ROLE_KEY`). pg_cron reste la méthode principale.
   - Les administrateurs peuvent aussi la lancer depuis *Administration › Intégrité*. Le tableau de bord affiche une alerte si elle n'a pas tourné depuis plus d'une heure.
5. **Géographie** : seules les régions et les communes de Bamako sont livrées. Importer cercles, communes et quartiers depuis *Administration › Géographie* (CSV `region;cercle;commune;quartier;source`) à partir d'une source officielle.

## 5. Premier administrateur et données de démonstration

**Aucun compte administrateur n'est créé par défaut.** Créer un compte via `/inscription`, puis dans l'éditeur SQL (rôle `postgres`) :

```sql
select public.bootstrap_admin('adresse@exemple.ml');
```

Cette fonction n'est pas appelable depuis l'application. Les administrateurs suivants sont nommés depuis *Administration › Utilisateurs*.

**Données de démonstration** (jamais en production) :

```bash
npm run demo:install     # 5 comptes demo.*@pharmaproxi.invalid + 3 pharmacies « DÉMO » fictives, produits, commande de test
npm run demo:uninstall   # supprime toutes les lignes is_demo et les comptes de démonstration
```

Les pharmacies s'appellent « Pharmacie DÉMO … », portent un badge « Démonstration », sont exclues des statistiques, et leurs prix et stocks sont fictifs. Le script **active la livraison** pour permettre de tester l'espace livreur et la **désactive à la désinstallation**. Il refuse de s'exécuter si `APP_ENV=production`.

## 6. Déploiement (Vercel)

1. Importer le dépôt dans Vercel (framework détecté : Next.js).
2. Renseigner les variables d'environnement (Production et Preview). `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** être préfixée `NEXT_PUBLIC_`.
3. Déployer, puis mettre à jour *Site URL* et *Redirect URLs* dans Supabase.
4. Vérifications après déploiement : inscription + e-mail de confirmation, recherche, dépôt d'un justificatif, validation par un administrateur, commande de test, expiration (pg_cron), en-têtes de sécurité (CSP, `X-Frame-Options`).

Autres hébergeurs : toute plateforme Node.js (`npm run build && npm start`).

## 7. Tests

```bash
npm run typecheck
npm run test:unit                                   # 34 tests : formatage, CSV, fraîcheur, validation, limitation, CSP, pagination, plannings
PP_TEST_PG=postgres://postgres@localhost:5432/postgres npm run test:db   # 80 tests sur PostgreSQL réel (dont charge, concurrence et annuaire)
```

**Tests base de données** (`tests/db/`) : chaque fichier crée une base vierge, y applique un shim minimal de Supabase (`auth.uid()`, rôles `anon`/`authenticated`, schéma `storage`) puis toutes les migrations, et exécute les requêtes sous l'identité de chaque rôle, comme PostgREST. Ils couvrent notamment :

- accès inter-comptes (client ↔ client, pharmacie ↔ pharmacie, livreur non affecté) ;
- impossibilité de s'auto-attribuer un rôle, de se déclarer vérifié, de modifier un stock hors fonction ;
- confirmations **concurrentes** ne dépassant pas le stock ; demandes simultanées avec la même clé ;
- cycle complet retrait / livraison, échecs, annulations, remboursements, expirations ;
- fraîcheur, filtres, tri, pagination, multi-mots, journal de recherche anonyme ;
- import CSV, fusion de doublons, suspension / réactivation, démo installable et supprimable ;
- annuaire : données privées invisibles, double acceptation, médecin non vérifié jamais publié, consentement obligatoire, liste de contrôle exigée, recherche par spécialité / jour / langue, absences, fraîcheur, signalements.

**Parcours navigateur** (`tests/e2e/`) : `local-stack/start.sh` démarre une pile Supabase minimale **sans Docker** (PostgreSQL + binaires GoTrue et PostgREST + passerelle), puis `flows.mjs` rejoue 30 étapes dans Chromium (mobile 390 px) : recherche, inscription, demande, confirmation, préparation, remise, stock, conflit de modification, équipe, livraison complète, intégrité, refus d'accès, annuaire (recherche de spécialiste, fiche médecin, fiche clinique, espace médecin, espace établissement, validation administrateur), absence de défilement horizontal à 390 px. Le parcours échoue s'il rencontre une erreur JavaScript, une erreur serveur, ou une interface qui ne se met pas à jour sans rechargement. Captures dans `tests/e2e/screenshots/`.

```bash
BIN=/chemin/binaires PGURL=postgres://postgres@localhost:54322 tests/e2e/local-stack/start.sh
CHROME_PATH=/chemin/chromium DEMO_PASSWORD=... node tests/e2e/flows.mjs
```

## 8. Sécurité et protection des données

- **RLS activée sur les 36 tables** ; politiques testées. Les permissions sont imposées en base, pas seulement dans l'interface.
- **Rôles** : client, pharmacien, livreur, administrateur (`user_roles`). Rôle pharmacien accordé à l'inscription d'une pharmacie (sans vérification), rôle livreur accordé à la validation.
- **Données privées séparées** : informations réglementaires (`pharmacy_private`), message du client (`order_private_notes`). Un administrateur n'y accède qu'avec une justification, **journalisée** (`admin_read_order_note`).
- **Aucune donnée médicale demandée** ; les notes affichent un avertissement.
- **Justificatifs** : bucket privé, chemins cloisonnés par pharmacie, liens signés de 5 minutes, formats et taille contrôlés.
- **Entrées** validées côté serveur (zod) et en base (contraintes, `CHECK`, fonctions).
- **Sessions** : cookies httpOnly gérés par `@supabase/ssr`, rafraîchis par `src/proxy.ts` ; pages protégées redirigées côté serveur.
- **Limitation de débit** : en base pour les demandes, signalements, adresses et fiches catalogue (impossible à contourner, même en appelant l'API directement) ; partagée entre instances pour les connexions échouées, inscriptions, réinitialisations et recherches (table `rate_limit_events`, clés hachées, clé de service requise, repli en mémoire sinon) ; en mémoire pour les suggestions. S'ajoute aux limites de Supabase Auth.
- **CSP à jeton** : chaque page reçoit un jeton aléatoire ; seuls les scripts qui le portent s'exécutent (`script-src 'nonce-…' 'strict-dynamic'`, plus de `'unsafe-inline'`).
- **En-têtes** : CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Journal d'audit** non modifiable depuis l'application : décisions sur les pharmacies et livreurs, rôles, paramètres, catalogue, géographie, accès sensibles, annulations administratives.
- Redirections internes uniquement (pas de redirection ouverte), aucune clé secrète dans le code client.

## 9. Sauvegardes, conservation et suppression des données

- **Sauvegardes** : activer les sauvegardes quotidiennes de Supabase (et la restauration à un instant donné — PITR — sur les offres qui la proposent). Exporter chaque semaine une copie chiffrée hors de Supabase (`pg_dump`) et le contenu du bucket des justificatifs.
- **Restauration** : tester au moins une fois par trimestre la restauration dans un projet de test (migrations + `pg_restore`), puis vérifier les tests de `tests/db`.
- **Conservation** (à faire valider juridiquement) : commandes et mouvements de stock conservés pour la durée légale applicable ; journaux de recherche anonymes ; justificatifs conservés tant que la pharmacie est active, puis supprimés après la durée légale.
- **Suppression de compte** : depuis « Mon compte ». Le profil est anonymisé, les adresses et notifications supprimées, l'identifiant de connexion supprimé si la clé de service est configurée. L'historique des commandes reste rattaché à un identifiant anonyme.

## 10. Robustesse et exploitation

**Ce qui protège les données :**
- **Transactions et verrous** : réservations, remises, annulations et expirations verrouillent les lignes dans un ordre stable ; testé avec 30 à 60 opérations simultanées sur le même stock (aucune survente, un seul état final par commande).
- **Idempotence** : 20 envois simultanés de la même demande créent une seule commande ; un statut appliqué deux fois ne déduit pas deux fois le stock.
- **Concurrence optimiste** : chaque ligne de stock porte une version. Si une vente ou un collègue l'a modifiée depuis l'affichage, l'enregistrement est refusé avec la valeur actuelle, au lieu d'écraser silencieusement.
- **Imports simultanés** : traités dans un ordre stable, sans interblocage ni doublon de fiche catalogue.
- **Contrôle d'intégrité** (`integrity_issues()`, page *Administration › Intégrité*) : compare réservations, stocks, commandes, totaux et affectations de livreurs. Une réparation sûre et journalisée recalcule les réservations si une intervention manuelle en base les a faussées.

**Ce qui garde le service disponible :**
- Délai maximum sur chaque appel à Supabase (10 s) ; si l'authentification ou la base ne répond pas, les pages publiques restent servies en mode visiteur.
- Délais maximum d'exécution SQL (5 s visiteurs, 10 s utilisateurs connectés).
- Pages d'erreur par espace : une erreur dans l'administration n'empêche pas de naviguer ailleurs.
- Erreurs inattendues journalisées (JSON, sans donnée personnelle) avec une **référence affichée à l'utilisateur** pour le support.
- Vérification de la configuration au démarrage (`src/instrumentation.ts`) : variables manquantes signalées dans les journaux.

**Surveillance :**
- `GET /api/health` : 200 si la base répond, 503 sinon ; signale aussi une maintenance arrêtée ou des incohérences critiques. À brancher sur un service de surveillance (UptimeRobot, Better Stack…) avec une alerte par SMS ou e-mail.
- Journaux structurés : rechercher `"level":"error"` et la référence communiquée par l'utilisateur.
- Table `maintenance_runs` : historique des 30 derniers jours.

**Intégration continue** (`.github/workflows/ci.yml`) : à chaque push, types, tests unitaires, tests base de données (dont charge et concurrence), build, puis parcours navigateur complet sur une pile Supabase locale. Le flux n'a pas pu être exécuté sur GitHub depuis l'environnement de développement : à vérifier au premier push.

**Procédure en cas d'incident** : voir `docs/PROCEDURES-ADMINISTRATION.md` § Incidents techniques.

## 11. Évolutions prévues

- **Paiement mobile** (Orange Money, Moov Money…) : non intégré. Le modèle de données distingue déjà le mode de paiement et l'état (non payé / payé confirmé / remboursement). Une intégration ajoutera une table de transactions alimentée **uniquement** par les notifications signées du prestataire.
- **SMS / WhatsApp / e-mail** : `notification_outbox` + interface `src/lib/notifications/providers.ts`. Aucun envoi n'est simulé.
- Pharmacies de garde, application mobile (la PWA s'installe déjà), autres pays d'Afrique de l'Ouest.
