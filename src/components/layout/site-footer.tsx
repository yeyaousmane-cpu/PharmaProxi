import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-white pb-20 md:pb-0">
      <div className="container-page grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold text-brand-deep">PharmaProxi</p>
          <p className="mt-1 text-muted-foreground">Votre pharmacie, plus proche de vous.</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Service de mise en relation. Ne remplace pas l&apos;avis d&apos;un professionnel de santé. En cas d&apos;urgence, contactez les services d&apos;urgence.
          </p>
        </div>
        <nav aria-label="Informations" className="flex flex-col gap-2">
          <Link prefetch={false} href="/pharmacies" className="hover:underline">Annuaire des pharmacies</Link>
          <Link prefetch={false} href="/sante" className="hover:underline">Santé essentielle</Link>
          <Link prefetch={false} href="/assistant" className="hover:underline">Assistant santé</Link>
          <Link prefetch={false} href="/femme" className="hover:underline">PharmaProxi Femme</Link>
          <Link prefetch={false} href="/infirmiers" className="hover:underline">Infirmiers et soins à domicile</Link>
          <Link prefetch={false} href="/garde" className="hover:underline">Pharmacies de garde</Link>
          <Link prefetch={false} href="/laboratoires" className="hover:underline">Laboratoires et examens</Link>
          <Link prefetch={false} href="/urgences" className="hover:underline">Urgences</Link>
          <Link prefetch={false} href="/carte" className="hover:underline">Carte</Link>
          <Link prefetch={false} href="/infos/securite" className="hover:underline">Bon usage et sécurité</Link>
          <Link prefetch={false} href="/infos/confidentialite" className="hover:underline">Confidentialité</Link>
          <Link prefetch={false} href="/infos/conditions" className="hover:underline">Conditions d&apos;utilisation</Link>
          <Link prefetch={false} href="/infos/contact" className="hover:underline">Contact</Link>
        </nav>
        <nav aria-label="Professionnels" className="flex flex-col gap-2">
          <Link prefetch={false} href="/pharmacien/inscription" className="hover:underline">Inscrire ma pharmacie</Link>
          <Link prefetch={false} href="/medecin/inscription" className="hover:underline">Référencer ma pratique (médecins)</Link>
          <Link prefetch={false} href="/clinique/inscription" className="hover:underline">Inscrire une clinique</Link>
          <Link prefetch={false} href="/livraison" className="hover:underline">Devenir livreur</Link>
          <Link prefetch={false} href="/fonctionnement" className="hover:underline">Comment ça marche ?</Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="container-page py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} PharmaProxi · Projet porté et édité par{" "}
          <span className="font-semibold text-brand-deep">Yéya Ousmane Touré</span>
        </p>
      </div>
      <div className="mali-stripe h-1" aria-hidden />
    </footer>
  );
}
