#!/usr/bin/env python3
"""
Génère supabase/content/premiers-secours-brouillons.sql : fiches de premiers secours, en BROUILLON
(catégorie « Urgences et premiers secours »). Elles ne sont visibles du public qu'après validation
par un professionnel de santé enregistré comme validateur, puis publication (/redaction-sante).

Sources consultées le 01/11/2026 : lignes directrices internationales de premiers secours de la
FICR (2020), OMS, Manuel MSD, INSPQ, Africa Check. Le validateur doit vérifier l'adaptation au Mali.
"""
import json
from pathlib import Path

ACCESSED = "2026-11-01"
S = {
    "ifrc": ("International First Aid, Resuscitation and Education Guidelines 2020", "Fédération internationale des sociétés de la Croix-Rouge et du Croissant-Rouge (FICR)", "https://www.ifrc.org/sites/default/files/2022-02/EN_GFARC_GUIDELINES_2020.pdf", "2020"),
    "who_snake": ("Snakebite envenoming — Treatment", "Organisation mondiale de la Santé", "https://www.who.int/teams/control-of-neglected-tropical-diseases/snakebite-envenoming/treatment", ""),
    "msd_snake": ("Morsures de serpents (version grand public)", "Manuel MSD", "https://www.msdmanuals.com/fr/accueil/les-faits-en-bref-lésions-et-intoxications/morsures-et-piqûres/morsures-de-serpents", ""),
    "africacheck_snake": ("Traiter en deux minutes une morsure de serpent avec du cérumen ? N'importe quoi", "Africa Check", "https://africacheck.org/fr/fact-checks/articles/traiter-en-deux-minutes-une-morsure-de-serpent-avec-du-cerumen-na-aucun", ""),
    "who_diarrhoea": ("Clinical management of acute diarrhoea: WHO/UNICEF joint statement (WHO/FCH/CAH/04.7)", "OMS et UNICEF", "https://www.who.int/publications/i/item/WHO_FCH_CAH_04.7", "2004"),
    "msf_ors": ("Annexe 14. Plan de réhydratation de l'OMS dans le cadre d'une diarrhée", "Médecins Sans Frontières — Guides cliniques", "https://medicalguidelines.msf.org/fr/node/663", ""),
    "imci": ("IMCI chart booklet (Prise en charge intégrée des maladies de l'enfant)", "Organisation mondiale de la Santé", "https://apo.who.int/publications/i/item/9789241506823", "2014"),
    "ccm": ("Caring for the sick child in the community — Chart booklet", "OMS et UNICEF", "https://www.childhealthtaskforce.org/sites/default/files/2019-06/Caring%20for%20Sick%20Child%20in%20the%20Community%20CHW%20Chart%20Booklet%28WHO%2CUNICEF%2C2014%29.pdf", "2014"),
    "inspq_preg": ("Signaux d'alarme pendant la grossesse", "Institut national de santé publique du Québec (INSPQ)", "https://www.inspq.qc.ca/mieux-vivre/grossesse/sante-securite/problemes-sante/signaux-d-alarme", ""),
}

def src(*keys):
    return [{"title": S[k][0], "organization": S[k][1], "url": S[k][2], "published_on": S[k][3], "accessed_on": ACCESSED} for k in keys]

APPELER = "Appelez les secours (numéros sur la page Urgences de PharmaProxi) ou faites conduire la personne au centre de santé (CSCom), au CSRéf ou à l'hôpital le plus proche."
OU = ("Service d'urgence de l'hôpital le plus proche, CSRéf ou CSCom. La page Urgences de PharmaProxi indique les numéros d'urgence et les services référencés. "
      "Apprendre les gestes de premiers secours : renseignez-vous auprès de la Croix-Rouge malienne.")

