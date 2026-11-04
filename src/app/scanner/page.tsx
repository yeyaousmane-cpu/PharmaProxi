import { ScanBarcode } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Scanner } from "@/components/scanner/scanner";

export const metadata = { title: "Scanner un médicament", description: "Scannez le code-barres d'une boîte pour retrouver le nom, le dosage et la forme du médicament." };

export default async function ScannerPage() {
  const s = await getSession();
  return (
    <div className="container-page max-w-xl space-y-4 py-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-deep"><ScanBarcode className="size-7 text-primary" aria-hidden /> Scanner un médicament</h1>
        <p className="text-muted-foreground">Retrouvez le nom, le dosage et la forme d&apos;un médicament à partir du code-barres de sa boîte. L&apos;image de la caméra reste sur votre téléphone : elle n&apos;est pas envoyée.</p>
      </header>
      <Scanner signedIn={Boolean(s)} />
    </div>
  );
}
