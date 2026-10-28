# État des fonctionnalités — PharmaProxi v0.3

Bilan honnête au 27 octobre 2026. « Vérifié » signifie couvert par les tests automatisés (base de données, unitaires et/ou parcours navigateur sur une pile locale GoTrue + PostgREST + PostgreSQL).

## ✅ Terminé et vérifié

**Base de données et sécurité**
- 11 migrations SQL versionnées, 47 tables, RLS sur toutes, clés étrangères, index (trigrammes pour la recherche), contraintes d'intégrité et longueurs de texte bornées.
- Rôles client / pharmacien / livreur / administrateur ; aucune auto-attribution possible.
- Accès inter-comptes bloqués ; 80 tests sur PostgreSQL réel (114 avec les tests unitaires) et 30 étapes de parcours navigateur, dont 7 tests de charge et de concurrence.
- Limites anti-abus imposées en base (demandes, signalements, adresses, fiches catalogue) et limitation de débit partagée entre instances.
- Concurrence optimiste sur les stocks, imports simultanés sans doublon ni interblocage.
- Contrôle d'intégrité, réparation journalisée des réservations, maintenance planifiée (expirations + purges).
- Journal d'audit, accès sensible justifié et journalisé.

**Espace public / client**
- Accueil (logo, recherche centrale, localisation région → commune → quartier, « Trouver un médicament », « Pharmacies autour de moi », pharmacies récemment mises à jour — données réelles uniquement, fonctionnement, sécurité).
- Recherche : nom commercial, générique, principe actif ; casse, accents, espaces, fautes légères, mots dans le désordre ; suggestions ; filtres (zone, prix, distance, disponibles, ouvertes selon horaires vérifiés) ; tri (pertinence, disponibilité récente, prix, proximité) ; pagination.
- Quatre niveaux de fraîcheur, date et heure de mise à jour toujours affichées ; une information ancienne n'est jamais présentée comme disponible.
- Carte OpenStreetMap, repli manuel si la géolocalisation est refusée.
- Fiche pharmacie (statut de vérification, horaires, contacts, itinéraire, produits, prix), fiche produit.
- Inscription / connexion / mot de passe oublié, profil, adresses, notifications, suivi de commande, annulation, signalements, suppression de compte (anonymisation).

**Espace pharmacien**
- Inscription en attente de vérification, dépôt de justificatifs, nouvelle soumission après refus.
- Tableau de bord (produits, disponibles, indisponibles, stock faible, stocks anciens, commandes par état, mouvements).
- Équipe : le propriétaire ajoute et retire des collaborateurs (stocks et commandes) ; justificatifs et équipe réservés au propriétaire.
- Stocks : ajout depuis le catalogue partagé ou création dédoublonnée, mise à jour rapide sur téléphone, confirmation « à l'identique » groupée, lots et péremptions, import CSV validé ligne par ligne, export CSV, historique.
- Commandes : confirmation (réservation transactionnelle), refus motivé, préparation, prête, remise, paiement reçu, annulation motivée.

**Espace administrateur**
- Indicateurs réels par période et région, export CSV non sensible.
- Validation / refus / suspension / réactivation avec liste de contrôle et motif ; vérification des horaires.
- Catalogue : fiches à vérifier, détection et fusion des doublons, catégories (autorisée, ordonnance, livraison).
- Utilisateurs et rôles, livreurs, supervision des commandes, affectation, annulation d'incident, remboursements, signalements, géographie (ajout + import CSV), paramètres, pages d'information, journal d'audit (paginé).
- Intégrité : anomalies détectées en direct, historique des maintenances, alerte si la maintenance planifiée ne tourne pas.

