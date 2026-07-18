import { Globe2 } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function AttackMap({ attackers = [] }) {
  const points = attackers.filter(
    (a) => a.latitude != null && a.longitude != null && !Number.isNaN(a.latitude)
  );

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <h2 className="panel-title flex items-center gap-2">
          <Globe2 className="w-3.5 h-3.5 text-steel" strokeWidth={1.75} aria-hidden />
          Attack Origins Map
        </h2>
        <span className="font-mono text-2xs text-chalk-muted tabular-nums">
          {points.length} pins
        </span>
      </div>
      <div className="h-72 relative z-0 border-t border-ink-line">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-chalk-muted bg-ink-edge">
            Awaiting geolocated signal — simulate or replay a sample
          </div>
        ) : (
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={1}
            scrollWheelZoom={false}
            className="h-full w-full"
            style={{ background: "#0B0D10" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {points.map((p) => (
              <CircleMarker
                key={p.ip}
                center={[p.latitude, p.longitude]}
                radius={Math.min(5 + Math.log2((p.attack_count || 1) + 1) * 2.5, 16)}
                pathOptions={{
                  color: "#FFB300",
                  fillColor: "#E5484D",
                  fillOpacity: 0.75,
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="text-xs font-mono">
                    <div className="font-semibold">{p.ip}</div>
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
