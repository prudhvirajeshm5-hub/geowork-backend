import { useEffect, useState } from "react";
import { Circle, InfoWindow, Polygon } from "@react-google-maps/api";
import api from "../lib/api";

/** Loads the company's active work areas, optionally for one branch. */
export function useWorkAreas(branchId) {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = { page_size: 200, is_active: true };
    if (branchId) params.branch = branchId;

    setLoading(true);
    api
      .get("/geofence/work-areas/", { params })
      .then(({ data }) => {
        if (!cancelled) setAreas(data.results || data);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId]);

  return { areas, loading };
}

function pathOf(area) {
  return (area.boundary_points || []).map((p) => ({ lat: p.latitude, lng: p.longitude }));
}

function centerOf(area) {
  if (area.shape_type === "CIRCLE" && area.center_out) {
    return { lat: area.center_out.latitude, lng: area.center_out.longitude };
  }
  const path = pathOf(area);
  if (!path.length) return null;
  const lat = path.reduce((sum, p) => sum + p.lat, 0) / path.length;
  const lng = path.reduce((sum, p) => sum + p.lng, 0) / path.length;
  return { lat, lng };
}

/**
 * Renders work areas inside a <GoogleMap>. Place it as a child of GoogleMap.
 * areas:   array from useWorkAreas()
 * visible: when false, nothing is drawn (use for the "Show Geofences" toggle)
 */
export default function WorkAreaLayer({ areas = [], visible = true }) {
  const [selected, setSelected] = useState(null);

  if (!visible) return null;

  return (
    <>
      {areas.map((area) => {
        const color = area.color || "#2E86DE";
        const options = {
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          clickable: true,
        };
        const onClick = () => setSelected(area);

        if (area.shape_type === "CIRCLE" && area.center_out && area.radius_meters) {
          return (
            <Circle
              key={`area-${area.id}`}
              center={{ lat: area.center_out.latitude, lng: area.center_out.longitude }}
              radius={area.radius_meters}
              options={options}
              onClick={onClick}
            />
          );
        }

        const paths = pathOf(area);
        if (paths.length < 3) return null;
        return (
          <Polygon
            key={`area-${area.id}`}
            paths={paths}
            options={options}
            onClick={onClick}
          />
        );
      })}

      {selected && centerOf(selected) && (
        <InfoWindow position={centerOf(selected)} onCloseClick={() => setSelected(null)}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>{selected.name}</strong>
            <br />
            {selected.branch_name ? `${selected.branch_name} · ` : ""}
            {selected.category ? selected.category.replace(/_/g, " ").toLowerCase() : "work area"}
            <br />
            {selected.shape_type === "CIRCLE"
              ? `Circle · ${Math.round(selected.radius_meters || 0)} m radius`
              : `${selected.shape_type === "RECTANGLE" ? "Rectangle" : "Polygon"} · ${pathOf(selected).length} points`}
          </div>
        </InfoWindow>
      )}
    </>
  );
}
