import { useEffect, useMemo, useState } from "react";
import { GoogleMap, Polygon, Polyline, Marker, Circle, useJsApiLoader } from "@react-google-maps/api";

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 }; // Pune
const DEFAULT_ZOOM = 13;
const GREEN = "#0F6E5C";

// Same loader id and key as LiveTracking.jsx, so the Maps script loads only once.
const MAP_LOADER_ID = "geowork-google-maps";

function toPath(points) {
  return (points || []).map((p) => ({ lat: p.latitude, lng: p.longitude }));
}

// Great-circle distance in meters (avoids needing the Google geometry library).
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function GeofenceMap({ workAreas, selectedId, onSelectArea, drawMode, onDrawFinalize, resetSignal }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: MAP_LOADER_ID,
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });

  const [drawPoints, setDrawPoints] = useState([]);
  const [preview, setPreview] = useState(null);

  // Switching draw mode, cancelling, or a successful save clears any in-progress shape.
  useEffect(() => {
    setDrawPoints([]);
    setPreview(null);
  }, [drawMode, resetSignal]);

  const center = useMemo(() => {
    const first = workAreas.find((w) => w.boundary_points?.length);
    return first ? toPath(first.boundary_points)[0] : DEFAULT_CENTER;
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

  if (loadError) {
    return (
      <div className="card" style={{ padding: 20 }}>
        Couldn't load Google Maps. Check VITE_GOOGLE_MAPS_API_KEY and that the Maps JavaScript API is enabled.
      </div>
    );
  }
  if (!isLoaded) {
    return <div className="card" style={{ padding: 20 }}>Loading map…</div>;
  }

  const pointIcon = {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: GREEN,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
  };

  const rectanglePath = (a, b) => {
    const south = Math.min(a.lat, b.lat);
    const north = Math.max(a.lat, b.lat);
    const west = Math.min(a.lng, b.lng);
    const east = Math.max(a.lng, b.lng);
    return [
      { lat: south, lng: west },
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
    ];
  };

  const last = drawPoints[drawPoints.length - 1];

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={DEFAULT_ZOOM}
        options={{ draggableCursor: drawMode ? "crosshair" : undefined, streetViewControl: false }}
        onClick={(e) => {
          if (drawMode) handleClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }}
        onMouseMove={(e) => {
          if (drawMode) setPreview({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }}
      >
        {workAreas.map((wa) => {
          const path = toPath(wa.boundary_points);
          if (path.length < 3) return null;
          const isSelected = wa.id === selectedId;
          return (
            <Polygon
              key={wa.id}
              paths={path}
              onClick={() => onSelectArea?.(wa)}
              options={{
                strokeColor: wa.color || GREEN,
                strokeWeight: isSelected ? 3 : 1.5,
                fillColor: wa.color || GREEN,
                fillOpacity: isSelected ? 0.28 : 0.1,
                clickable: true,
              }}
            />
          );
        })}

        {drawMode === "POLYGON" && drawPoints.length > 0 && (
          <>
            <Polyline
              path={drawPoints}
              options={{ strokeColor: GREEN, strokeWeight: 2, strokeOpacity: 1 }}
            />
            {drawPoints.length > 2 && (
              <Polyline
                path={[last, drawPoints[0]]}
                options={{ strokeColor: GREEN, strokeWeight: 1.5, strokeOpacity: 0.5 }}
              />
            )}
            {preview && (
              <Polyline
                path={[last, preview]}
                options={{ strokeColor: GREEN, strokeWeight: 1.5, strokeOpacity: 0.5 }}
              />
            )}
            {drawPoints.map((p, i) => (
              <Marker key={i} position={p} icon={pointIcon} />
            ))}
          </>
        )}

        {drawMode === "RECTANGLE" && drawPoints.length === 1 && preview && (
          <Polygon
            paths={rectanglePath(drawPoints[0], preview)}
            options={{ strokeColor: GREEN, strokeWeight: 2, fillColor: GREEN, fillOpacity: 0.12, clickable: false }}
          />
        )}

        {drawMode === "CIRCLE" && drawPoints.length === 1 && preview && (
          <Circle
            center={drawPoints[0]}
            radius={distanceMeters(drawPoints[0], preview)}
            options={{ strokeColor: GREEN, strokeWeight: 2, fillColor: GREEN, fillOpacity: 0.1, clickable: false }}
          />
        )}
      </GoogleMap>

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
