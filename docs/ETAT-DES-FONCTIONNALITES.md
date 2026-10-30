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

**Santé essentielle (v0.9.0)**
- Page `/sante` (menu, accueil, pied de page) : recherche, 10 catégories, rubriques « Informations essentielles », « Questions les plus recherchées », « Idées reçues et vérités médicales », « Prévention et dépistage », « Dernières informations vérifiées », filtres (catégorie, public, type d'information — sans évaluer de risque individuel), accès à l'annuaire (médecins, rendez-vous, laboratoires, pharmacies, cliniques).
- Rubrique prioritaire `/sante/mariage` : examens classés en « généralement recommandé », « selon votre situation », « sur avis médical » ; **module groupes sanguins** (transfusion, grossesse et Rhésus, transmission — jamais présenté comme un critère de mariage) ; **simulateur drépanocytose** AA/AS/AC/SS/SC/CC (probabilités théoriques par grossesse, schéma 2 × 2, limites expliquées, calcul dans le navigateur, rien n'est enregistré ni envoyé).
- Fiche standard (`/sante/fiche/…`) : résumé, définition, importance, situations, prévention, examens, déroulement, préparation, résultats, quand consulter, signes d'urgence, idées reçues, FAQ, sources (organisme, lien, dates de publication et de consultation), rédacteur, validateur et sa qualification, dates de publication et de révision, « Où faire l'examen » (laboratoires référencés), « Quel professionnel consulter », signalement d'information obsolète, rappel « ne remplace pas une consultation ».
- Recherche globale `/sante/recherche` : fiches (synonymes via mots-clés, fautes de frappe via trigrammes), examens, médicaments du catalogue, spécialités, médecins, établissements, groupes sanguins.
- Espace `/redaction-sante` : rôles rédacteur et validateur médical (attribués par l'administration, avec nom et qualification affichés), brouillon → soumission → validation (jamais par l'auteur) / correction / rejet → publication / dépublication ; toute modification d'une fiche validée ou publiée la renvoie en brouillon et la retire du public ; historique complet ; signalements du public ; catégories en base.
- Contenu de départ : 15 fiches « Avant le mariage » (13 examens + FAQ + idées reçues) **en brouillon**, sources consultées le 29/10/2026 (OMS, OMS Afrique, ONUSIDA, Manuel MSD) ; aucune n'est publiée tant qu'un professionnel de santé ne l'a pas validée.
- Prévu sans être livré : traductions en bambara (colonne `lang` prête), illustrations, fiches des 9 autres catégories (à rédiger et valider).

**Rubrique « Prendre rendez-vous » (v0.8.0)**
- Page `/rendez-vous` (barre du bas sur téléphone, menu, accueil, annuaire) : uniquement les médecins vérifiés qui ont ouvert leur agenda en ligne ; recherche par spécialité, région/commune, nom du médecin ou de la clinique, proximité ; filtre « réservable tout de suite ».
- Pour chaque lieu : mode (réservation immédiate ou demande confirmée), tarifs, moyens de paiement, nouveaux patients acceptés, **4 prochains créneaux cliquables** qui mènent directement à la confirmation.
- **Déplacer un rendez-vous** (patient) : nouveau créneau libre du même lieu et du même motif, dans le délai fixé par le cabinet ; l'ancien créneau est libéré, le cabinet est prévenu, le rappel est reprogrammé.
- **Statistiques** (espace médecin et secrétariat d'établissement) sur 30 jours, 90 jours ou 12 mois : volume, honorés, taux d'absence, taux d'annulation (patient / cabinet), part prise en ligne, remplissage des 7 prochains jours, consultations de la fiche, repère anonyme de la spécialité (médiane, à partir de 5 médecins comparables), pistes d'amélioration.
- **Laboratoires** : 19 laboratoires privés de la liste officielle de la DPM (12/12/2023) ; 13 « autorisés » publiés avec le badge « Autorisé — liste DPM », 6 masqués en attendant confirmation (statut vide ou « en cours ») ; noms des bénéficiaires non repris ; téléphones à ajouter après vérification.
- **Annonces** (Administration › Annonces) : message à tous les inscrits ou à un groupe (clients, pharmaciens, médecins, établissements, livreurs), dans la cloche du compte et par e-mail (un e-mail par personne, jamais de liste visible) ; modèle « Bienvenue » envoyé une seule fois par personne ; bienvenue automatique à chaque inscription (compte + e-mail) ; historique avec le nombre de notifications et d'e-mails envoyés ; comptes de démonstration exclus.
- **Page Contact** : texte modifiable (Administration › Contenus) et formulaire (sujet, nom, e-mail ou téléphone, message), avec ou sans compte ; liens « Signalez-le-nous » qui préremplissent le sujet ; boîte de réception Administration › Messages (nouveaux, en cours, traités, note interne) ; notification des administrateurs ; anti-abus (champ piège, 5 messages par heure) ; purge des messages traités après 2 ans.
- Toujours exclus : documents médicaux transmis au cabinet, téléconsultation, paiement en ligne (hébergement agréé et prestataires nécessaires) ; rappels SMS/WhatsApp (prestataire d'envoi à brancher) ; prise de rendez-vous en laboratoire (les laboratoires doivent d'abord s'inscrire).

**Services pratiques (v0.7.0)**
- **Pharmacies de garde** (`/garde`) : en ce moment ou sur 7 jours, par région/commune ou par proximité ; date, horaires, adresse, téléphone, WhatsApp, itinéraire ; source affichée (tableau officiel importé par l'administration) ou mention « déclarée par la pharmacie ». Import CSV du tableau, ajout manuel, déclaration par la pharmacie depuis son tableau de bord ; badge « De garde » sur la fiche de la pharmacie.
- **Laboratoires et examens** (`/laboratoires`) : catalogue de 31 examens courants (biologie, imagerie, ECG) ; établissements qui déclarent les réaliser ; tarifs et délais **uniquement s'ils ont été communiqués**, avec source et date ; comparaison par tarif. Import CSV des examens ; établissements importables « masqués » tant que leurs coordonnées ne sont pas confirmées.
- **Alertes de disponibilité** : « M'alerter » sur la fiche d'un produit introuvable (zone choisie, 30 jours, 10 alertes max) ; notification unique quand une pharmacie vérifiée de la zone le déclare disponible ; page `/compte/alertes`.
- **Signaux de demande** pour les pharmacies (tableau de bord) : produits recherchés dans leur zone qu'elles ne déclarent pas disponibles, en nombre de personnes, sans identité.
- **Observatoire des ruptures** (administration) : alertes demandées et recherches sans résultat (à partir de 3 occurrences), agrégées et anonymes, sur 7/30/90 jours.
- **Urgences** (`/urgences`) : numéros d'urgence renseignés par l'administration, services d'urgence et établissements 24 h/24, ambulances, accès aux pharmacies de garde.
- **WhatsApp** : message prérempli (« avez-vous … disponible ? ») sur les résultats de recherche, la fiche pharmacie et les gardes.
- **Mode léger** : les 15 dernières pharmacies et médecins consultés (nom, zone, téléphone) restent sur le téléphone et s'affichent sur l'accueil, la page Urgences et la page hors connexion ; jamais de stock hors ligne.
- Non inclus, avec la raison : dossier santé personnel et téléconsultation (hébergement agréé de données de santé et cadre réglementaire) ; vérification d'authenticité des médicaments (données officielles de la DPM nécessaires) ; soins à domicile et paramédicaux (circuit de vérification des diplômes à définir avec les ordres) ; assurances et mutuelles (conditions de prise en charge à obtenir des organismes) ; assistant multilingue et fiches en bambara (validation par des professionnels de santé) ; approvisionnement auprès des grossistes ; « profil mis en avant » payant (contraire à l'ordre neutre de l'annuaire).

**Réservation en ligne par créneaux (v0.6.0)**
- Motifs de consultation (durée, nouveaux patients / patients suivis, consignes, tarif indicatif déclaré), par lieu ou pour tous les lieux.
- Deux modes par lieu : **réservation immédiate** d'un créneau libre (calculé à partir des horaires, de la durée du motif, des absences, des plages bloquées et des rendez-vous existants, tous lieux confondus) ou **demande à confirmer**.
- Aucune double réservation, même en cas de clics simultanés (verrou par médecin, testé avec 6 réservations concurrentes).
- Prochaine disponibilité affichée dans les résultats et sur la fiche ; informations pratiques (présentation, tarifs, moyens de paiement, nouveaux patients acceptés, accès).
- Proches (enfants, parents) ; délai minimum de réservation et délai d'annulation en ligne ; ajout à l'agenda du téléphone (.ics) ; reprendre rendez-vous.
- Liste d'attente : alerte quand un créneau se libère ; rappel la veille (notification + SMS en file d'attente).
- Agenda du jour pour le médecin et le secrétariat ; rendez-vous saisis par téléphone ; plages bloquées.
- Non inclus (hébergement agréé de données de santé et prestataires nécessaires) : téléconsultation vidéo, ordonnances et documents médicaux, paiement en ligne, messagerie patient-médecin.

**Rendez-vous (v0.5.0)**
- Demande de rendez-vous en ligne depuis la fiche d'un médecin vérifié, sur les lieux où le médecin ou l'établissement a ouvert les demandes : jour de consultation + moment de la journée, nom du patient (soi ou un proche), téléphone, motif facultatif.
- Contrôles : jours et heures de consultation, absences annoncées, 60 jours maximum, 3 demandes en attente par patient, une demande par médecin et par jour, anti-doublon.
- Le médecin ou le secrétariat confirme avec une heure, propose un autre moment (le patient accepte ou refuse) ou refuse avec un motif ; annulation des deux côtés ; clôture « honoré / patient absent ».
- Expiration automatique sous 48 h (maintenance planifiée), notifications à chaque étape, motif visible uniquement du patient, du médecin et du secrétariat (pas de l'administration).
- Pas de téléconsultation, pas de paiement, pas de conseil médical. Rappels SMS : à brancher avec un prestataire.

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
