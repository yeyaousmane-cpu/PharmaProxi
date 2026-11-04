"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Camera, CameraOff, Info, ScanBarcode } from "lucide-react";
import { lookupBarcode, searchCatalog, suggestGtin, type ScanResult } from "@/app/actions/v023";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Scanner de médicaments : lit le code-barres de la boîte (caméra du téléphone ou saisie) et affiche
 * le nom, le dosage et la forme. Il ne donne JAMAIS de posologie ni de conseil de prise.
 */
export function Scanner({ signedIn }: { signedIn: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [canScan, setCanScan] = useState(false);
  const [on, setOn] = useState(false);
  const [code, setCode] = useState("");
  const [res, setRes] = useState<ScanResult | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<{ id: string; brand_name: string; dosage: string | null; form: string | null }[]>([]);
  useEffect(() => { setCanScan("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia); }, []);
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); };
  useEffect(() => stop, []);
  const lookup = (c: string) => start(async () => { setRes(await lookupBarcode(c)); setCode(c); });
  const scan = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (!video.current) return;
      video.current.srcObject = stream.current; await video.current.play(); setOn(true);
      const D = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const det = new D({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "data_matrix"] });
      const loop = async () => {
        if (!stream.current || !video.current) return;
        const found = await det.detect(video.current).catch(() => []);
        const raw = found[0]?.rawValue?.replace(/^\(01\)|^01/, "").replace(/\D/g, "").slice(0, 14);
        if (raw && raw.length >= 8) { stop(); lookup(raw); return; }
        requestAnimationFrame(loop);
      };
      loop();
    } catch { stop(); setRes({ status: "invalid" }); }
  };
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border bg-white p-4">
        {canScan && (
          <div className="space-y-2">
            <video ref={video} playsInline muted className={on ? "aspect-video w-full rounded-xl bg-black object-cover" : "hidden"} />
            <button type="button" onClick={() => (on ? stop() : scan())} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white">
              {on ? <><CameraOff className="size-5" aria-hidden /> Arrêter la caméra</> : <><Camera className="size-5" aria-hidden /> Scanner la boîte avec la caméra</>}
            </button>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 text-sm">{canScan ? "Ou tapez les chiffres sous le code-barres" : "Tapez les chiffres sous le code-barres"}
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" placeholder="ex. 3400930000000" className="mt-1 h-11 w-full rounded-xl border px-3 text-lg tracking-wider" /></label>
          <button type="submit" disabled={pending || code.length < 8} className="h-11 rounded-xl border-2 border-primary px-4 font-semibold text-primary disabled:opacity-50">{pending ? "Recherche…" : "Chercher"}</button>
        </form>
      </section>

      {res?.status === "invalid" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Code non lu. Rapprochez la boîte, éclairez-la, ou tapez les chiffres.</p>}
      {res?.status === "found" && (
        <section className="space-y-2 rounded-2xl border-2 border-primary/30 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ScanBarcode className="size-4" aria-hidden /> Médicament reconnu</p>
          <h2 className="text-xl font-bold text-brand-deep">{res.product.brand_name}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {res.product.generic_name && <><dt className="text-muted-foreground">Substance</dt><dd>{res.product.generic_name}</dd></>}
            {res.product.dosage && <><dt className="text-muted-foreground">Dosage</dt><dd>{res.product.dosage}</dd></>}
            {res.product.form && <><dt className="text-muted-foreground">Forme</dt><dd>{res.product.form}</dd></>}
            {res.product.packaging && <><dt className="text-muted-foreground">Boîte</dt><dd>{res.product.packaging}</dd></>}
            {res.product.manufacturer && <><dt className="text-muted-foreground">Laboratoire</dt><dd>{res.product.manufacturer}</dd></>}
            <dt className="text-muted-foreground">Ordonnance</dt><dd>{res.product.requires_prescription ? "Obligatoire" : "Non obligatoire"}</dd>
          </dl>
          <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-950"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Pour savoir comment le prendre et à quelle dose, suivez votre ordonnance et la notice, et demandez au pharmacien. SantéProxi ne donne pas de posologie.</p>
          <div className="flex flex-wrap gap-2"><Link prefetch={false} href={`/produits/${res.product.id}`} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">Où le trouver</Link>
            <Link prefetch={false} href="/signaler" className="rounded-xl border px-4 py-2 text-sm font-semibold">Boîte suspecte ? Signaler</Link></div>
        </section>
      )}
      {res?.status === "unknown" && (
        <section className="space-y-3 rounded-2xl border bg-white p-4 text-sm">
          <p><strong>Ce code ({res.code}) n&apos;est pas encore dans notre base.</strong> Nous n&apos;affichons que des codes vérifiés par l&apos;équipe.</p>
          <p className="text-muted-foreground">Une boîte au code inconnu n&apos;est pas forcément suspecte. En cas de doute (emballage abîmé, prix anormal, vente dans la rue), demandez au pharmacien ou <Link prefetch={false} href="/signaler" className="text-primary underline">signalez-la</Link>.</p>
          {signedIn ? (
            <div className="space-y-2 rounded-xl bg-muted/40 p-3">
              <p className="font-semibold">Aidez-nous : de quel médicament s&apos;agit-il ?</p>
              <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom sur la boîte" className="h-10 flex-1 rounded-xl border px-3" />
                <button type="button" onClick={() => start(async () => setMatches(await searchCatalog(q)))} className="rounded-xl border-2 border-primary px-3 font-semibold text-primary">Chercher</button></div>
              {matches.length > 0 && (
                <ActionForm action={suggestGtin} className="space-y-2">
                  <input type="hidden" name="code" value={res.code} />
                  {matches.map((m) => <label key={m.id} className="flex items-center gap-2"><input type="radio" name="catalog_id" value={m.id} required className="size-4" />{m.brand_name} {m.dosage ?? ""} {m.form ?? ""}</label>)}
                  <SubmitButton size="sm">Proposer ce code</SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : <p><Link prefetch={false} href="/connexion?suite=/scanner" className="text-primary underline">Connectez-vous</Link> pour proposer ce code à l&apos;équipe.</p>}
        </section>
      )}
    </div>
  );
}
