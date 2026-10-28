import { getGeo } from "@/lib/geo";
import { ActionForm, SubmitButton } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { addGeo, importGeo } from "@/app/actions/admin";

export const metadata = { title: "Géographie — administration" };

export default async function AdminGeo() {
  const geo = await getGeo();
  const regionName = (id: string) => geo.regions.find((r) => r.id === id)?.name ?? "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Référentiel géographique</h1>
      <p className="text-sm text-muted-foreground">N&apos;ajoutez que des données vérifiées (nomenclature officielle, INSTAT, Direction nationale de l&apos;intérieur) et indiquez la source.</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Ajouter un cercle</CardTitle></CardHeader><CardContent>
          <ActionForm action={addGeo} resetOnSuccess className="space-y-2"><input type="hidden" name="kind" value="circle" />
            <Select name="parent_id" required aria-label="Région"><option value="">Région</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Input name="name" placeholder="Nom du cercle" required aria-label="Nom du cercle" /><Input name="source" placeholder="Source" aria-label="Source" />
            <SubmitButton size="sm">Ajouter</SubmitButton></ActionForm></CardContent></Card>
        <Card><CardHeader><CardTitle>Ajouter une commune</CardTitle></CardHeader><CardContent>
          <ActionForm action={addGeo} resetOnSuccess className="space-y-2"><input type="hidden" name="kind" value="commune" />
            <Select name="parent_id" required aria-label="Région"><option value="">Région</option>{geo.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Select name="circle_id" aria-label="Cercle"><option value="">Cercle (facultatif)</option>{geo.circles.map((c) => <option key={c.id} value={c.id}>{c.name} ({regionName(c.region_id)})</option>)}</Select>
            <Input name="name" placeholder="Nom de la commune" required aria-label="Nom de la commune" /><Input name="source" placeholder="Source" aria-label="Source" />
            <SubmitButton size="sm">Ajouter</SubmitButton></ActionForm></CardContent></Card>
        <Card><CardHeader><CardTitle>Ajouter un quartier</CardTitle></CardHeader><CardContent>
          <ActionForm action={addGeo} resetOnSuccess className="space-y-2"><input type="hidden" name="kind" value="locality" />
            <Select name="parent_id" required aria-label="Commune"><option value="">Commune</option>{geo.communes.map((c) => <option key={c.id} value={c.id}>{c.name} ({regionName(c.region_id)})</option>)}</Select>
            <Input name="name" placeholder="Nom du quartier / village" required aria-label="Nom du quartier" /><Input name="source" placeholder="Source" aria-label="Source" />
            <SubmitButton size="sm">Ajouter</SubmitButton></ActionForm></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Import CSV</CardTitle><CardDescription>Colonnes : region ; cercle ; commune ; quartier ; source. Les éléments existants sont ignorés.</CardDescription></CardHeader>
        <CardContent><ActionForm action={importGeo} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Fichier" htmlFor="geo-file" className="flex-1"><Input id="geo-file" type="file" name="file" accept=".csv,text/csv" required /></Field>
          <SubmitButton variant="secondary" pendingText="Import…">Importer</SubmitButton></ActionForm></CardContent></Card>
      <Card><CardHeader><CardTitle>Contenu actuel</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-1">Région</th><th className="text-right">Cercles</th><th className="text-right">Communes</th><th className="text-right">Quartiers</th></tr></thead>
            <tbody>{geo.regions.map((r) => {
              const cms = geo.communes.filter((c) => c.region_id === r.id);
              return <tr key={r.id} className="border-b"><td className="py-1">{r.name}</td><td className="text-right">{geo.circles.filter((c) => c.region_id === r.id).length}</td><td className="text-right">{cms.length}</td>
                <td className="text-right">{geo.localities.filter((l) => cms.some((c) => c.id === l.commune_id)).length}</td></tr>;
            })}</tbody></table>
        </CardContent></Card>
    </div>
  );
}
