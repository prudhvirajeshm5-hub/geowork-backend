import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";

const DEFAULT_CENTER = [18.5204, 73.8567]; // Pune — matches the backend admin map default
const DEFAULT_ZOOM = 13;

const dot = (color) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

function toLatLngs(points) {
  return (points || []).map((p) => [p.latitude, p.longitude]);
}

function distanceMeters(a, b) {
  return L.latLng(a).distanceTo(L.latLng(b));
}

function ClickCapture({ active, onClick, onMouseMove }) {
  useMapEvents({
    click(e) {
      if (active) onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mousemove(e) {
      if (active) onMouseMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function RectanglePreview({ a, b }) {
  const sw = [Math.min(a.lat, b.lat), Math.min(a.lng, b.lng)];
  const ne = [Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)];
  const positions = [sw, [sw[0], ne[1]], ne, [ne[0], sw[1]]];
  return <Polygon positions={positions} pathOptions={{ color: "#0F6E5C", dashArray: "6 4", weight: 2, fillOpacity: 0.12 }} />;
}

export default function GeofenceMap({ workAreas, selectedId, onSelectArea, drawMode, onDrawFinalize, resetSignal }) {
  const [drawPoints, setDrawPoints] = useState([]);
  const [preview, setPreview] = useState(null);

  // Switching draw mode, cancelling, or a successful save should clear any in-progress shape.
  useEffect(() => {
    setDrawPoints([]);
    setPreview(null);
  }, [drawMode, resetSignal]);

  const center = useMemo(() => {
    const first = workAreas.find((w) => w.boundary_points?.length);
    return first ? toLatLngs(first.boundary_points)[0] : DEFAULT_CENTER;
  }, [workAreas]);

  const handleClick = (ll) => {
    if (drawMode === "POLYGON") {
      setDrawPoints((pts) => [...pts, ll]);
      return;
    }
    if (drawMode === "RECTANGLE") {
      if (drawPoints.length === 0) {
        setDrawPoints([ll]);
      } else {
        const a = drawPoints[0];
        onDrawFinalize({
          shape_type: "RECTANGLE",
          bounds: {
            south_west: { latitude: Math.min(a.lat, ll.lat), longitude: Math.min(a.lng, ll.lng) },
            north_east: { latitude: Math.max(a.lat, ll.lat), longitude: Math.max(a.lng, ll.lng) },
          },
        });
      }
      return;
    }
    if (drawMode === "CIRCLE") {
      if (drawPoints.length === 0) {
        setDrawPoints([ll]);
      } else {
        const a = drawPoints[0];
        onDrawFinalize({
          shape_type: "CIRCLE",
          center: { latitude: a.lat, longitude: a.lng },
          radius_meters: Math.max(5, Math.round(distanceMeters(a, ll))),
        });
      }
    }
  };

  const finishPolygon = () => {
    if (drawPoints.length < 3) return;
    onDrawFinalize({
      shape_type: "POLYGON",
      points: drawPoints.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    });
  };

  const undoPoint = () => setDrawPoints((pts) => pts.slice(0, -1));

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }} className="map-shell">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {workAreas.map((wa) => {
          const isSelected = wa.id === selectedId;
          const positions = toLatLngs(wa.boundary_points);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={wa.id}
              positions={positions}
              pathOptions={{
                color: wa.color || "#0F6E5C",
                weight: isSelected ? 3 : 1.5,
                fillOpacity: isSelected ? 0.28 : 0.1,
                dashArray: isSelected ? null : "5 4",
              }}
              eventHandlers={{ click: () => onSelectArea?.(wa) }}
            >
              <Popup>
                <strong>{wa.name}</strong>
              </Popup>
            </Polygon>
          );
        })}

        {drawMode && <ClickCapture active onClick={handleClick} onMouseMove={setPreview} />}

        {drawMode === "POLYGON" && drawPoints.length > 0 && (
          <>
            <Polyline positions={drawPoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#0F6E5C", dashArray: "6 4", weight: 2 }} />
            {drawPoints.length > 2 && (
              <Polyline
                positions={[
                  [drawPoints[drawPoints.length - 1].lat, drawPoints[drawPoints.length - 1].lng],
                  [drawPoints[0].lat, drawPoints[0].lng],
                ]}
                pathOptions={{ color: "#0F6E5C", dashArray: "2 5", weight: 1.5, opacity: 0.5 }}
              />
            )}
            {drawPoints.map((p, i) => (
              <Marker key={i} position={[p.lat, p.lng]} icon={dot("#0F6E5C")} />
            ))}
            {preview && (
              <Polyline
                positions={[
                  [drawPoints[drawPoints.length - 1].lat, drawPoints[drawPoints.length - 1].lng],
                  [preview.lat, preview.lng],
                ]}
                pathOptions={{ color: "#0F6E5C", dashArray: "3 4", weight: 1.5, opacity: 0.5 }}
              />
            )}
          </>
        )}

        {drawMode === "RECTANGLE" && drawPoints.length === 1 && preview && <RectanglePreview a={drawPoints[0]} b={preview} />}

        {drawMode === "CIRCLE" && drawPoints.length === 1 && preview && (
          <Circle
            center={[drawPoints[0].lat, drawPoints[0].lng]}
            radius={distanceMeters(drawPoints[0], preview)}
            pathOptions={{ color: "#0F6E5C", dashArray: "6 4", weight: 2, fillOpacity: 0.1 }}
          />
        )}
      </MapContainer>

      {drawMode && (
        <div className="draw-hint">
          {drawMode === "POLYGON" && `Click to place points (${drawPoints.length} so far, need 3+)`}
          {drawMode === "RECTANGLE" && (drawPoints.length === 0 ? "Click one corner" : "Click the opposite corner")}
          {drawMode === "CIRCLE" && (drawPoints.length === 0 ? "Click the center point" : "Click to set the radius")}
        </div>
      )}

      {drawMode === "POLYGON" && (
        <div className="map-legend" style={{ left: "auto", right: 14 }}>
          <button className="btn btn-sm" disabled={drawPoints.length === 0} onClick={undoPoint}>
            Undo point
          </button>
          <button className="btn btn-sm btn-primary" disabled={drawPoints.length < 3} onClick={finishPolygon}>
            Finish shape
          </button>
        </div>
      )}
    </div>
  );
}
