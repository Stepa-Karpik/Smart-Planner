"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import {
  invalidateMapSize,
  isValidLatLon,
  loadLeaflet,
  mapLogError,
  mapLogInfo,
  mapLogWarn,
  waitForContainerSize,
  type LeafletCircleMarker,
  type LeafletMap,
  type LeafletPolyline,
} from "@/lib/leaflet-map"

interface RoutePoint {
  lat: number
  lon: number
}

interface RoutePreviewMapProps {
  fromPoint: RoutePoint
  toPoint: RoutePoint
  geometry?: unknown
}

function normalizePoint(point: RoutePoint): RoutePoint {
  if (isValidLatLon(point.lat, point.lon)) return point
  return { lat: 55.751244, lon: 37.618423 }
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

function normalizeLineGeometry(geometry: unknown, fromPoint: RoutePoint, toPoint: RoutePoint): [number, number][] {
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

export function RoutePreviewMap({ fromPoint, toPoint, geometry }: RoutePreviewMapProps) {
  const { tr } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const mapRef = useRef<LeafletMap | null>(null)
  const fromMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const toMarkerRef = useRef<LeafletCircleMarker | null>(null)
  const lineRef = useRef<LeafletPolyline | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const trRef = useRef(tr)

  useEffect(() => {
    trRef.current = tr
  }, [tr])

  const safeFrom = useMemo(() => normalizePoint(fromPoint), [fromPoint.lat, fromPoint.lon])
  const safeTo = useMemo(() => normalizePoint(toPoint), [toPoint.lat, toPoint.lon])
  const lineCoords = useMemo(
    () => normalizeLineGeometry(geometry, safeFrom, safeTo),
    [geometry, safeFrom.lat, safeFrom.lon, safeTo.lat, safeTo.lon],
  )

  useEffect(() => {
    if (!containerEl || mapRef.current) return
    let cancelled = false

    const initMap = async () => {
      setLoading(true)
      setError(null)
      mapLogInfo("RoutePreview init started", { hasContainer: true })

      try {
        await waitForContainerSize(containerEl)

        const L = await loadLeaflet()
        if (cancelled || mapRef.current) return

        const map = L.map(containerEl, { zoomControl: true }).setView([safeFrom.lat, safeFrom.lon], 12)
        mapRef.current = map

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        })
        tileLayer.on?.("load", () => mapLogInfo("RoutePreview tile layer loaded"))
        tileLayer.on?.("tileerror", (event) => mapLogWarn("RoutePreview tile error", { event }))
        tileLayer.addTo(map)

        fromMarkerRef.current = L.circleMarker([safeFrom.lat, safeFrom.lon], {
          radius: 6,
          color: "#10b981",
          fillColor: "#10b981",
          fillOpacity: 0.95,
          weight: 2,
        }).addTo(map)
        toMarkerRef.current = L.circleMarker([safeTo.lat, safeTo.lon], {
          radius: 6,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.95,
          weight: 2,
        }).addTo(map)
        lineRef.current = L.polyline(lineCoords, {
          color: "#f5b400",
          weight: 4,
          opacity: 0.9,
        }).addTo(map)

        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => invalidateMapSize(mapRef.current))
          ro.observe(containerEl)
          resizeObserverRef.current = ro
        }

        invalidateMapSize(map)
        mapLogInfo("RoutePreview map ready", {
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
        })
      } catch (err) {
        if (!cancelled) {
          setError(trRef.current("Unable to load map preview", "Unable to load map preview"))
        }
        mapLogError("RoutePreview init failed", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    initMap()

    return () => {
      cancelled = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      const map = mapRef.current
      mapRef.current = null
      fromMarkerRef.current = null
      toMarkerRef.current = null
      lineRef.current = null
      if (!map) return

      try {
        map.remove()
      } catch (err) {
        mapLogWarn("RoutePreview map remove failed", { error: String(err) })
      }
    }
  }, [containerEl])

  useEffect(() => {
    const map = mapRef.current
    const fromMarker = fromMarkerRef.current
    const toMarker = toMarkerRef.current
    const line = lineRef.current
    if (!map || !fromMarker || !toMarker || !line) return

    fromMarker.setLatLng([safeFrom.lat, safeFrom.lon])
    toMarker.setLatLng([safeTo.lat, safeTo.lon])
    line.setLatLngs(lineCoords)

    const bounds = line.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
    } else {
      map.setView([safeFrom.lat, safeFrom.lon], 12)
    }
    invalidateMapSize(map)
  }, [safeFrom.lat, safeFrom.lon, safeTo.lat, safeTo.lon, lineCoords])

  return (
    <div className="relative rounded-lg border bg-card">
      <div ref={setContainerEl} className="h-[320px] w-full rounded-lg" />

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4 text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  )
}
