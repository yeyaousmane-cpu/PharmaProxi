"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { humanizeError, type ActionState } from "@/lib/errors";

const uuid = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function rpc(name: string, args: Record<string, unknown>, ok: string, paths: string[] = ["/admin"]): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { error: humanizeError(error) };
  paths.forEach((p) => revalidatePath(p, "layout"));
  return { ok: true, message: ok, data };
}

export async function reviewPharmacy(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  const decision = z.enum(["verified", "rejected", "suspended"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return { error: "Requête invalide" };
  const checklist: Record<string, boolean> = {};
  for (const k of ["autorisation", "ordre", "identite", "adresse", "telephone"]) checklist[k] = fd.get(`check_${k}`) === "on";
  if (decision.data === "verified" && Object.values(checklist).some((v) => !v)) {
    return { error: "Cochez tous les points de contrôle avant de valider." };
  }
  return rpc("admin_review_pharmacy", { p_pharmacy: id.data, p_decision: decision.data, p_reason: s(fd, "reason") || null, p_checklist: checklist },
    "Décision enregistrée et journalisée.", ["/admin", `/pharmacies/${id.data}`]);
}

export async function setHoursVerified(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("pharmacy_id"));
  if (!id.success) return { error: "Requête invalide" };
  return rpc("admin_set_hours_verified", { p_pharmacy: id.data, p_verified: fd.get("verified") === "true" }, "Horaires mis à jour.");
}

export async function setRole(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("user_id"));
  const role = z.enum(["customer", "pharmacist", "admin"]).safeParse(fd.get("role"));
  if (!id.success || !role.success) return { error: "Requête invalide" };
  return rpc("admin_set_role", { p_user: id.data, p_role: role.data, p_grant: fd.get("grant") === "true" }, "Rôle mis à jour.");
}

export async function reviewCourier(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("user_id"));
  const st = z.enum(["verified", "rejected", "suspended", "pending"]).safeParse(fd.get("status"));
  if (!id.success || !st.success) return { error: "Requête invalide" };
  return rpc("admin_review_courier", { p_user: id.data, p_status: st.data, p_reason: s(fd, "reason") || null, p_document_ref: s(fd, "document_ref") || null }, "Livreur mis à jour.");
}

export async function assignCourier(_: ActionState, fd: FormData): Promise<ActionState> {
  const o = uuid.safeParse(fd.get("order_id"));
  const c = uuid.safeParse(fd.get("courier_id"));
  if (!o.success || !c.success) return { error: "Choisissez un livreur." };
  return rpc("assign_courier", { p_order: o.data, p_courier: c.data }, "Livreur affecté.");
}

export async function adminCancel(_: ActionState, fd: FormData): Promise<ActionState> {
  const o = uuid.safeParse(fd.get("order_id"));
  if (!o.success) return { error: "Requête invalide" };
  return rpc("advance_order", { p_order: o.data, p_to: "cancelled", p_note: s(fd, "note") }, "Commande annulée.");
}

export async function markRefunded(_: ActionState, fd: FormData): Promise<ActionState> {
  const o = uuid.safeParse(fd.get("order_id"));
  if (!o.success) return { error: "Requête invalide" };
  return rpc("admin_mark_refunded", { p_order: o.data, p_note: s(fd, "note") }, "Remboursement enregistré.");
}

export async function readOrderNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const o = uuid.safeParse(fd.get("order_id"));
  if (!o.success) return { error: "Requête invalide" };
  const r = await rpc("admin_read_order_note", { p_order: o.data, p_justification: s(fd, "justification") }, "Accès journalisé.", []);
  if (r.ok) r.message = `Accès journalisé. Note : ${(r.data as string | null) ?? "(aucune note)"}`;
  return r;
}

export async function runMaintenance(_: ActionState): Promise<ActionState> {
  const r = await rpc("admin_run_maintenance", {}, "");
  if (r.ok) {
    const d = r.data as { expired: number; critical_issues: number };
    r.message = `Maintenance effectuée : ${d.expired} commande(s) expirée(s), ${d.critical_issues} incohérence(s) critique(s).`;
  }
  return r;
}

export async function repairReservations(_: ActionState): Promise<ActionState> {
  const r = await rpc("admin_repair_reservations", {}, "");
  if (r.ok) {
    const d = r.data as { released: number; fixed: number };
    r.message = `Réparation journalisée : ${d.released} réservation(s) libérée(s), ${d.fixed} ligne(s) de stock recalculée(s).`;
  }
  return r;
}

export async function updateSetting(_: ActionState, fd: FormData): Promise<ActionState> {
  const key = s(fd, "key");
  const type = s(fd, "type");
  let value: unknown;
  if (type === "boolean") value = fd.get("value") === "on";
  else if (type === "number") {
    value = Number(s(fd, "value"));
    if (!Number.isFinite(value as number) || !Number.isInteger(value)) return { error: "Nombre entier attendu" };
  } else value = s(fd, "value");
  if (key === "delivery_enabled" && value === true && fd.get("ack") !== "on") {
    return { error: "Confirmez que la vérification réglementaire de la livraison a été effectuée." };
  }
  return rpc("admin_update_setting", { p_key: key, p_value: value }, "Paramètre enregistré.", ["/"]);
}

export async function reviewCatalog(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("catalog_id"));
  const st = z.enum(["approved", "rejected"]).safeParse(fd.get("status"));
  if (!id.success || !st.success) return { error: "Requête invalide" };
  return rpc("admin_review_catalog_item", { p_catalog: id.data, p_status: st.data }, "Fiche mise à jour.");
}

