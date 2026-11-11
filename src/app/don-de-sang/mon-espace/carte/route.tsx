import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import type { DonorProfile, DonorSummary } from "@/lib/donor";

export const dynamic = "force-dynamic";

function siteUrl(req: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  return (env ? env.replace(/\/$/, "") : new URL(req.url).origin);
}

/** Image PNG de la carte du donneur connecté. ?groupe=1 : avec le groupe (s'il est confirmé). ?partage=1 : jamais de groupe. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Connexion requise", { status: 401 });
  const [{ data: p }, { data: s }, { data: prof }] = await Promise.all([
    supabase.from("blood_donor_profiles").select("donor_code, card_token, blood_group, blood_group_verified, card_show_name, created_at").eq("user_id", auth.user.id).maybeSingle(),
    supabase.rpc("donor_summary"),
    supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  const pr = p as Pick<DonorProfile, "donor_code" | "card_token" | "blood_group" | "blood_group_verified" | "card_show_name" | "created_at"> | null;
  const sum = s as DonorSummary | null;
  if (!pr || !sum?.exists) return new Response("Aucun espace donneur", { status: 404 });
  const u = new URL(req.url);
  const showGroup = u.searchParams.get("groupe") === "1" && u.searchParams.get("partage") !== "1" && pr.blood_group_verified;
  const qr = await QRCode.toDataURL(`${siteUrl(req)}/don-de-sang/carte/${pr.card_token}`, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  const name = pr.card_show_name ? (prof?.full_name as string | null) ?? "Donneur volontaire" : "Donneur volontaire";
  const badge = sum.badge.current?.label ?? "Premier don à valider";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 48, color: "white", backgroundImage: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 55%, #052D1E 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, letterSpacing: 4, opacity: 0.85 }}>SANTÉPROXI SOLIDAIRE</div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>Carte de donneur volontaire</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{name}</div>
            <div style={{ display: "flex", gap: 56 }}>
              {showGroup && <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 20, opacity: 0.75 }}>GROUPE</div><div style={{ fontSize: 64, fontWeight: 900 }}>{pr.blood_group}</div></div>}
              <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 20, opacity: 0.75 }}>DONS VALIDÉS</div><div style={{ fontSize: 64, fontWeight: 900 }}>{String(sum.validated_count)}</div></div>
            </div>
            <div style={{ display: "flex", fontSize: 26 }}><span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 999, padding: "6px 20px", fontWeight: 700 }}>{badge}</span></div>
            <div style={{ fontSize: 24, fontFamily: "monospace", opacity: 0.9 }}>{pr.donor_code}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={220} height={220} style={{ background: "white", borderRadius: 16, padding: 10 }} alt="" />
        </div>
        <div style={{ fontSize: 18, opacity: 0.8 }}>Carte de reconnaissance SantéProxi — ce n&apos;est pas une carte officielle du CNTS.</div>
      </div>
    ),
    { width: 1012, height: 638, headers: { "Cache-Control": "private, no-store" } },
  );
}
