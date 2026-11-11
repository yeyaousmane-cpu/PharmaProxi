# Voix de synthèse en bambara (IA)

Ce dossier permet de produire des enregistrements **en bambara par synthèse vocale** pour les pages qui ont un lecteur audio,
lorsque aucun enregistrement par une personne n'est encore disponible.

## Ce que fait l'outil, et ce qu'il ne fait pas

- Il **lit** un texte déjà écrit en bambara et le transforme en voix. Il **ne traduit pas** : la traduction du français vers
  le bambara doit être faite et relue par des locuteurs natifs (règle SantéProxi : aucun contenu de santé traduit
  automatiquement sans validation humaine compétente).
- Les fichiers produits sont des **brouillons**. Dans *Administration → Audio*, on les dépose avec l'origine
  « Voix de synthèse (IA) » ; la base de données **refuse la publication** tant qu'un locuteur natif n'a pas écouté
  le fichier et que son nom n'est pas indiqué.
- Sur le site, une voix de synthèse est **toujours annoncée** : « Voix de synthèse (IA), vérifiée par … ».

## Modèles de synthèse vocale en bambara vérifiés (novembre 2026)

| Modèle | Auteur | Licence | Remarque |
|---|---|---|---|
| [facebook/mms-tts-bam](https://huggingface.co/facebook/mms-tts-bam) | Meta AI (projet MMS) | CC-BY-NC 4.0 (non commercial) | Utilisé par `generer_bambara.py`, ~36 M de paramètres, tourne sur un ordinateur portable. |
| [MALIBA-AI/bambara-tts](https://huggingface.co/MALIBA-AI/bambara-tts) | MALIBA-AI (initiative malienne) | Licence de recherche MALIBA-AI, non commerciale ; organisations à but lucratif : accord écrit préalable | 10 voix maliennes, qualité annoncée supérieure (MOS 4,2 auto-déclaré). Contact : ml.maliba.ai@gmail.com |

**Les deux licences interdisent l'usage commercial.** Avant toute mise en ligne, il faut donc :
1. décider si l'usage de SantéProxi est non commercial (projet de santé publique gratuit) ou non ;
2. pour MALIBA-AI, obtenir l'**accord écrit** de l'équipe (recommandé : c'est aussi un partenariat malien à valoriser) ;
3. citer l'auteur du modèle (attribution exigée par les deux licences).

Ces conditions n'ont pas encore été validées : aucune voix de synthèse n'est publiée sur le site à ce jour.

## Utilisation

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install "transformers>=4.33" torch scipy
python generer_bambara.py textes.csv sortie/
```

`textes.csv` : colonnes `cle,texte_bambara,texte_relu_par` (voir `exemple-textes.csv`). Le texte de chaque page à
traduire est visible dans *Administration → Audio* (« texte à lire »). Le script refuse toute ligne sans relecteur.
