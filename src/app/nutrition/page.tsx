import { ModulePage } from "@/components/health/module-page";
export const metadata = { title: "Nutrition", description: "Fiches de nutrition validées par des professionnels, adaptées aux habitudes alimentaires du Mali." };
export const revalidate = 600;
export default function Page() {
  return <ModulePage slug="nutrition" title="Nutrition" intro="Bien manger au quotidien, avec les plats et les habitudes du Mali : repères validés par des professionnels de la nutrition."
    links={[["/medecins", "Trouver un médecin ou un nutritionniste"], ["/ma-sante/mesures", "Noter ma tension et ma glycémie"], ["/prevention", "Campagnes de prévention"], ["/questions-pharmacien", "Poser une question à un pharmacien"]]} />;
}
