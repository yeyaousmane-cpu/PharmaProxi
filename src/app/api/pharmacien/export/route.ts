import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { rowsToXlsx } from "@/lib/xlsx";

/** Export CSV du stock d'une pharmacie — la RLS garantit que seuls ses membres l'obtiennent. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("pharmacy") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Paramètre invalide" }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data, error } = await supabase
    .from("pharmacy_inventory")
    .select("quantity, reserved_quantity, price_xof, is_available, on_order, declared, stock_updated_at, medicine_catalog(brand_name, active_ingredient, generic_name, dosage, form, packaging, manufacturer)")
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
      prix_fcfa: r.price_xof, disponible: r.is_available ? "oui" : "non", sur_commande: r.on_order ? "oui" : "non",
      renseigne: r.declared ? "oui" : "non", derniere_mise_a_jour: r.stock_updated_at,
    };
  });
  const columns = ["nom_commercial", "principe_actif", "nom_generique", "dosage", "forme", "conditionnement", "fabricant", "quantite", "quantite_reservee", "prix_fcfa", "disponible", "sur_commande", "renseigne", "derniere_mise_a_jour"];
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const buf = await rowsToXlsx("Stock", columns, rows);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-santeproxi-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const csv = toCsv(rows, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stock-santeproxi-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
