#!/usr/bin/env python3
"""
Génère supabase/content/sante-avant-mariage-brouillons.sql : fiches de départ de la section
« Avant le mariage », en BROUILLON. Elles ne sont visibles du public qu'après validation par un
professionnel de santé enregistré comme validateur, puis publication.

Sources : uniquement des pages consultées le 29/10/2026 (OMS, OMS Afrique, ONUSIDA, Manuel MSD).
Les niveaux de recommandation (recommandé / selon les risques / sur indication) sont une proposition
de rédaction : le validateur doit les confirmer au regard des recommandations applicables au Mali.
"""
import json
from pathlib import Path

ACCESSED = "2026-10-29"
S = {
    "msd_drepano": ("Drépanocytose (version grand public)", "Manuel MSD", "https://www.msdmanuals.com/fr/accueil/troubles-du-sang/anémie/drépanocytose", ""),
    "msd_hbc": ("Hémoglobinoses C, S-C et E (version grand public)", "Manuel MSD", "https://www.msdmanuals.com/fr/accueil/troubles-du-sang/anémie/hémoglobinoses-c-s-c-et-e", ""),
    "msd_transfusion": ("Présentation de la transfusion sanguine (version grand public)", "Manuel MSD", "https://www.msdmanuals.com/fr/accueil/troubles-du-sang/transfusion-sanguine/présentation-de-la-transfusion-sanguine", ""),
    "msd_rh": ("Maladie hémolytique du fœtus et du nouveau-né (version grand public)", "Manuel MSD", "https://www.msdmanuals.com/fr/accueil/probl%C3%A8mes-de-sant%C3%A9-de-la-femme/complications-de-la-grossesse/incompatibilit%C3%A9-rh%C3%A9sus", ""),
    "afro_scd": ("Regional factsheet on sickle cell disease", "OMS — Bureau régional de l'Afrique", "https://files.aho.afro.who.int/afahobckpcontainer/production/files/Regional_Factsheet_on_Sickle_Cell_Disease_EN.pdf", ""),
    "afro_news": ("WHO Africa releases groundbreaking guidance to boost fight against sickle cell disease", "OMS — Bureau régional de l'Afrique", "https://www.afro.who.int/news/who-africa-releases-groundbreaking-guidance-boost-fight-against-sickle-cell-disease", ""),
    "who_preconc": ("Preconception care: maximizing the gains for maternal and child health — Policy brief (WHO/FWC/MCA/13.02)", "Organisation mondiale de la Santé", "https://www.who.int/publications-detail-redirect/WHO-FWC-MCA-13.02", "2013"),
    "who_preconc_meeting": ("Preconception care to reduce maternal and childhood mortality and morbidity", "Organisation mondiale de la Santé", "https://www.who.int/publications/i/item/9789241505000", "2013"),
    "who_syph": ("Syphilis — Aide-mémoire", "Organisation mondiale de la Santé", "https://www.who.int/en/news-room/fact-sheets/detail/syphilis", ""),
    "who_hbv": ("Hepatitis: Preventing mother-to-child transmission of the hepatitis B virus (questions-réponses)", "Organisation mondiale de la Santé", "https://www.who.int/news-room/questions-and-answers/item/hepatitis-preventing-mother-to-child-transmission-of-the-hepatitis-b-virus", ""),
    "who_hcv": ("Hepatitis C — Aide-mémoire", "Organisation mondiale de la Santé", "https://www.who.int/News-Room/Fact-Sheets/Detail/Hepatitis-c", ""),
    "unaids_hiv": ("HIV testing: what you need to know", "ONUSIDA", "https://unaids.org/en/resources/infographics/hiv-testing-what-you-need-to-know", ""),
    "who_rubella": ("Rubella — Aide-mémoire", "Organisation mondiale de la Santé", "https://who.int/news-room/fact-sheets/detail/rubella", ""),
    "who_infert": ("Multiple definitions of infertility", "Organisation mondiale de la Santé", "https://www.who.int/news/item/04-02-2020-multiple-definitions-of-infertility", "2020"),
    "who_blood": ("Global status report on blood safety and availability 2025", "Organisation mondiale de la Santé", "https://www.who.int/publications/i/item/9789240121546", "2025"),
}

def src(*keys):
    return [{"title": S[k][0], "organization": S[k][1], "url": S[k][2], "published_on": S[k][3], "accessed_on": ACCESSED} for k in keys]

OU_LABO = ("Dans un laboratoire d'analyses autorisé, un centre de santé de référence ou un hôpital. "
           "Consultez la rubrique Laboratoires de PharmaProxi pour les établissements référencés et leurs tarifs lorsqu'ils sont communiqués.")
