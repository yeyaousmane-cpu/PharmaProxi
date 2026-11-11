import { ShareViewer } from "@/components/passeport/share-viewer";

export const metadata = { title: "Passeport santé partagé", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="container-page max-w-2xl space-y-4 py-6">
      <h1 className="text-2xl font-extrabold text-[#052D1E]">Passeport santé partagé</h1>
      {/^[0-9a-f]{64}$/.test(token) ? <ShareViewer token={token} /> : <p role="alert" className="rounded-2xl border bg-amber-50 p-5 font-semibold text-amber-950">Ce lien n&apos;est pas valide.</p>}
      <p className="text-xs text-muted-foreground">SantéProxi ne pose aucun diagnostic. En cas d&apos;urgence, contactez les services de secours.</p>
    </div>
  );
}
