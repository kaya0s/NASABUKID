import { z } from "zod";
import { coordinatesSchema, type Coordinates } from "./nasa-power";

export const boundarySchema = z.array(coordinatesSchema).min(3).max(200);

/** Spherical area of a small, simple farm polygon; coordinates are not a cadastral survey. */
export function measureFarmBoundary(value: unknown) {
  const points = boundarySchema.parse(value);
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const south = Math.min(...latitudes),
    north = Math.max(...latitudes);
  const west = Math.min(...longitudes),
    east = Math.max(...longitudes);
  // shortcut: supports local farm outlines only; use a GIS library for dateline-spanning or larger regions.
  if (north - south > 1 || east - west > 1 || south < -85 || north > 85) {
    throw new Error(
      "Draw a local farm boundary spanning less than one degree of latitude/longitude.",
    );
  }
  const cross = (a: Coordinates, b: Coordinates, c: Coordinates) =>
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude);
  const onSegment = (a: Coordinates, b: Coordinates, c: Coordinates) =>
    Math.abs(cross(a, b, c)) < 1e-12 &&
    c.longitude >= Math.min(a.longitude, b.longitude) - 1e-12 &&
    c.longitude <= Math.max(a.longitude, b.longitude) + 1e-12 &&
    c.latitude >= Math.min(a.latitude, b.latitude) - 1e-12 &&
    c.latitude <= Math.max(a.latitude, b.latitude) + 1e-12;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    if (a.latitude === b.latitude && a.longitude === b.longitude)
      throw new Error("Remove duplicate boundary corners.");
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!,
        d = points[(j + 1) % points.length]!;
      const crossing = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
      if (
        crossing ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      ) {
        throw new Error("Boundary edges cross or overlap. Undo a corner or redraw the outline.");
      }
    }
  }
  const radians = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    sum +=
      (b.longitude - a.longitude) *
      radians *
      (2 + Math.sin(a.latitude * radians) + Math.sin(b.latitude * radians));
  }
  const squareMetres = (Math.abs(sum) * 6371008.8 ** 2) / 2;
  if (squareMetres < 1) throw new Error("Draw a boundary enclosing at least one square metre.");
  return {
    points,
    hectares: squareMetres / 10000,
    reference: { latitude: (south + north) / 2, longitude: (west + east) / 2 },
  };
}