CONSULTER_RESULTATS = "Faites-vous expliquer les résultats par un médecin, une sage-femme ou le biologiste : un résultat s'interprète toujours avec votre situation."

ARTICLES = [
    dict(slug="avant-mariage-groupe-sanguin-abo", title="Groupe sanguin ABO", recommendation="recommande",
         audiences=["adulte", "couple", "femme_enceinte"], exam_codes=["groupe_sanguin"], specialty_codes=["medecine_generale", "gynecologie"],
         keywords="groupe sanguin abo groupage a b ab o sang", is_featured=True,
         summary="Connaître son groupe sanguin (A, B, AB ou O) est utile en cas de transfusion et pendant une grossesse. Des groupes différents n'empêchent jamais un mariage.",
         body=dict(
             definition="Le groupe sanguin ABO classe le sang selon la présence de marqueurs (antigènes) A et/ou B à la surface des globules rouges : groupe A, B, AB ou O. Il est transmis par les deux parents.",
             importance="Il doit être connu avant toute transfusion, car recevoir un sang incompatible peut provoquer une réaction grave. Il fait aussi partie des examens habituels du suivi de grossesse.",
             deroulement="Simple prise de sang au pli du coude, parfois une goutte au bout du doigt pour un test rapide. Le résultat est souvent obtenu dans la journée.",
             preparation="Aucune préparation particulière n'est en général nécessaire (pas besoin d'être à jeun).",
             resultats="Le résultat indique le groupe (A, B, AB ou O), le plus souvent avec le facteur Rhésus (+ ou −). Gardez la carte de groupe sanguin remise par le laboratoire.",
             quand_consulter=CONSULTER_RESULTATS,
             ou_au_mali=OU_LABO),
         myths=[{"idee": "Deux personnes de groupes sanguins différents ne peuvent pas se marier.", "verite": "Faux. La différence de groupe ABO n'est pas une contre-indication au mariage. Ce qui compte pour la grossesse, c'est surtout le facteur Rhésus de la mère, qui se surveille et se prend en charge."},
                {"idee": "Le groupe sanguin indique si l'on est porteur de la drépanocytose.", "verite": "Faux. Le groupe sanguin et le type d'hémoglobine (AA, AS, SS…) sont deux examens différents. Seule l'électrophorèse de l'hémoglobine renseigne sur la drépanocytose."}],
         sources=src("msd_transfusion", "msd_rh", "who_blood")),
    dict(slug="avant-mariage-rhesus", title="Facteur Rhésus (positif ou négatif)", recommendation="recommande",
         audiences=["adulte", "couple", "femme_enceinte"], exam_codes=["groupe_sanguin"], specialty_codes=["gynecologie"],
         keywords="rhesus rh positif negatif anti-d incompatibilite rhesus grossesse", is_featured=True,
         summary="Le Rhésus est positif ou négatif. Une femme Rhésus négatif peut avoir des enfants en bonne santé : la grossesse demande simplement une surveillance et parfois un traitement préventif.",
         body=dict(
             definition="Le facteur Rhésus (Rh) indique la présence (Rh+) ou l'absence (Rh−) d'un marqueur appelé D sur les globules rouges. Il est déterminé en même temps que le groupe ABO.",
             importance="Si une femme Rh− attend un bébé Rh+ (possible lorsque le père est Rh+), son organisme peut fabriquer des anticorps contre les globules rouges du bébé, surtout lors d'une grossesse suivante. C'est l'incompatibilité Rhésus.",
             prevention="Cette situation se prévient : le suivi de grossesse prévoit la recherche d'anticorps et, si nécessaire, une injection d'immunoglobulines anti-D au moment indiqué par le médecin ou la sage-femme.",
             resultats="Rh+ ou Rh−. Être Rh− n'est pas une maladie. Une femme Rh− doit le signaler dès le début de chaque grossesse, et après une fausse couche ou un saignement.",
             quand_consulter="Dès le début d'une grossesse si vous êtes Rh−, et en cas de saignement pendant la grossesse.",
             ou_au_mali=OU_LABO),
         myths=[{"idee": "Une femme Rhésus négatif ne peut pas épouser un homme Rhésus positif.", "verite": "Faux. Le couple peut avoir des enfants en bonne santé. La grossesse est simplement suivie de plus près, avec un traitement préventif si nécessaire."}],
         sources=src("msd_rh", "msd_transfusion")),
    dict(slug="avant-mariage-electrophorese-hemoglobine", title="Électrophorèse de l'hémoglobine", recommendation="recommande",
         audiences=["adulte", "couple", "adolescent"], exam_codes=["electrophorese_hb"], specialty_codes=["hematologie", "medecine_generale"],
         keywords="electrophorese hemoglobine drepanocytose as ss sc hb c test genotype electro", is_featured=True,
         summary="Cet examen de sang indique le type d'hémoglobine (AA, AS, SS, AC, SC…). C'est le seul examen courant qui permet de savoir si l'on est porteur du gène de la drépanocytose.",
         body=dict(
             definition="L'hémoglobine est la protéine des globules rouges qui transporte l'oxygène. L'électrophorèse sépare les différentes formes d'hémoglobine présentes dans le sang (A, S, C…).",
             importance="La drépanocytose est très fréquente en Afrique subsaharienne. Connaître son profil avant d'avoir des enfants permet au couple de comprendre les risques de transmission et de se faire accompagner.",
             deroulement="Prise de sang au pli du coude, analysée par un laboratoire équipé. Le délai de résultat varie selon le laboratoire.",
             preparation="Pas de jeûne nécessaire en général. Signalez une transfusion récente : elle peut fausser le résultat pendant plusieurs semaines.",
             resultats="AA : hémoglobine habituelle. AS ou AC : porteur (en général sans maladie). SS, SC ou CC : forme de maladie de l'hémoglobine qui nécessite un suivi. Un résultat inhabituel doit être expliqué par un médecin.",
             quand_consulter="Si les deux membres du couple sont porteurs (par exemple AS et AS, AS et AC), une consultation (médecin, hématologue ou conseil génétique) est recommandée avant une grossesse.",
             ou_au_mali=OU_LABO + " Le Centre de recherche et de lutte contre la drépanocytose (CRLD) à Bamako est une structure de référence — coordonnées à vérifier avant publication."),
         myths=[{"idee": "On peut deviner si quelqu'un est porteur en regardant sa santé ou son groupe sanguin.", "verite": "Faux. Une personne AS est généralement en bonne santé. Seul l'examen de l'hémoglobine permet de connaître son profil."}],
         sources=src("msd_drepano", "msd_hbc", "afro_scd")),
    dict(slug="avant-mariage-drepanocytose-aa-as-ss", title="Drépanocytose : comprendre les profils AA, AS et SS", recommendation="recommande",
         audiences=["tous", "couple"], exam_codes=["electrophorese_hb"], specialty_codes=["hematologie", "pediatrie"],
         keywords="drepanocytose drepano sickle anemie falciforme as ss aa trait porteur sain crise douleur", is_featured=True,
         summary="Être AS, c'est être porteur sain : on n'est généralement pas malade mais on peut transmettre le gène. Quand les deux parents sont AS, chaque grossesse a 1 risque sur 4 que l'enfant soit SS.",
         body=dict(
             definition="La drépanocytose est une maladie héréditaire des globules rouges. Ceux-ci se déforment (en forme de faucille), circulent mal et se détruisent plus vite. Elle est due à un gène S transmis par chacun des deux parents.",
             importance="L'OMS Afrique la décrit comme un problème de santé publique majeur dans la région. Un diagnostic précoce et un suivi régulier améliorent fortement la vie des enfants atteints.",
             situations="Signes possibles chez une personne SS : anémie, fatigue, crises douloureuses, infections fréquentes, gonflement des mains et des pieds chez le petit enfant.",
             prevention="Connaître son profil et celui de son ou sa partenaire avant une grossesse. Pour un enfant atteint : suivi médical régulier, vaccinations, prévention des infections et du paludisme selon l'avis médical, bonne hydratation.",
             examens="Électrophorèse de l'hémoglobine (voir la fiche dédiée). Chez le nouveau-né, un dépistage peut être proposé selon les structures.",
             resultats="Deux parents AA : enfants AA. Un parent AA et un parent AS : 1 chance sur 2 que l'enfant soit AS, aucun enfant SS. Deux parents AS : à chaque grossesse, 25 % AA, 50 % AS, 25 % SS. Ces chiffres valent pour chaque grossesse, indépendamment des précédentes.",
             quand_consulter="Avant une grossesse si les deux partenaires sont porteurs ; pour tout enfant ou adulte SS ou SC, un suivi régulier par un médecin.",
             urgence="Pour une personne drépanocytaire : forte fièvre, douleur intense qui ne cède pas, difficulté à respirer, pâleur importante, faiblesse d'un côté du corps ou trouble de la parole, priapisme : consultez en urgence.",
             ou_au_mali=OU_LABO),
         myths=[{"idee": "Deux personnes AS ne peuvent pas se marier.", "verite": "Faux. Elles peuvent se marier et avoir des enfants. Connaître le risque (1 sur 4 à chaque grossesse) leur permet de se faire accompagner par un professionnel de santé et de décider en connaissance de cause."},
                {"idee": "La drépanocytose est contagieuse.", "verite": "Faux. Elle ne s'attrape pas : elle se transmet uniquement des parents aux enfants par les gènes."},
                {"idee": "Si notre premier enfant est SS, les suivants ne le seront pas.", "verite": "Faux. Le risque est le même à chaque grossesse (1 sur 4 pour deux parents AS), quel que soit le profil des enfants précédents."}],
         faq=[{"q": "Quelle différence entre être AS et être SS ?", "r": "AS : porteur du trait drépanocytaire, généralement sans symptôme. SS : drépanocytose, maladie qui demande un suivi médical."},
              {"q": "Peut-on transmettre la maladie sans être malade ?", "r": "Oui. Deux parents AS, sans maladie, peuvent avoir un enfant SS."}],
         sources=src("msd_drepano", "afro_scd", "afro_news")),
    dict(slug="avant-mariage-autres-variants-hemoglobine", title="Hémoglobine C, thalassémies et autres variants", recommendation="selon_risque",
         audiences=["adulte", "couple"], exam_codes=["electrophorese_hb", "nfs"], specialty_codes=["hematologie"],
         keywords="hemoglobine c hb c ac sc cc thalassemie beta alpha variant hemoglobinose",
         summary="En plus du gène S, d'autres variants existent, comme l'hémoglobine C, fréquente en Afrique de l'Ouest. Associée au gène S (profil SC), elle donne une forme de drépanocytose.",
         body=dict(
             definition="Les variants de l'hémoglobine sont des formes différentes de cette protéine, transmises par les gènes. L'hémoglobine C en est un exemple ; les thalassémies sont un autre groupe de maladies héréditaires de l'hémoglobine.",
             importance="Une personne AC est généralement en bonne santé. Mais si l'un des parents porte le gène S et l'autre le gène C, l'enfant peut être SC, forme de drépanocytose qui nécessite un suivi.",
             resultats="L'électrophorèse permet de repérer les principaux variants (S, C…). Certaines thalassémies demandent des examens complémentaires interprétés par un spécialiste.",
             quand_consulter="Si un résultat mentionne un variant inhabituel ou si la numération sanguine montre une anémie inexpliquée : consultez un médecin ou un hématologue.",
             ou_au_mali=OU_LABO),
         sources=src("msd_hbc", "msd_drepano")),
    dict(slug="avant-mariage-depistage-vih", title="Dépistage du VIH", recommendation="recommande",
         audiences=["adulte", "couple", "femme_enceinte"], exam_codes=["vih"], specialty_codes=["infectiologie", "medecine_generale"],
         keywords="vih sida depistage test hiv serologie", is_featured=False,
         summary="Le dépistage du VIH est simple, confidentiel et le seul moyen de connaître son statut. Avec un traitement, une personne vivant avec le VIH peut vivre longtemps et avoir des enfants non infectés.",
         body=dict(
             definition="Le VIH est un virus qui affaiblit les défenses de l'organisme. Il se transmet par voie sexuelle, par le sang, et de la mère à l'enfant (grossesse, accouchement, allaitement).",
             importance="Connaître son statut permet de se protéger, de protéger son ou sa partenaire et, en cas de grossesse, d'éviter la transmission à l'enfant grâce au traitement.",
             deroulement="Test rapide (goutte de sang au bout du doigt) ou prise de sang, avec un conseil avant et après le test. Un résultat positif est toujours confirmé par d'autres tests.",
             resultats="Un test négatif récent peut ne pas détecter une infection très récente : le professionnel vous dira s'il faut refaire le test. Un résultat positif ouvre l'accès à un traitement.",
             quand_consulter="Après un risque d'exposition, avant un projet de grossesse, ou pour toute question : un centre de dépistage ou un médecin vous accompagne en toute confidentialité.",
             ou_au_mali=OU_LABO + " Des centres de dépistage et de conseil existent dans les structures de santé publiques."),
         myths=[{"idee": "Une personne séropositive ne peut pas avoir d'enfant en bonne santé.", "verite": "Faux. Avec un traitement et un suivi adaptés, le risque de transmission à l'enfant peut devenir très faible."}],
         sources=src("unaids_hiv", "who_preconc")),
    dict(slug="avant-mariage-depistage-hepatite-b", title="Dépistage de l'hépatite B", recommendation="recommande",
         audiences=["adulte", "couple", "femme_enceinte"], exam_codes=["aghbs"], specialty_codes=["gastro_enterologie", "infectiologie"],
         keywords="hepatite b vhb aghbs hbs foie vaccin",
         summary="L'hépatite B est une infection du foie souvent silencieuse. Un test sanguin (AgHBs) permet de la dépister ; un vaccin existe pour le ou la partenaire non protégé(e) et pour le bébé.",
         body=dict(
             definition="Infection du foie par le virus de l'hépatite B. Elle peut devenir chronique sans donner de signe pendant des années.",
             importance="Elle se transmet notamment par voie sexuelle, par le sang et de la mère à l'enfant à la naissance. L'OMS insiste sur la prévention de la transmission mère-enfant, en particulier par la vaccination du nouveau-né dès la naissance.",
             prevention="Vaccination contre l'hépatite B ; si la future mère est porteuse, le suivi de grossesse prévoit des mesures pour protéger le bébé.",
             deroulement="Prise de sang (recherche de l'antigène HBs). D'autres marqueurs peuvent être demandés par le médecin.",
             resultats="Un AgHBs positif signifie la présence du virus : un médecin évalue l'atteinte du foie et le besoin de traitement. Le ou la partenaire peut alors se faire dépister et vacciner.",
             quand_consulter="En cas de résultat positif, ou avant une grossesse si vous ne connaissez pas votre statut.",
             ou_au_mali=OU_LABO),
         sources=src("who_hbv", "who_preconc")),
    dict(slug="avant-mariage-depistage-syphilis", title="Dépistage de la syphilis", recommendation="recommande",
         audiences=["adulte", "couple", "femme_enceinte"], exam_codes=["syphilis"], specialty_codes=["infectiologie", "dermatologie", "gynecologie"],
         keywords="syphilis ist mst tpha vdrl infection sexuellement transmissible chancre",
         summary="La syphilis est une infection sexuellement transmissible qui se dépiste par une prise de sang et se soigne par antibiotiques. Pendant la grossesse, elle peut être transmise au bébé.",
         body=dict(
             definition="Infection causée par une bactérie, transmise surtout lors de rapports sexuels, et de la mère à l'enfant pendant la grossesse (syphilis congénitale).",
             importance="Elle peut passer inaperçue. Non traitée pendant la grossesse, elle peut entraîner une fausse couche, un enfant mort-né ou une infection grave du bébé. Le dépistage et le traitement précoces les évitent.",
             deroulement="Prise de sang ou test rapide. Un test positif est complété par un autre test pour confirmer et suivre le traitement.",
             resultats="En cas de résultat positif, un traitement antibiotique est prescrit ; le ou les partenaires doivent aussi être dépistés et traités pour éviter une nouvelle infection.",
             quand_consulter="Plaie indolore sur les organes génitaux, éruption sur la peau, ou après un rapport à risque.",
             ou_au_mali=OU_LABO),
         sources=src("who_syph")),
    dict(slug="avant-mariage-depistage-hepatite-c", title="Dépistage de l'hépatite C (selon les situations)", recommendation="selon_risque",
         audiences=["adulte", "couple"], exam_codes=["hepatite_c"], specialty_codes=["gastro_enterologie", "infectiologie"],
         keywords="hepatite c vhc foie serologie",
         summary="L'hépatite C se transmet surtout par le sang. Le dépistage est proposé selon les situations à risque ; un traitement efficace existe.",
         body=dict(
             definition="Infection du foie par le virus de l'hépatite C, souvent sans symptôme pendant des années.",
             importance="Elle se transmet principalement par le sang (matériel d'injection, soins avec du matériel mal stérilisé, transfusion non contrôlée, tatouage…). La transmission sexuelle ou de la mère à l'enfant est possible mais moins fréquente.",
             situations="Le dépistage est proposé notamment après une transfusion ancienne, des soins ou interventions à risque, l'usage de drogues injectables, ou si un proche est infecté. Le médecin juge de son intérêt.",
             deroulement="Prise de sang (recherche d'anticorps), complétée par un test du virus si le premier est positif.",
             resultats="Un résultat positif conduit vers un médecin : des traitements permettent aujourd'hui de guérir la plupart des personnes.",
             ou_au_mali=OU_LABO),
         sources=src("who_hcv")),
    dict(slug="avant-mariage-bilan-sante-general", title="Bilan de santé général (selon les besoins)", recommendation="selon_risque",
         audiences=["adulte", "couple"], exam_codes=["nfs", "glycemie", "creatinine"], specialty_codes=["medecine_generale"],
         keywords="bilan sante general check up nfs glycemie tension consultation",
         summary="Une consultation avant un projet de grossesse permet de faire le point : tension, poids, vaccins, traitements en cours, maladies chroniques. Les examens sont décidés par le médecin.",
         body=dict(
             definition="Le bilan général comprend un examen clinique par un professionnel et, si nécessaire, quelques analyses choisies selon votre âge, vos antécédents et vos symptômes.",
             importance="L'OMS recommande les soins préconceptionnels : repérer et prendre en charge avant la grossesse certaines situations (anémie, diabète, hypertension, carences, traitements à adapter) améliore la santé de la mère et de l'enfant.",
             examens="Exemples possibles, sur prescription : numération formule sanguine (anémie), glycémie, fonction rénale. Aucun bilan type n'est obligatoire pour tous.",
             quand_consulter="Avant un projet de grossesse, surtout en cas de maladie chronique ou de traitement au long cours (ne l'arrêtez pas sans avis médical).",
             ou_au_mali="Consultation de médecine générale ou de gynécologie, centre de santé communautaire ou centre de santé de référence. Voir la rubrique Médecins de PharmaProxi."),
         sources=src("who_preconc", "who_preconc_meeting")),
    dict(slug="avant-mariage-vaccinations-avant-grossesse", title="Vaccinations et immunité avant une grossesse", recommendation="recommande",
         audiences=["adulte", "couple"], exam_codes=[], specialty_codes=["medecine_generale", "gynecologie"],
         keywords="vaccin vaccination rubeole hepatite b tetanos carnet de vaccination grossesse",
         summary="Vérifier son carnet de vaccination avant une grossesse permet de se protéger contre des infections dangereuses pour le bébé, comme la rubéole.",
         body=dict(
             definition="Certaines infections pendant la grossesse peuvent nuire au bébé. Des vaccins existent contre plusieurs d'entre elles.",
             importance="La rubéole contractée en début de grossesse peut provoquer de graves malformations (syndrome de rubéole congénitale) ; la vaccination avant la grossesse l'évite. L'hépatite B se prévient aussi par la vaccination.",
             prevention="Présentez votre carnet de vaccination lors d'une consultation : le professionnel indique les vaccins à mettre à jour et le délai à respecter avant une grossesse pour certains vaccins.",
             quand_consulter="Avant un projet de grossesse, ou si vous ne savez pas si vous êtes vacciné(e).",
             ou_au_mali="Centres de santé (CSCom, CSRéf) et services de vaccination ; demandez conseil à un médecin ou une sage-femme."),
         sources=src("who_rubella", "who_preconc")),
    dict(slug="avant-mariage-fertilite", title="Fertilité : quand consulter ?", recommendation="sur_indication",
         audiences=["adulte", "couple"], exam_codes=["echo_pelv"], specialty_codes=["gynecologie", "urologie"],
         keywords="fertilite infertilite sterilite enfant grossesse difficulte concevoir",
         summary="Il est habituel qu'une grossesse mette plusieurs mois à arriver. On parle généralement d'infertilité après 12 mois de rapports réguliers sans contraception ; l'homme et la femme sont concernés.",
         body=dict(
             definition="L'infertilité est l'absence de grossesse après 12 mois ou plus de rapports sexuels réguliers sans contraception, selon la définition clinique utilisée par l'OMS.",
             importance="Elle concerne aussi bien l'homme que la femme, et souvent les deux. Les examens de fertilité ne sont pas des examens prénuptiaux systématiques : ils sont proposés lorsqu'une difficulté se présente.",
             situations="Consulter plus tôt peut être conseillé dans certaines situations (cycles très irréguliers, antécédent d'infection génitale ou de chirurgie, âge de la femme) : le professionnel en jugera.",
             examens="Décidés par le médecin pour les deux partenaires (par exemple échographie, bilans hormonaux, spermogramme).",
             quand_consulter="Après 12 mois sans grossesse malgré des rapports réguliers, ou plus tôt en cas de problème connu.",
             ou_au_mali="Consultation de gynécologie, d'urologie ou centre spécialisé. Voir la rubrique Médecins de PharmaProxi."),
         myths=[{"idee": "Quand un couple n'a pas d'enfant, c'est forcément la femme.", "verite": "Faux. Les causes peuvent venir de l'homme, de la femme, des deux, ou rester inexpliquées. Les deux partenaires doivent être évalués."}],
         sources=src("who_infert")),
    dict(slug="avant-mariage-conseil-genetique", title="Conseil génétique : pour qui et pourquoi ?", recommendation="sur_indication",
         audiences=["adulte", "couple"], exam_codes=["electrophorese_hb"], specialty_codes=["hematologie", "pediatrie"],
         keywords="conseil genetique maladie hereditaire consanguinite antecedent familial porteur",
         summary="Le conseil génétique aide un couple à comprendre un risque de maladie héréditaire et les options possibles. La décision appartient toujours au couple.",
         body=dict(
             definition="Consultation avec un professionnel formé qui explique comment une maladie se transmet, évalue le risque pour les futurs enfants et présente les possibilités de suivi.",
             importance="Il est particulièrement utile lorsque les deux partenaires sont porteurs d'un même gène (par exemple AS et AS), en cas de maladie héréditaire dans la famille, ou en cas de mariage entre proches parents.",
             situations="Deux partenaires porteurs ; un enfant déjà atteint d'une maladie héréditaire ; antécédents familiaux ; résultats d'examens difficiles à interpréter.",
             quand_consulter="Avant une grossesse dans les situations ci-dessus. Le conseil est confidentiel et ne juge pas le couple.",
             ou_au_mali="Médecin, pédiatre ou hématologue ; structures spécialisées dans la drépanocytose. Voir la rubrique Médecins de PharmaProxi."),
         sources=src("msd_drepano", "afro_scd")),
]

