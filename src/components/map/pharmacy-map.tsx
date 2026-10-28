"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, CircleMarker } from "react-leaflet";

export type MapPoint = { id: string; name: string; address: string; latitude: number; longitude: number; is_open: boolean | null; is_demo?: boolean; href?: string; kind?: "pharmacy" | "clinic" | "listing"; phone?: string | null };

const clinicIcon = () =>
  L.divIcon({
    className: "pp-marker",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="#1D5FA8"/><circle cx="15" cy="15" r="9" fill="#fff"/><path d="M11 9h2v5h4V9h2v12h-2v-5h-4v5h-2z" fill="#1D5FA8"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });

const listingIcon = () =>
  L.divIcon({
    className: "pp-marker",
    html: `<svg width="26" height="35" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="#fff" stroke="#64748b" stroke-width="2"/><path d="M13 9h4v4h4v4h-4v4h-4v-4H9v-4h4z" fill="#94a3b8"/></svg>`,
    iconSize: [26, 35],
    iconAnchor: [13, 35],
    popupAnchor: [0, -31],
  });

const icon = (open: boolean | null) =>
  L.divIcon({
    className: "pp-marker",
    html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="${open === false ? "#64748b" : "#068132"}"/><circle cx="15" cy="15" r="9" fill="#fff"/><path d="M13 9h4v4h4v4h-4v4h-4v-4H9v-4h4z" fill="${open === false ? "#64748b" : "#068132"}"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });

// Centre par défaut : Bamako
const DEFAULT: [number, number] = [12.6392, -8.0029];

export default function PharmacyMap({ points, center, me }: { points: MapPoint[]; center?: [number, number] | null; me?: [number, number] | null }) {
  const c = center ?? (points[0] ? [points[0].latitude, points[0].longitude] as [number, number] : DEFAULT);
  return (
    <MapContainer center={c} zoom={points.length || me ? 13 : 6} scrollWheelZoom={false} className="h-[60vh] min-h-[320px] w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {me ? <CircleMarker center={me} radius={8} pathOptions={{ color: "#1D5FA8", fillOpacity: 0.8 }}><Popup>Votre position</Popup></CircleMarker> : null}
      {points.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]} icon={p.kind === "clinic" ? clinicIcon() : p.kind === "listing" ? listingIcon() : icon(p.is_open)}>
          <Popup>
            <strong>{p.name}</strong>
            {p.is_demo ? " (démo)" : ""}
            <br />
            {p.address}
            <br />
            {p.kind === "listing" ? (
              <>
                <em>Pas encore inscrite : stocks non disponibles</em>
                {p.phone ? <><br /><a href={`tel:${p.phone}`}>Appeler</a></> : null}
              </>
            ) : (
              <a href={p.href ?? `/pharmacies/${p.id}`}>Voir la fiche</a>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
