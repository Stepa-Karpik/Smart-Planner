"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import {
  invalidateMapSize,
  loadLeaflet,
  mapLogError,
  mapLogInfo,
  mapLogWarn,
  waitForContainerSize,
  type LeafletCircleMarker,
  type LeafletMap,
  type LeafletPolyline,
} from "@/lib/leaflet-map"
import { drawRoute } from "@/lib/route-draw"
import { normalizeLatLonLineGeometry, normalizeLineGeometry, normalizePoint, type RoutePoint } from "@/lib/route-geometry"

interface LeafletRoutePreviewMapProps {
  fromPoint: RoutePoint
  toPoint: RoutePoint
  geometryLatLon?: unknown
  geometry?: unknown
}

export function LeafletRoutePreviewMap({ fromPoint, toPoint, geometryLatLon, geometry }: LeafletRoutePreviewMapProps) {
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
  const lineCoords = useMemo(() => {
    if (geometryLatLon) {
      return normalizeLatLonLineGeometry(geometryLatLon, safeFrom, safeTo)
    }
    return normalizeLineGeometry(geometry, safeFrom, safeTo)
  }, [geometryLatLon, geometry, safeFrom.lat, safeFrom.lon, safeTo.lat, safeTo.lon])

  useEffect(() => {
    if (!containerEl || mapRef.current) return
    let cancelled = false

    const initMap = async () => {
      setLoading(true)
      setError(null)
      mapLogInfo("RoutePreview init started", { hasContainer: true, provider: "leaflet" })

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
        tileLayer.on?.("load", () => mapLogInfo("RoutePreview tile layer loaded", { provider: "leaflet" }))
        tileLayer.on?.("tileerror", (event) => mapLogWarn("RoutePreview tile error", { event, provider: "leaflet" }))
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
        lineRef.current = drawRoute({
          mapProvider: "leaflet",
          geometryLatLon: lineCoords,
          map,
          L,
          line: null,
        })

        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => invalidateMapSize(mapRef.current))
          ro.observe(containerEl)
          resizeObserverRef.current = ro
        }

        invalidateMapSize(map)
        mapLogInfo("RoutePreview map ready", {
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
          provider: "leaflet",
        })
      } catch (err) {
        if (!cancelled) {
          setError(trRef.current("Unable to load map preview", "Unable to load map preview"))
        }
        mapLogError("RoutePreview init failed", err, { provider: "leaflet" })
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
        mapLogWarn("RoutePreview map remove failed", { error: String(err), provider: "leaflet" })
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
    lineRef.current = drawRoute({
      mapProvider: "leaflet",
      geometryLatLon: lineCoords,
      map,
      L: window.L!,
      line,
    })

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