FAQ = dict(slug="avant-mariage-questions-frequentes", kind="faq", title="Mariage et santé : les questions fréquentes", recommendation=None,
           audiences=["couple", "adulte"], exam_codes=[], specialty_codes=["medecine_generale"], is_featured=True,
           keywords="mariage examen prenuptial bilan avant mariage couple questions",
           summary="Les réponses aux questions les plus posées par les futurs mariés : examens, groupes sanguins, drépanocytose, infections, fertilité, confidentialité.",
           body={},
           faq=[
               {"q": "Quels examens réaliser avant un mariage ?", "r": "Aucune liste unique ne s'impose à tous. Sont généralement proposés : groupe sanguin et Rhésus, électrophorèse de l'hémoglobine, dépistage du VIH, de l'hépatite B et de la syphilis. D'autres examens dépendent de votre situation et se discutent avec un professionnel de santé."},
               {"q": "Deux personnes de groupes sanguins différents peuvent-elles se marier ?", "r": "Oui. Une différence de groupe sanguin n'empêche ni le mariage ni d'avoir des enfants. Si la femme est Rhésus négatif et l'homme Rhésus positif, la grossesse est simplement surveillée et un traitement préventif peut être proposé."},
               {"q": "Un couple dont les deux partenaires sont AS peut-il avoir des enfants ?", "r": "Oui. À chaque grossesse, la probabilité théorique est de 25 % pour un enfant AA, 50 % pour un enfant AS et 25 % pour un enfant SS. Un accompagnement médical et un conseil génétique aident le couple à décider en connaissance de cause."},
               {"q": "Quelle différence entre être porteur du trait drépanocytaire et être atteint de drépanocytose ?", "r": "Le porteur (AS) a un gène S et un gène normal : il n'est généralement pas malade. La personne atteinte (SS, ou SC) a deux gènes anormaux et a besoin d'un suivi médical."},
               {"q": "Peut-on transmettre une maladie génétique sans être malade ?", "r": "Oui. C'est le cas des porteurs sains (AS, AC) : ils peuvent transmettre le gène à leurs enfants sans avoir eux-mêmes la maladie."},
               {"q": "Quels dépistages des infections sont utiles avant une grossesse ?", "r": "Le VIH, l'hépatite B et la syphilis sont les plus couramment proposés, car un traitement ou une prévention protègent le bébé. Le médecin peut en proposer d'autres selon la situation, et vérifier les vaccinations (rubéole, hépatite B)."},
               {"q": "Quand faut-il consulter pour un problème de fertilité ?", "r": "Généralement après 12 mois de rapports réguliers sans contraception et sans grossesse, ou plus tôt en cas de problème connu. L'homme et la femme sont tous deux concernés."},
               {"q": "Que faire lorsque les résultats d'un examen sont anormaux ?", "r": "Ne vous inquiétez pas seul(e) et n'interprétez pas les résultats à partir d'internet : prenez rendez-vous avec un médecin, qui expliquera le résultat, demandera si besoin des examens de confirmation et proposera une prise en charge."},
               {"q": "Comment protéger la confidentialité des résultats médicaux du couple ?", "r": "Vos résultats vous appartiennent. Vous choisissez de les partager ou non. Les professionnels de santé sont tenus au secret médical. PharmaProxi ne vous demande jamais vos résultats pour consulter ses fiches."},
           ],
           sources=src("who_preconc", "msd_drepano", "msd_rh", "who_infert"))

