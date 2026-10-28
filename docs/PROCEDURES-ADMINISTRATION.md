# Procédures d'administration

Toutes les décisions ci-dessous sont enregistrées dans le **journal d'audit** (auteur, date, objet, motif).

## Validation d'une pharmacie

1. *Administration › Pharmacies › En attente de vérification* : ouvrir la demande.
2. Contrôler les informations déclarées et **chaque justificatif** (liens temporaires de 5 minutes, à ne pas télécharger sur un appareil non sécurisé).
3. Vérifier auprès des sources officielles : autorisation d'ouverture, inscription du pharmacien responsable à l'Ordre, identité, adresse, téléphone (appel de contrôle).
4. Cocher les cinq points de contrôle. La validation est impossible sans justificatif déposé et sans les cinq coches.
5. Décider :
   - **Valider** → la pharmacie devient visible du public.
   - **Refuser** (motif obligatoire, visible par la pharmacie) → elle peut corriger et soumettre à nouveau.
6. Si les horaires ont été confirmés (appel, visite), cliquer « Marquer les horaires comme vérifiés ». Toute modification ultérieure des horaires par la pharmacie annule cette vérification.

## Suspension et réactivation

- **Suspendre** (motif obligatoire) en cas de fermeture, de sanction, de signalement grave ou d'informations frauduleuses. La pharmacie disparaît immédiatement des recherches et ne peut plus modifier ses données ni ses stocks. Les commandes en cours restent visibles ; les annuler si nécessaire depuis *Commandes*.
- **Réactiver** après contrôle, avec un commentaire.

## Livreurs

1. *Administration › Livreurs* : candidatures « En attente ».
2. Vérifier l'identité (pièce officielle en présentiel ou via un processus validé), le moyen de transport et la zone.
3. Saisir la **référence de la pièce vérifiée** (obligatoire pour habiliter) puis « Vérifier ».
4. Suspendre ou refuser avec motif en cas de problème. Le rôle livreur est retiré automatiquement.

## Commandes et incidents

- *Attente livreur* : affecter un livreur vérifié et disponible. Les commandes contenant un produit sur ordonnance ou d'une catégorie non autorisée à la livraison sont refusées par le système.
- *Échecs* et incidents : consulter les incidents déclarés par le livreur, contacter la pharmacie et le client ; annuler avec motif si nécessaire (le stock est libéré).
- *Remboursements à traiter* : effectuer le remboursement hors plateforme puis le marquer « remboursé » avec la référence.
- **Message privé du client** : accessible uniquement avec une justification d'au moins 15 caractères, journalisée. À n'utiliser que pour un litige ou à la demande du client.

## Catalogue

- Les fiches créées par les pharmacies sont « en vérification » mais utilisables. Les approuver, ou les rejeter si elles sont erronées.
- *Doublons probables* : fusionner en conservant la fiche la plus complète ; les stocks des pharmacies sont regroupés automatiquement.
- *Catégories* : n'activer la **livraison** d'une catégorie qu'après la vérification réglementaire. Une catégorie sur ordonnance ne peut jamais être livrable.

## Paramètres sensibles

- `delivery_enabled` : exige de cocher « Vérification réglementaire effectuée ».
- `stock_fresh_hours` / `stock_stale_hours` : seuils d'affichage de la fraîcheur.
- `confirmation_ttl_minutes` / `reservation_ttl_minutes` : délais d'expiration.
- `orders_enabled` : interrupteur d'urgence des demandes en ligne.
- `directory_fresh_days` / `directory_stale_days` : seuils de fraîcheur de l'annuaire (90 et 180 jours par défaut).
- `emergency_numbers` : numéros d'urgence affichés en tête des pages de l'annuaire. **Vide par défaut** : ne saisir que des numéros vérifiés auprès des autorités (ex. « SAMU 15 · Pompiers 18 »).

## Équipe d'une pharmacie