**Annuaire médical (nouveau en v0.3)**
- 31 spécialités de référence regroupées par famille, modifiables par l'administration ; page « Quel spécialiste pour quoi ? ».
- Recherche de médecins (spécialité, nom, région / commune / quartier, langue, genre, établissement, jour, « consulte aujourd'hui », distance) et d'établissements (type, services, urgences 24 h/24) ; résultats en liste et sur carte ; ordre neutre.
- Fiches publiques médecin et établissement : vérification, fraîcheur, plannings par lieu, absences en cours, appel / WhatsApp / partage, pharmacies proches, signalement.
- Espace médecin : référencement avec consentement, justificatifs, lieux d'exercice, plannings, absences, confirmation périodique, retrait de la publication.
- Espace établissement : inscription, justificatifs, équipe, invitation de médecins vérifiés, acceptation des demandes, horaires et services.
- Administration : files de validation, liste de contrôle en 5 points, consultation des justificatifs, fiches à confirmer, spécialités, indicateurs de l'annuaire, intégrité.
- Rappels automatiques de confirmation (maintenance planifiée), bandeau des numéros d'urgence (renseignés par l'administration).

**Annuaire des pharmacies non inscrites (v0.3.1)**
- Fiches simples (nom, zone, adresse, téléphone, position) pour les officines qui n'ont pas encore rejoint PharmaProxi : sans stock ni prix, clairement signalées « pas encore inscrite ».
- Page publique `/pharmacies` (pharmacies inscrites + non inscrites, recherche par nom, zone, proximité) et repères blancs sur la carte.
- Administration : import CSV (point-virgule ou virgule, UTF-8 ou Windows-1252, numéros maliens normalisés, doublons ignorés, erreurs ligne par ligne), ajout manuel, masquage, suppression, rattachement à la pharmacie inscrite correspondante (suggestions par ressemblance du nom), journal d'audit.