MYTHS = dict(slug="avant-mariage-idees-recues", kind="idee_recue", title="Groupes sanguins, drépanocytose et mariage : idées reçues", recommendation=None,
             audiences=["tous", "couple"], exam_codes=[], specialty_codes=[], is_featured=True,
             keywords="idee recue mythe groupe sanguin mariage incompatible drepanocytose",
             summary="Beaucoup d'idées fausses circulent sur les groupes sanguins et le mariage. Démêlons le vrai du faux.",
             body={},
             myths=[
                 {"idee": "Des groupes sanguins différents rendent un couple « incompatible ».", "verite": "Faux. Le groupe ABO n'est pas une contre-indication au mariage. Le Rhésus de la mère se surveille pendant la grossesse."},
                 {"idee": "O+ est le meilleur groupe pour se marier.", "verite": "Faux. Aucun groupe sanguin n'est meilleur qu'un autre pour se marier ou avoir des enfants."},
                 {"idee": "Le test de groupe sanguin suffit pour savoir si l'on est AS.", "verite": "Faux. Il faut une électrophorèse de l'hémoglobine, un examen différent."},
                 {"idee": "Un couple AS-AS aura forcément un enfant malade.", "verite": "Faux. Le risque est de 1 sur 4 à chaque grossesse ; il ne se répartit pas sur une famille. Un accompagnement médical aide à décider."},
                 {"idee": "La drépanocytose se transmet par le sang lors d'une transfusion ou par contact.", "verite": "Faux. Elle n'est pas contagieuse : elle se transmet uniquement par les gènes des deux parents."},
             ],
             sources=src("msd_transfusion", "msd_rh", "msd_drepano"))

