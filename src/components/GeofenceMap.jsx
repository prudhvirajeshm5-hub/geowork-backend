import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Polygon, Circle, Rectangle, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";

// "geometry" is loaded for distance calculations (circle radius while
// dragging) — the direct equivalent of Leaflet's L.latLng().distanceTo().
const GOOGLE_MAPS_LIBRARIES = ["geometry"];

const DEFAULT_CENTER = { lat: 18.5204, lng: 73.8567 }; // Pune — matches the backend admin map default
const DEFAULT_ZOOM = 13;

const DOT_ICON = (color) => ({
  path: "M -6,0 A 6,6 0 1,0 6,0 A 6,6 0 1,0 -6,0",
  fillColor: color,
  fillOpacity: 1,
  strokeColor: "#fff",
  strokeWeight: 2,
  scale: 1,
});

function toLatLngs(points) {
  return (points || []).map((p) => ({ lat: p.latitude, lng: p.longitude }));
}

function distanceMeters(a, b) {
  if (!window.google?.maps?.geometry) return 0;
  return window.google.maps.geometry.spherical.computeDistanceBetween(
    new window.google.maps.LatLng(a.lat, a.lng),
    new window.google.maps.LatLng(b.lat, b.lng)
  );
}

export default function GeofenceMap({ workAreas, selectedId, onSelectArea, drawMode, onDrawFinalize, resetSignal }) {
  const [drawPoints, setDrawPoints] = useState([]);
  const [preview, setPreview] = useState(null);
  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "geowork-google-maps",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Switching draw mode, cancelling, or a successful save should clear any in-progress shape.
  useEffect(() => {
    setDrawPoints([]);
    setPreview(null);
  }, [drawMode, resetSignal]);

  const center = useMemo(() => {
    const first = workAreas.find((w) => w.boundary_points?.length);
    return first ? toLatLngs(first.boundary_points)[0] : DEFAULT_CENTER;
  }, [workAreas]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handleClick = (e) => {
    const ll = { lat: e.latLng.lat(), lng: e.latLng.lng() };
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

  const handleMouseMove = (e) => {
    if (!drawMode || !e.latLng) return;
    setPreview({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  const finishPolygon = () => {
    if (drawPoints.length < 3) return;
    onDrawFinalize({
      shape_type: "POLYGON",
      points: drawPoints.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    });
  };

  const undoPoint = () => setDrawPoints((pts) => pts.slice(0, -1));

  const rectanglePreviewBounds = useMemo(() => {
    if (drawMode !== "RECTANGLE" || drawPoints.length !== 1 || !preview) return null;
    const a = drawPoints[0];
    return {
      south: Math.min(a.lat, preview.lat),
      west: Math.min(a.lng, preview.lng),
      north: Math.max(a.lat, preview.lat),
      east: Math.max(a.lng, preview.lng),
    };
  }, [drawMode, drawPoints, preview]);

  if (loadError) {
    return (
      <div className="map-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        Map could not be loaded. Check the Google Maps API key configuration.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        Loading map…
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <GoogleMap
        center={center}
        zoom={DEFAULT_ZOOM}
        mapContainerStyle={{ height: "100%", width: "100%" }}
        mapContainerClassName="map-shell"
        onLoad={onMapLoad}
        onClick={drawMode ? handleClick : undefined}
        onMouseMove={drawMode ? handleMouseMove : undefined}
        options={{
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          zoomControl: true,
        }}
      >
        {workAreas.map((wa) => {
          const isSelected = wa.id === selectedId;
          const positions = toLatLngs(wa.boundary_points);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={wa.id}
              paths={positions}
              options={{
                strokeColor: wa.color || "#0F6E5C",
                strokeWeight: isSelected ? 3 : 1.5,
                fillColor: wa.color || "#0F6E5C",
                fillOpacity: isSelected ? 0.28 : 0.1,
                strokeOpacity: isSelected ? 1 : 0.6,
                clickable: true,
              }}
              onClick={() => onSelectArea?.(wa)}
            />
          );
        })}

        {drawMode === "POLYGON" && drawPoints.length > 0 && (
          <>
            <Polyline
              path={drawPoints}
              options={{ strokeColor: "#0F6E5C", strokeWeight: 2, strokeOpacity: 0.8 }}
            />
            {drawPoints.length > 2 && (
              <Polyline
                path={[drawPoints[drawPoints.length - 1], drawPoints[0]]}
                options={{ strokeColor: "#0F6E5C", strokeOpacity: 0.5, strokeWeight: 1.5 }}
              />
            )}
            {drawPoints.map((p, i) => (
              <Marker key={i} position={p} icon={DOT_ICON("#0F6E5C")} />
            ))}
            {preview && (
              <Polyline
                path={[drawPoints[drawPoints.length - 1], preview]}
                options={{ strokeColor: "#0F6E5C", strokeOpacity: 0.5, strokeWeight: 1.5 }}
              />
            )}
          </>
        )}

        {rectanglePreviewBounds && (
          <Rectangle
            bounds={rectanglePreviewBounds}
            options={{ strokeColor: "#0F6E5C", strokeWeight: 2, fillColor: "#0F6E5C", fillOpacity: 0.12, clickable: false }}
          />
        )}

        {drawMode === "CIRCLE" && drawPoints.length === 1 && preview && (
          <Circle
            center={drawPoints[0]}
            radius={distanceMeters(drawPoints[0], preview)}
            options={{ strokeColor: "#0F6E5C", strokeWeight: 2, fillColor: "#0F6E5C", fillOpacity: 0.1, clickable: false }}
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