**Registres publics (v0.4.0)**
- **Tableau de l'Ordre des médecins** (édition 2025 : 4 330 médecins) : recherche publique par nom, spécialité, région (conseil régional) et structure ; aucune coordonnée personnelle ; badge « Inscrit au Tableau » ; lien vers l'établissement ; pas de doublon avec les fiches vérifiées (même n° d'inscription). Import annuel par CSV depuis l'administration ; masquage durable à la demande d'un médecin.
- 10 spécialités ajoutées pour couvrir le Tableau (santé publique, médecine d'urgence, chirurgie thoracique et cardiovasculaire…).
- **Établissements non vérifiés** : fiches simples (type, ville, téléphones) affichées sur `/cliniques` avec le badge « Non vérifié » ; import CSV, masquage, suppression.

**Commandes et livraison**
- Demande → confirmation → réservation → retrait ou livraison → clôture ; 13 statuts ; idempotence ; concurrence ; expiration ; échecs ; incidents ; remboursements.
- Livraison : désactivée par défaut, catégories autorisées une à une, ordonnance jamais livrée, livreurs vérifiés uniquement, collecte / remise / échec / incident.

**Exploitation et sécurité**
- Next.js 16 ; CSP à jeton par requête (aucun script inline non signé) ; en-têtes de sécurité.
- Délai maximum sur tous les appels à la base ; site public maintenu en mode visiteur si l'authentification tombe.
- Pages d'erreur par espace, journalisation structurée avec référence d'erreur, vérification de la configuration au démarrage, `/api/health`.
- Intégration continue GitHub Actions (non encore exécutée : à vérifier au premier push).

**Autres**
- PWA (manifeste, icônes, service worker sans cache des stocks, page hors connexion), interface responsive vérifiée à 390 px, FCFA, heure du Mali, numéros +223.
- Données de démonstration installables et supprimables ; aucun compte administrateur par défaut.

## 🟡 Partiellement terminé

| Élément | Ce qui manque |
|---|---|
| Géographie | Seules les 19 régions + District de Bamako (Loi n°2023-006) et les 6 communes de Bamako sont fournies. Cercles, communes et quartiers des régions sont à **importer depuis une source officielle** (outil d'import prêt). |
| Catalogue de référence | Vide au départ (aucune donnée inventée). Il se remplit par les pharmacies et l'administration ; un import depuis la liste nationale des médicaments autorisés (DPM) reste à faire. |
| Notifications | Internes : fonctionnelles. SMS / WhatsApp / e-mail : architecture prête (`notification_outbox`, interface fournisseur), aucun prestataire branché. |
| Pages juridiques | Textes **provisoires** (confidentialité, conditions, contact) à faire valider par un juriste ; modifiables depuis l'administration. |
| Liste des spécialités | 31 spécialités usuelles fournies ; libellés et regroupements à **valider avec l'Ordre des médecins du Mali**. |
| Numéros d'urgence | Champ vide par défaut (aucun numéro inventé) : à renseigner par l'administration (*Paramètres › emergency_numbers*) après vérification. |
| Prise de rendez-vous en ligne | Non incluse : l'annuaire affiche le numéro de rendez-vous de chaque lieu. |

### Corrigé dans la v0.3

- **Message de confirmation qui disparaissait** avec le bouton remplacé (confirmation de commande, paiement, etc.) : il s'affiche désormais en bandeau persistant après l'action.
- **Liste des stocks** : pagination côté serveur (100 lignes par page, recherche et filtres en base) au lieu d'un chargement complet.
- **Changement de propriétaire d'une pharmacie** : écran dédié dans *Administration › Pharmacies › fiche*, avec motif obligatoire et journal d'audit.

### Corrigé dans la v0.2

- **Boutons bloqués sur « Envoi… »** : défaut du routeur de Next.js 15.5. Le nouveau rendu renvoyé après une action n'était parfois pas appliqué, alors que la réponse du serveur était complète. Mesuré jusqu'à 11 échecs sur 16 sur « Mon compte », y compris dans un Chromium complet. Corrigé par la migration vers **Next.js 16** : 0 blocage sur 3 parcours complets dans 2 navigateurs, et le banc de test échoue désormais au moindre blocage.
- **Imports CSV simultanés** : une ligne pouvait échouer (doublon de fiche) et les deux imports se bloquaient mutuellement (22 s). Désormais sans erreur ni attente (0,16 s).
- **Limitation de débit** par instance seulement : désormais partagée en base.
- **Membres d'une pharmacie** : l'écran de gestion de l'équipe existe.

## ⚪ Non configuré (nécessite des identifiants ou décisions externes)

| Élément | Action requise |
|---|---|
| Projet Supabase de production | Créer le projet, appliquer les migrations, configurer Auth (SMTP, URL), activer les sauvegardes. |
| Maintenance planifiée | Activer pg_cron (requête fournie dans le README) ou Vercel Cron + `CRON_SECRET`. Sans elle, les demandes et réservations n'expirent pas (l'administration est alertée). |
| Paiement mobile | Non intégré (aucune transaction simulée). Seuls « paiement à la pharmacie » et « à la livraison » existent, confirmés manuellement. |
| SMS / WhatsApp / e-mail transactionnels | Choisir un prestataire, ajouter ses clés côté serveur, écrire le worker d'envoi. |
| Stockage des justificatifs | Les buckets (pharmacies et annuaire) sont créés par les migrations ; non testé de bout en bout ici (le stockage Supabase n'était pas émulé localement). À tester sur le projet réel : dépôt, consultation par l'administrateur, suppression. |
| Domaine, hébergement, supervision | Nom de domaine, Vercel, brancher `/api/health` sur un service de surveillance avec alerte. |
| Intégration continue | Le flux GitHub Actions est écrit mais n'a pas pu être exécuté depuis l'environnement de développement : vérifier au premier push. |
| Validation juridique de l'annuaire | Conditions de publication, consentement des médecins et règles déontologiques (publicité interdite) à faire valider par un juriste et l'Ordre des médecins avant l'ouverture. |
| Livraison | Désactivée tant que les vérifications réglementaires ne sont pas faites (voir `VERIFICATIONS-REGLEMENTAIRES.md`). |
