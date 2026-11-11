import { ModulePage } from "@/components/health/module-page";
export const metadata = { title: "Rééducation", description: "Kinésithérapie, réadaptation, orthophonie, accompagnement du handicap : fiches validées et professionnels." };
export const revalidate = 600;
export default function Page() {
  return <ModulePage slug="reeducation" title="Rééducation" intro="Kinésithérapie, réadaptation après un accident ou une opération, orthophonie et accompagnement du handicap."
    links={[["/medecins", "Trouver un professionnel"], ["/cliniques", "Cliniques et centres"], ["/centres-specialises", "Centres spécialisés"], ["/infirmiers", "Soins à domicile"]]} />;
}
