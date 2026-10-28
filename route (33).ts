import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

/** Export CSV du stock d'une pharmacie — la RLS garantit que seuls ses membres l'obtiennent. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("pharmacy") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Paramètre invalide" }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data, error } = await supabase
    .from("pharmacy_inventory")
    .select("quantity, reserved_quantity, price_xof, is_available, stock_updated_at, medicine_catalog(brand_name, active_ingredient, generic_name, dosage, form, packaging, manufacturer)")
    .eq("pharmacy_id", id);
  if (error) return NextResponse.json({ error: "Export impossible" }, { status: 500 });
  if (!data?.length) {
    const { data: member } = await supabase.from("pharmacy_members").select("pharmacy_id").eq("pharmacy_id", id).eq("user_id", auth.user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const rows = (data ?? []).map((r) => {
    const c = Array.isArray(r.medicine_catalog) ? r.medicine_catalog[0] : r.medicine_catalog;
    return {
      nom_commercial: c?.brand_name, principe_actif: c?.active_ingredient, nom_generique: c?.generic_name, dosage: c?.dosage, forme: c?.form,
      conditionnement: c?.packaging, fabricant: c?.manufacturer, quantite: r.quantity, quantite_reservee: r.reserved_quantity,
      prix_fcfa: r.price_xof, disponible: r.is_available ? "oui" : "non", derniere_mise_a_jour: r.stock_updated_at,
    };
  });
  const csv = toCsv(rows, ["nom_commercial", "principe_actif", "nom_generique", "dosage", "forme", "conditionnement", "fabricant", "quantite", "quantite_reservee", "prix_fcfa", "disponible", "derniere_mise_a_jour"]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-pharmaproxi-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