- Le compte qui inscrit la pharmacie en est le **propriétaire**. Il ajoute des collaborateurs depuis *Ma pharmacie › Équipe* (la personne doit d'abord avoir créé son compte PharmaProxi).
- Les collaborateurs gèrent stocks et commandes. Seul le propriétaire gère l'équipe et les justificatifs.
- Un collaborateur retiré perd immédiatement l'accès ; son rôle pharmacien est retiré s'il n'appartient plus à aucune pharmacie.
- Changement de propriétaire (départ du titulaire) : *Administration › Pharmacies › fiche › Transférer la titularité*. Le nouveau titulaire doit avoir un compte ; vérifiez d'abord ses justificatifs, saisissez son e-mail et un motif. L'ancien propriétaire reste collaborateur (le nouveau peut le retirer). L'opération est journalisée.

## Annuaire médical

### Validation d'un médecin
1. *Administration › Annuaire › Médecins* : file des fiches en attente.
2. Ouvrir la fiche, consulter les justificatifs (inscription à l'Ordre, diplômes de spécialité, pièce d'identité).
3. Cocher les 5 points uniquement après vérification réelle : **inscription à l'Ordre** (contrôle auprès du Conseil de l'Ordre), **diplôme** correspondant à chaque spécialité, **identité**, **lieu d'exercice**, **téléphone** (appel de contrôle).
4. Valider, ou refuser avec un motif clair (le médecin le voit et peut corriger puis renvoyer).
5. Un médecin n'apparaît publiquement que s'il est vérifié **et** a consenti à la publication ; il peut se retirer à tout moment.

### Validation d'un établissement
Même procédure (*Annuaire › Cliniques*) : autorisation d'ouverture, existence légale (RCCM / NIF), responsable, adresse (visite ou photo), téléphone.

### Lieux d'exercice
Un lieu (médecin ↔ établissement) est publié seulement si le médecin **et** l'établissement l'ont accepté et sont tous deux vérifiés. L'administration n'a pas à intervenir.

### Fiches anciennes et signalements
- *Annuaire › Fiches à confirmer* : fiches non confirmées récemment ; au-delà de 180 jours elles ne sont plus publiées. Un rappel est envoyé automatiquement après 90 jours. Relancer par téléphone si besoin ; suspendre une fiche manifestement abandonnée.
- Les signalements « numéro erroné » / « ne consulte plus ici » arrivent dans *Signalements* avec un lien vers la fiche.

### Spécialités
*Annuaire › Spécialités* : ajouter, renommer, regrouper ou désactiver une spécialité (une spécialité utilisée n'est pas supprimée, seulement désactivée). Faire valider la liste par l'Ordre des médecins.

### Règles à respecter
Aucun classement payant ni mise en avant : l'ordre est alphabétique ou par distance. Aucun avis ni note sur les médecins. Aucune recommandation médicale.

## Incidents techniques

1. **Site indisponible** : consulter `/api/health`. `database: unreachable` → vérifier l'état du projet Supabase (tableau de bord Supabase, page de statut). Les pages publiques restent servies en mode visiteur tant que l'application tourne.
2. **Un utilisateur signale une erreur avec une référence** (ex. `K4Z9QA`) : rechercher la référence dans les journaux de l'hébergeur (`"ref":"K4Z9QA"`).
3. **Alerte « maintenance arrêtée »** : vérifier la tâche pg_cron (`select * from cron.job_run_details order by start_time desc limit 5;`) ; la relancer manuellement depuis *Administration › Intégrité* en attendant.
4. **Incohérence critique** (*Administration › Intégrité*) :
   - réservations : utiliser « Réparer les réservations » (journalisé), puis relancer le contrôle ;
   - total de commande incohérent ou livreur non habilité : contacter la pharmacie et le client, annuler la commande avec motif si nécessaire ;
   - toute incohérence signifie qu'une modification a été faite en dehors de l'application : identifier qui (journal d'audit, journaux Supabase) avant de corriger.
5. **Abus** (rafale de demandes, de signalements) : les limites en base bloquent automatiquement ; suspendre le compte en retirant ses rôles si nécessaire.
6. **Restauration de sauvegarde** : voir README §9. Après restauration, lancer le contrôle d'intégrité.
