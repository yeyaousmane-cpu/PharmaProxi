#!/usr/bin/env python3
"""
SantéProxi — génération de voix de synthèse en bambara (bamanankan) à partir de textes RELUS par un locuteur natif.

Ce script ne traduit rien : il lit des textes déjà écrits en bambara et vérifiés par une personne,
puis produit un fichier WAV par texte avec le modèle open source facebook/mms-tts-bam (Meta, projet MMS).
Les fichiers produits sont des BROUILLONS : ils se déposent dans Administration → Audio avec l'origine
« Voix de synthèse (IA) », puis un locuteur natif les écoute ; la publication est refusée tant que son nom
n'est pas indiqué (règle appliquée par la base de données).

Licence du modèle : CC-BY-NC 4.0 (usage non commercial). Voir LISEZMOI.md avant toute utilisation.

Usage :
  python3 -m venv .venv && . .venv/bin/activate
  pip install "transformers>=4.33" torch scipy
  python generer_bambara.py textes.csv sortie/

textes.csv (UTF-8, séparateur virgule) : cle,texte_bambara,texte_relu_par
  - cle : clé de la page audio (ex. « accueil », « fiche:paludisme »), telle qu'affichée dans Administration → Audio
  - texte_bambara : texte en bambara, orthographe standard, sans mélange avec le français
  - texte_relu_par : nom de la personne qui a relu le texte bambara (obligatoire)
"""
import csv
import re
import sys
from pathlib import Path

MODEL = "facebook/mms-tts-bam"
SEED = 2026  # le modèle est non déterministe : une graine fixe rend la génération reproductible


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    rows = list(csv.DictReader(src.open(encoding="utf-8")))
    missing = {"cle", "texte_bambara", "texte_relu_par"} - set(rows[0].keys() if rows else [])
    if missing:
        print(f"Colonnes manquantes : {', '.join(sorted(missing))}")
        return 2
    refused = [r["cle"] for r in rows if not r["texte_relu_par"].strip() or len(r["texte_bambara"].strip()) < 5]
    if refused:
        print("Refusé : ces textes n'ont pas de relecteur indiqué ou sont vides :", ", ".join(refused))
        return 1

    import torch
    import scipy.io.wavfile
    from transformers import AutoTokenizer, VitsModel

    torch.manual_seed(SEED)
    model = VitsModel.from_pretrained(MODEL)
    tok = AutoTokenizer.from_pretrained(MODEL)
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for r in rows:
        key = r["cle"].strip()
        safe = re.sub(r"[^a-z0-9-]+", "-", key.lower()).strip("-")
        with torch.no_grad():
            wave = model(**tok(r["texte_bambara"].strip(), return_tensors="pt")).waveform[0].numpy()
        path = out / f"{safe}-bambara.wav"
        scipy.io.wavfile.write(path, rate=model.config.sampling_rate, data=wave)
        seconds = round(len(wave) / model.config.sampling_rate)
        manifest.append({"cle": key, "fichier": path.name, "duree_s": max(1, seconds), "modele": MODEL, "texte_relu_par": r["texte_relu_par"].strip()})
        print(f"OK  {key} → {path.name} ({seconds} s)")
    with (out / "manifeste.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(manifest[0].keys()))
        w.writeheader()
        w.writerows(manifest)
    print(f"\n{len(manifest)} fichier(s). Déposez-les dans Administration → Audio, origine « Voix de synthèse (IA) »,"
          f" modèle « {MODEL} », puis faites-les écouter par un locuteur natif avant publication.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