def sql_str(v):
    return "'" + str(v).replace("'", "''") + "'"

def article_sql(a):
    kind = a.get("kind", "fiche")
    body = json.dumps(a.get("body", {}), ensure_ascii=False)
    myths = json.dumps(a.get("myths", []), ensure_ascii=False)
    faq = json.dumps(a.get("faq", []), ensure_ascii=False)
    arr = lambda xs: "array[" + ",".join(sql_str(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"
    rec = sql_str(a["recommendation"]) if a.get("recommendation") else "null"
    out = [f"""insert into public.health_articles (slug, category_id, kind, title, summary, keywords, audiences, recommendation, body, myths, faq,
  exam_codes, specialty_codes, is_featured, status, author_name)
select {sql_str(a['slug'])}, c.id, {sql_str(kind)}, {sql_str(a['title'])}, {sql_str(a['summary'])}, {sql_str(a.get('keywords',''))}, {arr(a.get('audiences', []))}, {rec},
  $j${body}$j$::jsonb, $j${myths}$j$::jsonb, $j${faq}$j$::jsonb, {arr(a.get('exam_codes', []))}, {arr(a.get('specialty_codes', []))}, {'true' if a.get('is_featured') else 'false'},
  'draft', 'Équipe PharmaProxi'
from public.health_categories c where c.slug = 'mariage'
on conflict (slug) do nothing;"""]
    for i, s in enumerate(a["sources"]):
        out.append(f"""insert into public.health_sources (article_id, title, organization, url, published_on, accessed_on, sort_order)
select a.id, {sql_str(s['title'])}, {sql_str(s['organization'])}, {sql_str(s['url'])}, {sql_str(s['published_on']) if s['published_on'] else 'null'}, date {sql_str(s['accessed_on'])}, {i}
from public.health_articles a where a.slug = {sql_str(a['slug'])} and not exists (select 1 from public.health_sources x where x.article_id = a.id and x.url = {sql_str(s['url'])});""")
    out.append(f"""insert into public.health_article_history (article_id, actor_name, action, to_status, note)
select a.id, 'Équipe PharmaProxi', 'création', 'draft', 'Brouillon initial : à relire et valider par un professionnel de santé (contenu, niveau de recommandation, adaptation au Mali)'
from public.health_articles a where a.slug = {sql_str(a['slug'])} and not exists (select 1 from public.health_article_history h where h.article_id = a.id);""")
    return "\n".join(out)

header = """-- ============================================================================
-- PharmaProxi — Santé essentielle : fiches de départ « Avant le mariage » (BROUILLONS)
-- Généré par scripts/health-content.py. Aucune fiche n'est publiée : chacune doit être
-- relue, validée par un validateur médical enregistré, puis publiée depuis /redaction-sante.
-- Sources consultées le 29/10/2026. Peut être relancé sans créer de doublon.
-- ============================================================================
begin;
"""
body = "\n\n".join(article_sql(a) for a in ARTICLES + [FAQ, MYTHS])
Path(__file__).resolve().parent.parent.joinpath("supabase/content/sante-avant-mariage-brouillons.sql").write_text(
    header + "\n" + body + "\n\ncommit;\n\n-- Contrôle : 15 fiches en brouillon\nselect count(*) as fiches_brouillons from public.health_articles a join public.health_categories c on c.id = a.category_id where c.slug = 'mariage';\n",
    encoding="utf-8")
print("ok", len(ARTICLES) + 2)