export async function mergeCatalog(_: ActionState, fd: FormData): Promise<ActionState> {
  const keep = uuid.safeParse(fd.get("keep"));
  const remove = uuid.safeParse(fd.get("remove"));
  if (!keep.success || !remove.success) return { error: "Requête invalide" };
  return rpc("admin_merge_catalog", { p_keep: keep.data, p_remove: remove.data }, "Fiches fusionnées.");
}

export async function updateCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("category_id"));
  if (!id.success) return { error: "Requête invalide" };
  return rpc("admin_update_category", {
    p_category: id.data, p_authorized: fd.get("is_authorized") === "on", p_delivery: fd.get("delivery_allowed") === "on", p_prescription: fd.get("requires_prescription") === "on",
  }, "Catégorie mise à jour.");
}

export async function addCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = s(fd, "name");
  if (name.length < 2) return { error: "Nom requis" };
  const supabase = await createClient();
  const { error } = await supabase.from("product_categories").insert({ name, description: s(fd, "description") || null, requires_prescription: fd.get("requires_prescription") === "on" });
  if (error) return { error: humanizeError(error) };
  revalidatePath("/admin/catalogue");
  return { ok: true, message: "Catégorie créée (livraison désactivée par défaut)." };
}

export async function addGeo(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = z.enum(["circle", "commune", "locality"]).safeParse(fd.get("kind"));
  const parent = uuid.safeParse(fd.get("parent_id"));
  if (!kind.success || !parent.success) return { error: "Choisissez l'élément parent." };
  const circle = s(fd, "circle_id");
  return rpc("admin_add_geo", { p_kind: kind.data, p_parent: parent.data, p_name: s(fd, "name"), p_source: s(fd, "source") || null, p_circle: circle || null },
    "Élément ajouté.", ["/admin/geographie", "/"]);
}

/** Import CSV de communes / quartiers : colonnes region ; cercle ; commune ; quartier ; source */
export async function importGeo(_: ActionState, fd: FormData): Promise<ActionState> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 2 * 1024 * 1024) return { error: "2 Mo maximum." };
  const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
  });
  if (!parsed.meta.fields?.includes("region") || !parsed.meta.fields.includes("commune")) return { error: "Colonnes requises : region, commune (cercle, quartier, source facultatives)." };
  const supabase = await createClient();
  const [{ data: regions }, { data: circles }, { data: communes }, { data: localities }] = await Promise.all([
    supabase.from("regions").select("id, name"), supabase.from("circles").select("id, name, region_id"),
    supabase.from("communes").select("id, name, region_id, circle_id"), supabase.from("localities").select("id, name, commune_id"),
  ]);
  const norm = (v: string) => v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const errors: string[] = [];
  let added = 0;
  for (const [i, r] of parsed.data.entries()) {
    const line = i + 2;
    const reg = regions?.find((x) => norm(x.name) === norm(r.region ?? ""));
    if (!reg) { errors.push(`Ligne ${line} : région inconnue « ${r.region} »`); continue; }
    const src = (r.source ?? "").trim() || "Import CSV";
    let circleId: string | null = null;
    if (r.cercle?.trim()) {
      let c = circles?.find((x) => x.region_id === reg.id && norm(x.name) === norm(r.cercle));
      if (!c) {
        const { data, error } = await supabase.rpc("admin_add_geo", { p_kind: "circle", p_parent: reg.id, p_name: r.cercle, p_source: src });
        if (error) { errors.push(`Ligne ${line} : ${humanizeError(error)}`); continue; }
        c = { id: data as string, name: r.cercle, region_id: reg.id }; circles?.push(c); added++;
      }
      circleId = c.id;
    }
    let cm = communes?.find((x) => x.region_id === reg.id && x.circle_id === circleId && norm(x.name) === norm(r.commune ?? ""));
    if (!cm && r.commune?.trim()) {
      const { data, error } = await supabase.rpc("admin_add_geo", { p_kind: "commune", p_parent: reg.id, p_name: r.commune, p_source: src, p_circle: circleId });
      if (error) { errors.push(`Ligne ${line} : ${humanizeError(error)}`); continue; }
      cm = { id: data as string, name: r.commune, region_id: reg.id, circle_id: circleId }; communes?.push(cm); added++;
    }
    if (cm && r.quartier?.trim() && !localities?.find((x) => x.commune_id === cm!.id && norm(x.name) === norm(r.quartier))) {
      const { data, error } = await supabase.rpc("admin_add_geo", { p_kind: "locality", p_parent: cm.id, p_name: r.quartier, p_source: src });
      if (error) { errors.push(`Ligne ${line} : ${humanizeError(error)}`); continue; }
      localities?.push({ id: data as string, name: r.quartier, commune_id: cm.id }); added++;
    }
    if (errors.length > 50) break;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${added} élément(s) ajouté(s).${errors.length ? ` ${errors.length} erreur(s) : ${errors.slice(0, 5).join(" ; ")}` : ""}` };
}

export async function handleReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = uuid.safeParse(fd.get("report_id"));
  const st = z.enum(["open", "in_review", "resolved", "dismissed"]).safeParse(fd.get("status"));
  if (!id.success || !st.success) return { error: "Requête invalide" };
  return rpc("admin_handle_report", { p_report: id.data, p_status: st.data, p_note: s(fd, "note") }, "Signalement mis à jour.");
}

export async function updateContent(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = s(fd, "slug");
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return { error: "Identifiant invalide (minuscules, chiffres, tirets)" };
  const title = s(fd, "title");
  if (title.length < 2) return { error: "Titre requis" };
  const body = String(fd.get("body") ?? "").slice(0, 20000);
  return rpc("admin_update_content", { p_slug: slug, p_title: title, p_body: body, p_published: fd.get("published") === "on" }, "Page enregistrée.", ["/admin/contenus", `/infos/${slug}`]);
}