ARTICLES = [
    dict(slug="premiers-secours-saignement", title="Saignement important : arrêter l'hémorragie", audiences=["tous"], keywords="saignement hemorragie sang plaie coupure blessure compression", is_featured=True,
         summary="Une plaie qui saigne beaucoup peut mettre la vie en danger en quelques minutes. Le geste essentiel : appuyer fort et sans relâcher sur la plaie.",
         body=dict(
             definition="Un saignement est grave quand le sang coule abondamment, gicle, ou ne s'arrête pas malgré quelques minutes de pression.",
             gestes="1. Protégez-vous si possible (gants, sachet plastique propre).\n2. Allongez la personne.\n3. Appuyez fort et directement sur la plaie avec un linge propre ou votre main, et ne relâchez pas.\n4. Si le linge est imbibé, n'enlevez pas le premier : ajoutez-en un autre par-dessus et continuez d'appuyer.\n5. Faites appeler les secours et gardez la pression jusqu'à leur arrivée ou jusqu'au centre de santé.\n6. Couvrez la personne pour qu'elle n'ait pas froid et restez auprès d'elle.",
             a_eviter="Ne retirez pas un objet planté dans la plaie : appuyez autour.\nNe posez pas de garrot improvisé (corde, fil) si vous n'êtes pas formé(e).\nN'appliquez ni terre, ni poudre, ni produit traditionnel sur la plaie.\nNe donnez ni à boire ni à manger.",
             urgence="Saignement qui ne s'arrête pas, sang qui gicle, personne pâle, froide, très essoufflée, somnolente ou qui perd connaissance : c'est une urgence vitale. " + APPELER,
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-brulure", title="Brûlure : refroidir tout de suite", audiences=["tous"], keywords="brulure brule feu eau bouillante huile chaude refroidir", is_featured=True,
         summary="Refroidir une brûlure avec de l'eau propre pendant au moins 20 minutes limite les dégâts. Jamais de beurre, d'huile, de dentifrice ni de produits traditionnels.",
         body=dict(
             definition="Une brûlure peut être causée par le feu, un liquide chaud (eau, huile, bouillie), un objet chaud, l'électricité ou un produit chimique.",
             gestes="1. Éloignez la personne de la source de chaleur (éteignez les flammes en roulant la personne au sol ou avec une couverture).\n2. Refroidissez la brûlure sous de l'eau propre, fraîche ou à température du robinet, pendant au moins 20 minutes.\n3. Retirez bagues, bracelets et vêtements autour de la brûlure, sauf s'ils collent à la peau.\n4. Couvrez avec un linge propre ou un film plastique alimentaire, sans serrer.\n5. Pour un produit chimique : rincez abondamment à l'eau en retirant les vêtements touchés.",
             a_eviter="Ne mettez ni beurre, ni huile, ni dentifrice, ni œuf, ni farine, ni produit traditionnel.\nNe percez pas les cloques.\nN'utilisez pas de glace.\nN'arrachez pas les vêtements collés à la peau.\nNe refroidissez pas trop longtemps un bébé ou une grande surface du corps : il risque d'avoir froid.",
             urgence="Brûlure étendue, profonde (peau blanche, noire ou cartonnée), au visage, aux mains, aux pieds ou aux parties intimes, brûlure électrique ou chimique, brûlure chez un bébé ou une personne âgée, difficulté à respirer après un incendie : " + APPELER,
             prevention="Gardez les enfants loin des foyers, des marmites et des lampes. Tournez les manches des casseroles vers l'intérieur. Rangez le pétrole, le gaz et les allumettes hors de portée.",
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-etouffement", title="Étouffement : quelqu'un s'étrangle", audiences=["tous", "enfant"], keywords="etouffement etrangle avale de travers obstruction tapes dans le dos heimlich", is_featured=True,
         summary="Une personne qui ne peut plus parler, tousser ni respirer après avoir avalé quelque chose : agissez immédiatement avec des tapes dans le dos puis des compressions.",
         body=dict(
             definition="L'étouffement survient quand un aliment ou un objet bloque les voies respiratoires. La personne porte souvent les mains à sa gorge.",
             gestes="Si la personne tousse et peut parler : encouragez-la à tousser, ne faites rien d'autre et restez près d'elle.\n\nSi elle ne peut plus tousser, parler ni respirer (adulte ou enfant de plus d'un an) :\n1. Penchez-la en avant et donnez jusqu'à 5 tapes fortes dans le dos, entre les omoplates, avec le plat de la main.\n2. Si l'objet ne sort pas, faites jusqu'à 5 compressions abdominales : placez-vous derrière elle, un poing au-dessus du nombril, l'autre main par-dessus, et tirez fort vers vous et vers le haut.\n3. Alternez 5 tapes et 5 compressions jusqu'à ce que l'objet sorte.\n\nBébé de moins d'un an : tenez-le à plat ventre sur votre avant-bras, tête plus basse, et donnez 5 tapes dans le dos ; puis retournez-le et faites 5 compressions sur la poitrine avec deux doigts, au milieu.",
             a_eviter="Ne mettez pas les doigts au fond de la gorge à l'aveugle.\nNe faites pas de compressions abdominales à un bébé de moins d'un an.\nNe secouez pas l'enfant la tête en bas.",
             urgence="Si la personne perd connaissance : allongez-la, faites appeler les secours et commencez la réanimation (voir la fiche « Personne inconsciente »). Après des compressions abdominales, une consultation est recommandée même si tout va bien.",
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-inconscient", title="Personne inconsciente : respiration, position et réanimation", audiences=["tous"], keywords="inconscient perte de connaissance evanoui position laterale de securite pls reanimation massage cardiaque", is_featured=True,
         summary="Une personne qui ne répond pas : vérifiez si elle respire. Si oui, mettez-la sur le côté ; si non, appelez les secours et commencez le massage cardiaque.",
         body=dict(
             definition="Une personne est inconsciente quand elle ne répond ni à la voix ni quand on lui touche l'épaule.",
             gestes="1. Vérifiez que l'endroit est sans danger pour vous.\n2. Parlez-lui fort et touchez ses épaules. Pas de réponse : criez pour avoir de l'aide.\n3. Basculez doucement sa tête en arrière en soulevant le menton, et regardez si elle respire normalement pendant 10 secondes au plus.\n\nElle respire : tournez-la sur le côté (position latérale de sécurité), tête légèrement en arrière, bouche vers le sol, et surveillez sa respiration jusqu'aux secours.\n\nElle ne respire pas, ou respire mal (hoquets) : faites appeler les secours, puis appuyez fort et vite au centre de la poitrine, bras tendus, environ 100 à 120 fois par minute, en enfonçant de 5 à 6 cm chez l'adulte. Si vous êtes formé(e), alternez 30 compressions et 2 insufflations. Continuez sans vous arrêter jusqu'à l'arrivée des secours ou jusqu'à ce que la personne respire.",
             a_eviter="Ne donnez rien à boire à une personne inconsciente.\nNe la laissez pas seule sur le dos si elle respire : elle risque de s'étouffer.\nN'arrêtez pas le massage cardiaque pour vérifier sans cesse.",
             urgence="Toute perte de connaissance est une urgence. " + APPELER,
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-convulsions", title="Convulsions : protéger sans retenir", audiences=["tous", "enfant"], keywords="convulsions crise epilepsie tremblements perte de connaissance fievre enfant", is_featured=False,
         summary="Pendant une crise de convulsions, protégez la personne des chocs, ne mettez rien dans sa bouche et mettez-la sur le côté quand les mouvements s'arrêtent.",
         body=dict(
             definition="Les convulsions sont des mouvements brusques et incontrôlés, souvent avec perte de connaissance. Elles peuvent être dues à l'épilepsie, à une forte fièvre chez l'enfant, au paludisme grave, à une méningite ou à d'autres maladies.",
             gestes="1. Restez calme, regardez l'heure.\n2. Éloignez les objets dangereux et protégez la tête avec un vêtement plié.\n3. Desserrez ce qui serre le cou.\n4. Quand les mouvements s'arrêtent, mettez la personne sur le côté et surveillez sa respiration.\n5. Restez auprès d'elle jusqu'à ce qu'elle reprenne ses esprits.",
             a_eviter="Ne la retenez pas de force.\nNe mettez rien dans sa bouche (ni cuillère, ni doigts, ni liquide) : elle ne peut pas avaler sa langue.\nNe lui donnez rien à boire avant qu'elle soit bien réveillée.\nN'utilisez pas de remède traditionnel par le nez ou la bouche.",
             urgence="Crise qui dure plus de 5 minutes, crises qui se répètent, première crise, crise chez un bébé, une femme enceinte ou après un choc à la tête, fièvre avec raideur de la nuque, blessure, ou personne qui ne se réveille pas : " + APPELER,
             ou_au_mali=OU),
         sources=src("ifrc", "imci")),
    dict(slug="premiers-secours-noyade", title="Noyade : sortir de l'eau et faire respirer", audiences=["tous", "enfant"], keywords="noyade noye fleuve puits mare piscine reanimation", is_featured=False,
         summary="Sortez la personne de l'eau sans vous mettre en danger, faites appeler les secours et, si elle ne respire pas, commencez la réanimation.",
         body=dict(
             definition="La noyade survient quand l'eau empêche de respirer : dans le fleuve, une mare, un puits, une bassine ou une piscine. Un enfant peut se noyer en silence dans très peu d'eau.",
             gestes="1. Sortez la personne de l'eau sans vous mettre en danger : tendez une perche, une corde, un objet qui flotte plutôt que de plonger si vous ne savez pas bien nager.\n2. Faites appeler les secours.\n3. Si elle respire : mettez-la sur le côté, couvrez-la, surveillez-la.\n4. Si elle ne respire pas : commencez la réanimation (voir la fiche « Personne inconsciente »). Pour une noyade, les insufflations sont particulièrement importantes si vous êtes formé(e).\n5. Même si elle va bien, elle doit être examinée : des difficultés respiratoires peuvent apparaître plus tard.",
             a_eviter="Ne secouez pas la personne et ne la mettez pas la tête en bas pour « vider l'eau ».\nNe plongez pas si vous ne savez pas nager.\nN'attendez pas pour commencer la réanimation.",
             prevention="Ne laissez jamais un enfant seul près de l'eau, même un instant. Couvrez les puits, les bassines et les réservoirs. Apprenez aux enfants à nager quand c'est possible.",
             urgence="Toute personne retirée de l'eau inconsciente, qui tousse beaucoup, respire mal ou est confuse doit être conduite en urgence au centre de santé. " + APPELER,
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-morsure-serpent", title="Morsure de serpent : les bons gestes", audiences=["tous"], keywords="morsure serpent vipere cobra venin garrot pierre noire scorpion champ", is_featured=True,
         summary="Après une morsure de serpent, il faut rester calme, immobiliser le membre et aller au plus vite au centre de santé. Le garrot, l'incision et les remèdes traditionnels font perdre du temps et aggravent.",
         body=dict(
             definition="Certaines morsures de serpent injectent un venin qui peut provoquer gonflement, saignements, paralysie ou la mort. Seul un traitement à l'hôpital ou au centre de santé (sérum antivenimeux et soins) est efficace.",
             gestes="1. Éloignez-vous du serpent ; ne cherchez pas à l'attraper.\n2. Rassurez la personne et faites-la rester aussi immobile que possible.\n3. Retirez bagues, bracelets, chaussures serrées avant que le membre ne gonfle.\n4. Immobilisez le membre mordu (attelle, écharpe), sans serrer.\n5. Transportez la personne allongée et rapidement vers le centre de santé ou l'hôpital le plus proche ; évitez qu'elle marche.\n6. Notez l'heure de la morsure ; une photo du serpent prise sans danger peut aider.",
             a_eviter="Pas de garrot, pas de lien serré.\nN'incisez pas, ne sucez pas la plaie.\nPas de « pierre noire », de cérumen, de produits traditionnels, de glace ni de choc électrique : ces pratiques ne marchent pas et font perdre un temps précieux.\nNe donnez pas d'alcool.",
             urgence="Toute morsure de serpent doit être vue au centre de santé, même si la personne se sent bien au début : les signes peuvent apparaître plus tard. " + APPELER,
             prevention="Portez des chaussures fermées et une lampe la nuit, regardez où vous posez les mains et les pieds (bois, herbes hautes, greniers), dégagez les abords de la maison.",
             ou_au_mali=OU),
         sources=src("who_snake", "msd_snake", "africacheck_snake")),
    dict(slug="premiers-secours-diarrhee-enfant", title="Diarrhée de l'enfant : réhydrater", audiences=["enfant"], keywords="diarrhee enfant bebe sro sels de rehydratation zinc deshydratation selles liquides", is_featured=True,
         summary="La diarrhée fait perdre beaucoup d'eau à l'enfant. Donnez des sels de réhydratation orale (SRO) dès le début, continuez l'allaitement et les repas, et consultez.",
         body=dict(
             definition="On parle de diarrhée quand l'enfant a au moins trois selles liquides par jour. Le danger principal est la déshydratation, surtout chez les bébés.",
             gestes="1. Donnez des SRO (sels de réhydratation orale, vendus en pharmacie et souvent disponibles au CSCom) : préparez-les avec la quantité d'eau potable indiquée sur le sachet.\n2. Faites boire souvent, par petites gorgées ou à la cuillère, surtout après chaque selle. Si l'enfant vomit, attendez 10 minutes puis reprenez plus lentement.\n3. Continuez l'allaitement maternel, encore plus souvent que d'habitude.\n4. Continuez à nourrir l'enfant.\n5. Allez au centre de santé : l'agent de santé peut prescrire du zinc pendant 10 à 14 jours, qui raccourcit la diarrhée.",
             a_eviter="N'arrêtez pas l'allaitement ni l'alimentation.\nNe donnez pas de médicament contre la diarrhée sans avis médical.\nÉvitez les boissons très sucrées (sodas, jus industriels) à la place des SRO.",
             urgence="Allez immédiatement au centre de santé si l'enfant ne peut pas boire ou téter, vomit tout, est très endormi ou difficile à réveiller, a les yeux très creux, si la peau pincée revient très lentement, s'il a du sang dans les selles ou de la fièvre, ou si la diarrhée dure plus de 14 jours.",
             prevention="Lavage des mains au savon, eau potable, allaitement maternel exclusif pendant 6 mois, latrines propres, vaccination contre le rotavirus.",
             ou_au_mali=OU),
         sources=src("who_diarrhoea", "msf_ors", "imci")),
    dict(slug="premiers-secours-signes-danger-enfant", title="Enfant malade : les signes de danger", audiences=["enfant"], keywords="signes de danger enfant ne tete plus vomit tout convulsions endormi respiration rapide fievre bebe", is_featured=True,
         summary="Certains signes montrent qu'un enfant est en danger et doit être conduit immédiatement au centre de santé, sans attendre et sans automédication.",
         body=dict(
             definition="Chez l'enfant, une maladie peut s'aggraver très vite (paludisme grave, pneumonie, déshydratation, méningite). Les « signes généraux de danger » de l'OMS aident les parents à réagir à temps.",
             situations="Conduisez l'enfant au centre de santé IMMÉDIATEMENT s'il présente l'un de ces signes :\n• il ne peut pas boire ou téter ;\n• il vomit tout ce qu'il avale ;\n• il a eu des convulsions ;\n• il est très endormi, mou ou difficile à réveiller.\n\nConsultez aussi le jour même si l'enfant respire vite ou difficilement, tousse depuis plusieurs jours, a de la fièvre (surtout un bébé de moins de 2 mois), a une diarrhée avec du sang, ou a les pieds gonflés.",
             gestes="1. Partez tout de suite vers le centre de santé.\n2. Pendant le trajet, continuez à allaiter ou à faire boire l'enfant s'il le peut.\n3. Couvrez-le sans trop l'habiller s'il a de la fièvre.\n4. Apportez son carnet de santé et les médicaments déjà donnés.",
             a_eviter="N'attendez pas « de voir demain ».\nNe donnez pas de médicament au hasard ni de remède traditionnel qui retarde la consultation.",
             urgence=APPELER,
             ou_au_mali=OU),
         sources=src("imci", "ccm")),
    dict(slug="premiers-secours-signes-danger-grossesse", title="Grossesse : les signes d'alerte", audiences=["femme_enceinte"], keywords="grossesse enceinte signes de danger saignement perte des eaux maux de tete convulsions fievre bebe ne bouge plus", is_featured=True,
         summary="Pendant la grossesse et après l'accouchement, certains signes imposent d'aller immédiatement à la maternité ou au centre de santé.",
         body=dict(
             definition="La plupart des grossesses se passent bien, mais certaines complications (hémorragie, éclampsie, infection, accouchement prématuré) doivent être prises en charge très vite.",
             situations="Allez immédiatement à la maternité ou au centre de santé en cas de :\n• saignement par le vagin ;\n• perte de liquide (perte des eaux) ;\n• maux de tête violents, vision trouble, gonflement soudain du visage ou des mains ;\n• convulsions ou perte de connaissance ;\n• fièvre ;\n• fortes douleurs au ventre ;\n• bébé qui bouge moins ou ne bouge plus ;\n• contractions régulières avant le terme ;\n• difficulté à respirer.\n\nAprès l'accouchement : saignement abondant, fièvre, douleurs fortes, pertes qui sentent mauvais, maux de tête violents ou convulsions.",
             gestes="1. Partez sans attendre, accompagnée si possible.\n2. Prenez votre carnet de grossesse et vos examens.\n3. Si vous saignez beaucoup, restez allongée pendant le transport.",
             a_eviter="N'attendez pas que cela passe.\nNe prenez pas de médicament ou de remède traditionnel sans avis médical.",
             prevention="Faites toutes les consultations prénatales et les vaccins Td, dormez sous moustiquaire imprégnée, et préparez à l'avance le transport et le lieu de l'accouchement.",
             urgence=APPELER,
             ou_au_mali="Maternité, CSCom, CSRéf ou hôpital le plus proche. Consultez la rubrique PharmaProxi Femme pour suivre votre grossesse."),
         sources=src("inspq_preg", "ifrc")),
    dict(slug="premiers-secours-coup-de-chaleur", title="Coup de chaleur : refroidir vite", audiences=["tous", "senior", "enfant"], keywords="coup de chaleur canicule chaleur insolation deshydratation confusion", is_featured=False,
         summary="Pendant les fortes chaleurs, une personne confuse, très chaude et qui ne transpire plus fait peut-être un coup de chaleur : il faut la refroidir immédiatement.",
         body=dict(
             definition="Le coup de chaleur survient quand le corps n'arrive plus à se refroidir, surtout pendant les fortes chaleurs (avril, mai), chez les personnes âgées, les jeunes enfants, les malades et ceux qui travaillent au soleil.",
             gestes="1. Mettez la personne à l'ombre, dans un endroit aéré.\n2. Enlevez les vêtements en trop.\n3. Refroidissez-la tout de suite : mouillez tout le corps avec de l'eau fraîche et éventez-la, ou immergez-la dans l'eau fraîche jusqu'au cou si c'est possible et sans danger.\n4. Si elle est bien consciente et peut avaler, donnez-lui à boire de l'eau fraîche par petites gorgées.\n5. Faites appeler les secours.",
             a_eviter="Ne donnez rien à boire à une personne confuse ou inconsciente.\nNe donnez pas de paracétamol ou d'aspirine pour faire baisser une température due à la chaleur.\nNe la laissez pas seule.",
             urgence="Confusion, propos incohérents, convulsions, perte de connaissance, peau très chaude : c'est une urgence vitale. " + APPELER,
             prevention="Buvez régulièrement sans attendre la soif, évitez le soleil aux heures les plus chaudes, portez des vêtements légers et un chapeau, prenez des nouvelles des personnes âgées et ne laissez jamais un enfant dans une voiture.",
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-intoxication", title="Intoxication : un produit a été avalé", audiences=["tous", "enfant"], keywords="intoxication empoisonnement produit menager eau de javel petrole pesticide medicaments enfant a avale", is_featured=False,
         summary="Un enfant ou un adulte a avalé un produit dangereux (pétrole, eau de Javel, pesticide, médicaments) : ne faites pas vomir et allez immédiatement au centre de santé avec l'emballage.",
         body=dict(
             definition="Les intoxications les plus fréquentes chez l'enfant sont dues au pétrole, à l'eau de Javel, aux produits ménagers, aux pesticides et aux médicaments laissés à portée de main.",
             gestes="1. Retirez ce qui reste dans la bouche.\n2. Gardez l'emballage, la bouteille ou la boîte du médicament pour le montrer aux soignants.\n3. Si le produit est sur la peau ou dans les yeux : rincez longuement à l'eau propre.\n4. Allez immédiatement au centre de santé ou à l'hôpital.\n5. Si la personne est inconsciente et respire, mettez-la sur le côté.",
             a_eviter="Ne faites pas vomir (pas de doigt dans la gorge, pas d'eau salée).\nNe donnez ni lait, ni huile, ni remède traditionnel « contre le poison ».\nNe donnez rien à boire sauf avis d'un soignant.",
             urgence="Difficulté à respirer, somnolence, convulsions, vomissements, brûlure de la bouche, ou ingestion de pétrole, de pesticide ou de nombreux comprimés : " + APPELER,
             prevention="Rangez médicaments et produits dangereux en hauteur, fermés, hors de portée des enfants. Ne mettez jamais du pétrole ou un produit dans une bouteille d'eau ou de boisson.",
             ou_au_mali=OU),
         sources=src("ifrc")),
    dict(slug="premiers-secours-avc", title="AVC : reconnaître les signes et agir vite", audiences=["adulte", "senior"], keywords="avc accident vasculaire cerebral attaque paralysie bouche de travers parole bras", is_featured=False,
         summary="Bouche de travers, bras qui ne se lève plus, parole difficile : ce sont des signes d'AVC. Chaque minute compte, il faut aller immédiatement à l'hôpital.",
         body=dict(
             definition="L'accident vasculaire cérébral (AVC) survient quand une partie du cerveau ne reçoit plus de sang. Plus la prise en charge est rapide, plus les séquelles peuvent être limitées.",
             situations="Pensez à l'AVC si ces signes apparaissent brutalement :\n• le visage est déformé, la bouche de travers ;\n• un bras ou une jambe devient faible ou ne bouge plus ;\n• la parole est difficile ou incompréhensible ;\n• aussi : trouble de la vue, mal de tête très violent et soudain, perte d'équilibre.",
             gestes="1. Notez l'heure du début des signes.\n2. Faites conduire immédiatement la personne à l'hôpital (de préférence un hôpital avec un service de neurologie ou d'urgences) ou appelez les secours.\n3. Si elle est inconsciente et respire, mettez-la sur le côté.",
             a_eviter="N'attendez pas que les signes disparaissent.\nNe donnez rien à manger ni à boire : la personne peut avoir du mal à avaler.\nNe donnez pas d'aspirine ou d'autre médicament sans avis médical.",
             urgence="Les signes d'AVC sont toujours une urgence, même s'ils disparaissent. " + APPELER,
             prevention="Faites contrôler votre tension artérielle, suivez votre traitement contre l'hypertension ou le diabète, limitez le sel et le tabac.",
             ou_au_mali=OU),
         sources=src("ifrc")),
]

def sql_str(v):
    return "'" + str(v).replace("'", "''") + "'"

def article_sql(a):
    body = json.dumps(a["body"], ensure_ascii=False)
    arr = lambda xs: "array[" + ",".join(sql_str(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"
    out = [f"""insert into public.health_articles (slug, category_id, kind, title, summary, keywords, audiences, recommendation, body, myths, faq,
  exam_codes, specialty_codes, is_featured, status, author_name)
select {sql_str(a['slug'])}, c.id, 'fiche', {sql_str(a['title'])}, {sql_str(a['summary'])}, {sql_str(a['keywords'])}, {arr(a['audiences'])}, null,
  public.health_clean_body($j${body}$j$::jsonb), '[]'::jsonb, '[]'::jsonb, '{{}}'::text[], array['medecine_urgence','medecine_generale']::text[], {'true' if a['is_featured'] else 'false'},
  'draft', 'Équipe PharmaProxi'
from public.health_categories c where c.slug = 'urgences'
on conflict (slug) do nothing;"""]
    for i, s in enumerate(a["sources"]):
        out.append(f"""insert into public.health_sources (article_id, title, organization, url, published_on, accessed_on, sort_order)
select a.id, {sql_str(s['title'])}, {sql_str(s['organization'])}, {sql_str(s['url'])}, {sql_str(s['published_on']) if s['published_on'] else 'null'}, date {sql_str(s['accessed_on'])}, {i}
from public.health_articles a where a.slug = {sql_str(a['slug'])} and not exists (select 1 from public.health_sources x where x.article_id = a.id and x.url = {sql_str(s['url'])});""")
    out.append(f"""insert into public.health_article_history (article_id, actor_name, action, to_status, note)
select a.id, 'Équipe PharmaProxi', 'création', 'draft', 'Brouillon initial : à relire et valider par un professionnel de santé (gestes, adaptation au Mali)'
from public.health_articles a where a.slug = {sql_str(a['slug'])} and not exists (select 1 from public.health_article_history h where h.article_id = a.id);""")
    return "\n".join(out)

header = """-- ============================================================================
-- PharmaProxi — Santé essentielle : fiches « Premiers secours » (BROUILLONS)
-- Généré par scripts/first-aid-content.py. Aucune fiche n'est publiée : chacune doit être
-- relue, validée par un validateur médical enregistré, puis publiée depuis /redaction-sante.
-- Sources consultées le 01/11/2026. À exécuter APRÈS la mise à jour 0.18.0. Sans doublon si relancé.
-- ============================================================================
begin;
"""
Path(__file__).resolve().parent.parent.joinpath("supabase/content/premiers-secours-brouillons.sql").write_text(
    header + "\n" + "\n\n".join(article_sql(a) for a in ARTICLES) + f"\n\ncommit;\n\n-- Contrôle : {len(ARTICLES)} fiches en brouillon\nselect count(*) as fiches_premiers_secours from public.health_articles a join public.health_categories c on c.id = a.category_id where c.slug = 'urgences';\n",
    encoding="utf-8")
print("ok", len(ARTICLES))
