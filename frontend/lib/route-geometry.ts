import { isValidLatLon } from "@/lib/leaflet-map"

export interface RoutePoint {
  lat: number
  lon: number
}

const DEFAULT_POINT: RoutePoint = { lat: 55.751244, lon: 37.618423 }

export function normalizePoint(point: RoutePoint): RoutePoint {
  if (isValidLatLon(point.lat, point.lon)) return point
  return DEFAULT_POINT
}

function toMapCoords(pair: unknown): [number, number] | null {
  if (!Array.isArray(pair) || pair.length < 2) return null
  const a = Number(pair[0])
  const b = Number(pair[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  if (Math.abs(a) > 90 && Math.abs(b) <= 90) return [b, a]
  if (Math.abs(b) > 90 && Math.abs(a) <= 90) return [a, b]
  return [b, a]
}

function toLatLonCoords(pair: unknown): [number, number] | null {
  if (!Array.isArray(pair) || pair.length < 2) return null
  const lat = Number(pair[0])
  const lon = Number(pair[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (!isValidLatLon(lat, lon)) return null
  return [lat, lon]
}

function parseWktLineString(value: string): [number, number][] {
  const match = value.match(/LINESTRING\s*\((.+)\)/i)
  if (!match) return []

  const pairs = match[1].split(",")
  const parsed: [number, number][] = []
  for (const pair of pairs) {
    const [lonRaw, latRaw] = pair.trim().split(/\s+/)
    const lon = Number(lonRaw)
    const lat = Number(latRaw)
    if (!isValidLatLon(lat, lon)) continue
    parsed.push([lat, lon])
  }

  return parsed
}

export function normalizeLineGeometry(
  geometry: unknown,
  fromPoint: RoutePoint,
  toPoint: RoutePoint,
): [number, number][] {
  const fallback: [number, number][] = [
    [fromPoint.lat, fromPoint.lon],
    [toPoint.lat, toPoint.lon],
  ]
  if (!geometry) return fallback

  if (typeof geometry === "string") {
    const parsed = parseWktLineString(geometry)
    return parsed.length >= 2 ? parsed : fallback
  }

  const rawCoords =
    Array.isArray(geometry)
      ? geometry
      : typeof geometry === "object" && geometry !== null && "coordinates" in geometry
        ? (geometry as { coordinates?: unknown }).coordinates
        : null
  if (!Array.isArray(rawCoords)) return fallback

  const parsed: [number, number][] = []
  for (const point of rawCoords) {
    const coords = toMapCoords(point)
    if (!coords || !isValidLatLon(coords[0], coords[1])) continue
    parsed.push(coords)
  }

  return parsed.length >= 2 ? parsed : fallback
}

export function normalizeLatLonLineGeometry(
  geometryLatLon: unknown,
  fromPoint: RoutePoint,
  toPoint: RoutePoint,
): [number, number][] {
  const fallback: [number, number][] = [
    [fromPoint.lat, fromPoint.lon],
    [toPoint.lat, toPoint.lon],
  ]
  if (!Array.isArray(geometryLatLon)) return fallback

  const parsed: [number, number][] = []
  for (const point of geometryLatLon) {
    const coords = toLatLonCoords(point)
    if (!coords) continue
    parsed.push(coords)
  }
  return parsed.length >= 2 ? parsed : fallback
}

