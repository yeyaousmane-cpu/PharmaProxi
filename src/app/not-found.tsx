import Link from "next/link";
import { getT } from "@/lib/i18n";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="container-page py-16 text-center">
      <h1 className="text-2xl font-bold">{t("nf.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("nf.text")}</p>
      <Link prefetch={false} href="/" className="mt-6 inline-block font-semibold text-primary underline">{t("nf.home")}</Link>
    </div>
  );
}
