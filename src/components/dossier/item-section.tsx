import { Plus, Trash2, Pencil } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { deleteItem, saveItem } from "@/app/actions/dossier";
import { KINDS, SEVERITY, sortItems, type FieldDef, type ItemKind } from "@/lib/dossier/config";
import type { Item } from "@/lib/dossier/server";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Disclosure } from "./disclosure";

const SEV_TONE: Record<string, string> = { legere: "bg-amber-50 text-amber-800 border-amber-200", moderee: "bg-orange-50 text-orange-800 border-orange-200", grave: "bg-red-50 text-red-800 border-red-200" };

export function FieldInput({ f, item, uid }: { f: FieldDef; item?: Item; uid: string }) {
  const id = `${f.name}-${uid}`;
  const v = item ? (item[f.name] ?? "") : "";
  const common = { id, name: f.name, required: f.required, placeholder: f.placeholder } as const;
  let control: React.ReactNode;
  if (f.type === "select") {
    control = (
      <Select {...common} defaultValue={String(v)}>
        <option value="">—</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{f.name === "severity" ? SEVERITY[o]?.fr ?? o : o}</option>)}
      </Select>
    );
  } else if (f.type === "textarea") {
    control = <Textarea {...common} rows={3} maxLength={4000} defaultValue={String(v)} />;
  } else {
    const type = f.type === "year" ? "number" : f.type === "phone" ? "tel" : f.type;
    control = (
      <>
        <Input {...common} type={type} defaultValue={String(v)} maxLength={f.type === "text" ? 120 : undefined}
          min={f.type === "year" ? 1900 : undefined} max={f.type === "year" ? new Date().getUTCFullYear() : undefined}
          inputMode={f.type === "year" ? "numeric" : f.type === "phone" ? "tel" : undefined} list={f.suggestions ? `${id}-list` : undefined} />
        {f.suggestions && <datalist id={`${id}-list`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </>
    );
  }
  return <Field label={f.label} htmlFor={id} required={f.required} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>{control}</Field>;
}

function ItemForm({ kind, personId, back, item, extra }: { kind: ItemKind; personId: string; back: string; item?: Item; extra?: React.ReactNode }) {
  const def = KINDS[kind];
  const uid = item?.id ?? `new-${kind}`;
  return (
    <ActionForm action={saveItem} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!item}>
      <input type="hidden" name="person_id" value={personId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="back" value={back} />
      {item && <input type="hidden" name="id" value={item.id} />}
      {def.fields.map((f) => <FieldInput key={f.name} f={f} item={item} uid={uid} />)}
      {!item && extra}
      <SubmitButton size="sm" className="w-fit sm:col-span-2">{item ? "Enregistrer" : <><Plus aria-hidden /> {def.add}</>}</SubmitButton>
    </ActionForm>
  );
}

export function ItemLine({ item }: { item: Item }) {
  const def = KINDS[item.kind];
  const meta = [
    item.category, item.event_date ? formatDate(item.event_date) : null, item.event_time ? item.event_time.replace(":", " h ") : null,
    item.year ? String(item.year) : null, item.place, item.who, item.phone ? formatPhone(item.phone) ?? item.phone : null,
    item.next_date ? `prochain rappel : ${formatDate(item.next_date)}` : null,
  ].filter(Boolean);
  const label = (n: string) => def.fields.find((f) => f.name === n)?.label ?? n;
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-deep">
        {item.title}
        {item.severity && <Badge className={cn("border", SEV_TONE[item.severity])}>{SEVERITY[item.severity]?.fr}</Badge>}
        {item.treatment_id && <Badge className="bg-brand-mint text-brand-deep">Rappels actifs</Badge>}
      </p>
      {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>}
      {(["detail", "result", "notes"] as const).filter((k) => item[k]).map((k) => (
        <p key={k} className="whitespace-pre-line text-sm"><span className="font-medium text-muted-foreground">{label(k)} : </span>{item[k]}</p>
      ))}
    </div>
  );
}

/** Une rubrique du dossier : liste, modification, suppression, ajout. */
export function ItemSection({ kind, items, personId, back, intro, extra, warn, children }: {
  kind: ItemKind; items: Item[]; personId: string; back: string; intro?: React.ReactNode; extra?: React.ReactNode;
  warn?: (i: Item) => React.ReactNode; children?: React.ReactNode;
}) {
  const def = KINDS[kind];
  const list = sortItems(items.filter((i) => i.kind === kind), def.order);
  return (
    <section id={kind} className="scroll-mt-24 space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold text-brand-deep">{def.label}</h2>
      {intro}
      {children}
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{def.empty}</p> : (
        <ul className="divide-y">
          {list.map((i) => (
            <li key={i.id} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <ItemLine item={i} />
                <ActionForm action={deleteItem}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton size="sm" variant="ghost" aria-label={`Supprimer ${i.title}`} confirm="Supprimer cet élément du dossier ?"><Trash2 aria-hidden /></SubmitButton>
                </ActionForm>
              </div>
              {warn?.(i)}
              <details>
                <summary className="flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary"><Pencil className="size-3.5" aria-hidden /> Modifier</summary>
                <div className="mt-2 rounded-xl bg-muted/40 p-3"><ItemForm kind={kind} personId={personId} back={back} item={i} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary={def.add} defaultOpen={list.length === 0} className="rounded-xl border border-dashed p-3">
        <ItemForm kind={kind} personId={personId} back={back} extra={extra} />
      </Disclosure>
    </section>
  );
}
