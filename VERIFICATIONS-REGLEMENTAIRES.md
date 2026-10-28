# Vérifications réglementaires avant le lancement réel

PharmaProxi touche à la dispensation de médicaments, aux données personnelles et, éventuellement, au transport de produits de santé. Les points ci-dessous doivent être **vérifiés par un juriste et par des professionnels habilités** au Mali avant d'ouvrir le service au public. Les institutions citées sont des interlocuteurs probables ; leur compétence exacte et les textes en vigueur sont à confirmer.

## 1. Statut de la plateforme

- [ ] Qualification juridique : simple service d'information et de mise en relation, ou intermédiaire dans la vente de médicaments ? Les obligations diffèrent fortement.
- [ ] Autorisations éventuellement requises auprès du ministère chargé de la Santé, de la **Direction de la Pharmacie et du Médicament (DPM)** et du **Conseil national de l'Ordre des pharmaciens**.
- [ ] Règles de publicité pour les médicaments et les officines : la présentation des prix et des produits sur la plateforme est-elle autorisée ? Sous quelle forme ?
- [ ] Création de la structure juridique exploitante, immatriculation, assurance responsabilité civile professionnelle.

## 2. Pharmacies

- [ ] Liste exacte des justificatifs à exiger (autorisation d'ouverture, inscription du pharmacien titulaire à l'Ordre, pièce d'identité, RCCM, NIF…) et moyen de **vérifier leur authenticité** auprès de l'autorité émettrice.
- [ ] Possibilité d'obtenir la liste officielle des officines agréées pour contrôle croisé.
- [ ] Responsabilité des pharmacies sur les informations publiées (stocks, prix, horaires) : à inscrire dans un contrat d'adhésion signé.
- [ ] Prix : existe-t-il des prix réglementés ou plafonnés pour certains médicaments ? Faut-il les afficher ou les contrôler ?
- [ ] Procédure de suspension en cas de fermeture administrative, de sanction ordinale ou de signalement de produit suspect.

## 3. Médicaments et catalogue

- [ ] Source de référence pour le catalogue : nomenclature nationale des médicaments autorisés (AMM) — import officiel à prévoir.
- [ ] Liste précise des produits **sans ordonnance**, **sur ordonnance**, **stupéfiants et psychotropes** (ces derniers sont exclus de la plateforme par défaut).
- [ ] Conditions de délivrance des médicaments sur ordonnance : la plateforme impose le retrait en pharmacie avec présentation de l'ordonnance originale. Confirmer que ce modèle est conforme, et qu'aucun envoi d'ordonnance par la plateforme n'est requis ou interdit.
- [ ] Produits interdits ou sous alerte (retraits de lots, alertes de falsification) : canal d'information avec la DPM / le Laboratoire national de la santé pour retirer rapidement un produit.

## 4. Réservation et paiement

- [ ] Une réservation confirmée engage-t-elle la pharmacie ? Durée maximale acceptable de réservation.
- [ ] Paiement à la pharmacie et paiement à la livraison : conformité, reçus, obligations fiscales.
- [ ] Futur paiement mobile : agrément de l'intermédiaire, règles de la BCEAO sur la monnaie électronique, gestion des remboursements et des litiges.
- [ ] Conditions générales d'utilisation et de vente définitives (les textes livrés sont provisoires).

## 5. Livraison (désactivée par défaut)

- [ ] La livraison de médicaments à domicile est-elle autorisée ? Si oui : par qui (pharmacie elle-même, prestataire agréé), pour quelles catégories, sous quelles conditions ?
- [ ] Conditions de transport : température (chaîne du froid), conditionnement scellé, délai maximal, traçabilité de la remise.
- [ ] Responsabilités en cas de perte, de casse, de remise à une mauvaise personne ou de produit détérioré.
- [ ] Statut et vérification des livreurs (identité, casier si exigé, formation minimale, contrat).
- [ ] Ce n'est qu'après ces validations qu'un administrateur active `delivery_enabled` puis les catégories concernées.

## 6. Données personnelles

- [ ] Conformité à la **loi malienne sur la protection des données à caractère personnel** (loi n°2013-015 du 21 mai 2013, à confirmer) et formalités auprès de l'**Autorité de protection des données à caractère personnel (APDP)** : déclaration ou autorisation du traitement.
- [ ] Les données de commandes de médicaments peuvent révéler des informations de santé : vérifier si elles constituent des données sensibles et les garanties exigées.
- [ ] Lieu d'hébergement des données (Supabase / Vercel hors du Mali) : transferts internationaux autorisés ? Clauses contractuelles nécessaires ?
- [ ] Durées de conservation (commandes, justificatifs, journaux), politique de suppression, droits des personnes (accès, rectification, suppression), désignation d'un responsable.
- [ ] Politique de confidentialité définitive (texte provisoire fourni).

## 7. Sécurité et exploitation

- [ ] Sauvegardes activées et restauration testée.
- [ ] Tâche d'expiration planifiée (pg_cron) active.
- [ ] Comptes administrateurs nominatifs, mots de passe robustes, double authentification si disponible.
- [ ] Procédure de gestion des incidents de sécurité et de notification éventuelle à l'APDP.
- [ ] Tests d'intrusion ou revue de sécurité indépendante avant ouverture.
- [ ] Données de démonstration **désinstallées** (`npm run demo:uninstall`) et `APP_ENV=production`.

## 8. Santé publique et communication

- [ ] Messages de bon usage validés par des professionnels de santé (aucun conseil médical, aucune recommandation de médicament).
- [ ] Numéros d'urgence locaux à afficher sur la page « Bon usage et sécurité ».
- [ ] Procédure de signalement des produits suspects aux autorités compétentes.
