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

## Pharmacies non inscrites

- *Administration › Pharmacies non inscrites* : fiches d'annuaire des officines pas encore inscrites (nom, zone, téléphone, position), **sans stock ni prix**.
- **N'importez que des données dont vous avez le droit de vous servir** (relevé terrain, liste officielle de l'Ordre ou de la DPM, partenaire ayant donné son accord écrit) et indiquez la source. Ne publiez jamais le nom du pharmacien responsable.
- Import : téléchargez le modèle, remplissez-le dans Excel, *Enregistrer sous › CSV UTF-8*, puis importez. Les doublons sont ignorés ; chaque ligne en erreur est indiquée.
- Quand l'officine s'inscrit et que vous la validez, ouvrez sa fiche non inscrite et cliquez sur **Rattacher** : la fiche d'annuaire disparaît au profit de la vraie fiche.
- Un signalement (numéro faux, pharmacie fermée) : corrigez la fiche, ou masquez-la.

## Rendez-vous

- Ce sont les médecins (*Espace médecin › Demandes de rendez-vous*) ou les établissements (*fiche de l'établissement › Rendez-vous*) qui ouvrent les demandes en ligne, lieu par lieu.
- L'administration ne voit ni les patients ni les motifs : seulement des statistiques (fonction `admin_appointment_stats`).
- Un patient signale un problème (rendez-vous non honoré, comportement) : orientez-le vers l'établissement ; en cas de manquement répété d'un médecin, suspendez sa fiche.

## Tableau de l'Ordre des médecins

- *Annuaire médical › Tableau de l'Ordre* : importez chaque année le Tableau publié par l'Ordre (CSV : ordre ; inscription ; nom ; prenom ; specialite ; structure ; crom), en cochant « Remplacer l'édition existante ».
- Le Tableau ne contient aucune coordonnée : ne jamais y ajouter de téléphone ou d'adresse personnelle.
- Un médecin demande à ne pas figurer sur PharmaProxi : recherchez-le et cliquez sur **Masquer** ; ce choix est conservé lors des imports suivants.
- Un médecin qui complète sa fiche (contacts, plannings) et est vérifié remplace automatiquement son entrée du Tableau dans les résultats (même numéro d'inscription).

## Établissements non vérifiés

- *Annuaire médical › Établissements non vérifiés* : import CSV (nom ; type ; categorie ; region ; ville ; adresse ; telephone ; telephone2 ; source).
- Types : clinique, cabinet, cabinet_dentaire, centre_sante, csref, hopital, imagerie, laboratoire (déduit du nom si la colonne est vide).
- N'importez que des données dont vous avez le droit de vous servir (liste officielle du ministère, accord du détenteur de la liste) et indiquez la source.
- Quand l'établissement s'inscrit et est vérifié, masquez ou supprimez sa fiche non vérifiée.

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

## Gardes, laboratoires et ruptures

### Tableau de garde
*Administration › Gardes, examens, ruptures › Pharmacies de garde.* Importez le tableau officiel (CSV : pharmacie ; region ; debut ; commune ; fin ; source) ou ajoutez une garde à la main. Indiquez toujours la source (Ordre des pharmaciens, direction régionale de la santé…). La pharmacie doit d'abord figurer dans l'annuaire. Les gardes déclarées par une pharmacie apparaissent avec la mention « déclarée par la pharmacie » : vous pouvez les supprimer en cas d'erreur.

### Laboratoires et examens
1. Importez les établissements dans *Annuaire médical › Établissements non vérifiés* (type `laboratoire` ou `imagerie`). Cochez « Importer masqué » si les coordonnées doivent encore être confirmées, puis publiez chaque fiche après un appel de vérification.
2. Importez les examens proposés (*Gardes, examens, ruptures › Laboratoires et examens*). **N'inscrivez un tarif que s'il a été communiqué par l'établissement**, avec la date de l'information ; laissez la colonne vide sinon.

### Services d'urgence
Importez les services d'urgence et ambulances (types `urgences`, `ambulance`, colonne `urgences_24h`) ou utilisez le bouton « Urgences 24 h » sur une fiche. Renseignez `emergency_numbers` dans les paramètres avec des numéros vérifiés.

### Observatoire des ruptures
Chiffres agrégés et anonymes de la demande exprimée sur PharmaProxi. Ils ne mesurent pas l'état réel du marché : croisez-les avec d'autres sources avant toute communication publique, et ne publiez jamais de données permettant d'identifier une pharmacie ou une personne.

## Bibliothèque « Santé essentielle »
*Administration › Bibliothèque santé* (`/redaction-sante`).
1. **Rôles** : la personne crée d'abord un compte. Attribuez « Rédacteur » ou « Validateur médical » avec son e-mail, son nom affiché (ex. « Dr A. Traoré, hématologue ») et sa qualification. Ne nommez validateur qu'un professionnel de santé dont vous avez vérifié l'identité et l'inscription à l'Ordre.
2. **Rédiger** : « Nouvelle fiche » ou ouvrir un brouillon. Format simple : FAQ en blocs « Q : / R : », idées reçues « Idée : / Vérité : », sources une par ligne « Titre | Organisme | Lien | Date de publication | Date de consultation ». Jamais de source, de date ou de validateur inventés.
3. **Soumettre** : exige un résumé et au moins une source.
4. **Valider** (validateur, différent de l'auteur) : valider, demander une correction ou rejeter (avec un message). Le validateur confirme notamment le niveau de recommandation au regard des recommandations applicables au Mali.
5. **Publier** (validateur ou administration). Modifier ensuite une fiche publiée la retire du public jusqu'à sa nouvelle validation.
6. **Signalements** : traitez les signalements du public listés sur la page, corrigez la fiche si besoin.

## Messages de contact
*Administration › Messages.* Chaque message envoyé depuis la page Contact apparaît dans « Nouveaux » et déclenche une notification. Répondez par e-mail ou téléphone (liens directs), ajoutez une note interne, puis marquez « Traité ». Ne transférez jamais ces messages hors de la plateforme : ils contiennent des données personnelles. Pour publier l'e-mail ou le téléphone officiels de PharmaProxi, modifiez la page `contact` dans *Administration › Contenus*.

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
