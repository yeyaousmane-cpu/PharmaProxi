"use client";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export type DataPoint = { kind: string; name: string; latitude: number; longitude: number };
export const KIND_COLORS: Record<string, [string, string]> = {
  pharmacie: ["#068132", "Pharmacies inscrites"], officine: ["#86c99a", "Autres officines"], clinique: ["#1D5FA8", "Cliniques et centres vérifiés"],
  etablissement: ["#5b8bd0", "Autres établissements"], laboratoire: ["#7c3aed", "Laboratoires"],
};

export default function DataMap({ points }: { points: DataPoint[] }) {
  return (
    <MapContainer center={[14.5, -4]} zoom={5} scrollWheelZoom className="h-[65vh] min-h-[360px] w-full rounded-xl" preferCanvas>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p, i) => (
        <CircleMarker key={i} center={[p.latitude, p.longitude]} radius={5} pathOptions={{ color: KIND_COLORS[p.kind]?.[0] ?? "#64748b", fillOpacity: 0.8, weight: 1 }}>
          <Popup>{p.name}<br />{KIND_COLORS[p.kind]?.[1] ?? p.kind}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
