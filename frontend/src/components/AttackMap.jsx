import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * World map of attacking IPs (GeoIP-enriched).
 * Demo IPs use fixed coordinates so the map works offline.
 */
export default function AttackMap({ attackers = [] }) {
  const points = attackers.filter(
    (a) => a.latitude != null && a.longitude != null && !Number.isNaN(a.latitude)
  );

  return (
    <section className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">
          Attack Origins Map
        </h2>
      </div>
      <div className="h-72 relative z-0">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">
            No geolocated attackers yet — run a simulation or replay a sample
          </div>
        ) : (
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={1}
            scrollWheelZoom={false}
            className="h-full w-full"
            style={{ background: "#0b1220" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {points.map((p) => (
              <CircleMarker
                key={p.ip}
                center={[p.latitude, p.longitude]}
                radius={Math.min(6 + Math.log2((p.attack_count || 1) + 1) * 3, 18)}
                pathOptions={{
                  color: "#f04444",
                  fillColor: "#f04444",
                  fillOpacity: 0.7,
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-mono font-semibold">{p.ip}</div>
                    <div>{p.label || p.country}</div>
                    <div>{p.attack_count || 0} events</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>
    </section>
  );
}
