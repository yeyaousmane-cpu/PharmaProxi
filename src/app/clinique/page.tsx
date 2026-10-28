import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CLINIC_KINDS, REVIEW_STATUS } from "@/lib/directory";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mes établissements" };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function MyClinics() {
  const s = await requireUser("/clinique");
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_members").select("member_role, clinics(id, name, kind, status)").eq("user_id", s.userId);
  const list = (data ?? []).map((r) => ({ role: r.member_role, c: one(r.clinics) })).filter((x) => x.c);
  if (list.length === 1) redirect(`/clinique/${list[0].c!.id}`);
  return (
    <div className="container-page max-w-3xl space-y-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-deep">Mes établissements</h1>
        <Link prefetch={false} href="/clinique/inscription" className={cn(buttonVariants(), "bg-brand-blue hover:bg-brand-blue/90")}><Plus aria-hidden /> Inscrire un établissement</Link>
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-semibold">Vous ne gérez encore aucun établissement.</p>
          <p className="text-sm text-muted-foreground">Inscrivez votre clinique ou demandez à son responsable de vous ajouter à l&apos;équipe.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.map(({ role, c }) => (
            <li key={c!.id}>
              <Link prefetch={false} href={`/clinique/${c!.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 hover:border-brand-blue">
                <span>
                  <span className="font-semibold">{c!.name}</span>
                  <span className="block text-xs text-muted-foreground">{CLINIC_KINDS[c!.kind]} · {role === "owner" ? "Responsable" : "Équipe"}</span>
                </span>
                <Badge className={REVIEW_STATUS[c!.status].className}>{REVIEW_STATUS[c!.status].label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
