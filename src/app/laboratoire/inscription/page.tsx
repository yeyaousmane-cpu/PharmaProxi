import { ProReserved } from "@/components/pro/pro-reserved";

export const metadata = { title: "Espace laboratoire" };

/** Les laboratoires sont rattachés par l'administrateur : pas d'inscription libre. */
export default function LabSignup() {
  return <ProReserved kind="laboratoire" />;
}
