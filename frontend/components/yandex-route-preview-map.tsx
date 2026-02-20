"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { mapLogError, mapLogInfo, mapLogWarn, waitForContainerSize } from "@/lib/leaflet-map"
import { normalizeLineGeometry, normalizePoint, type RoutePoint } from "@/lib/route-geometry"
import {
  calcYandexBounds,
  fitYandexViewport,
  loadYandexMaps,
  type YandexGeoObject,
  type YandexMap,
} from "@/lib/yandex-map"

interface YandexRoutePreviewMapProps {
  fromPoint: RoutePoint
  toPoint: RoutePoint
  geometry?: unknown
}

export function YandexRoutePreviewMap({ fromPoint, toPoint, geometry }: YandexRoutePreviewMapProps) {
  const { tr } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const mapRef = useRef<YandexMap | null>(null)
  const fromMarkerRef = useRef<YandexGeoObject | null>(null)
  const toMarkerRef = useRef<YandexGeoObject | null>(null)
  const lineRef = useRef<YandexGeoObject | null>(null)
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

  const fitRouteBounds = (map: YandexMap, points: [number, number][]) => {
    const bounds = calcYandexBounds(points)
    if (!bounds) {
      map.setCenter([safeFrom.lat, safeFrom.lon], 12, { duration: 0 })
      fitYandexViewport(map)
      return
    }

    const [[minLat, minLon], [maxLat, maxLon]] = bounds
    const samePoint = Math.abs(maxLat - minLat) < 1e-9 && Math.abs(maxLon - minLon) < 1e-9

    if (samePoint) {
      map.setCenter([safeFrom.lat, safeFrom.lon], 12, { duration: 0 })
    } else {
      map.setBounds(bounds, {
        checkZoomRange: true,
        zoomMargin: [24, 24, 24, 24],
        duration: 0,
      })
    }
    fitYandexViewport(map)
  }

  useEffect(() => {
    if (!containerEl || mapRef.current) return
    let cancelled = false

    const initMap = async () => {
      setLoading(true)
      setError(null)
      mapLogInfo("RoutePreview init started", { hasContainer: true, provider: "yandex" })

      try {
        await waitForContainerSize(containerEl)

        const ymaps = await loadYandexMaps()
        if (cancelled || mapRef.current) return

        const map = new ymaps.Map(
          containerEl,
          {
            center: [safeFrom.lat, safeFrom.lon],
            zoom: 12,
            controls: ["zoomControl"],
          },
          {
            suppressMapOpenBlock: true,
          },
        )
        mapRef.current = map

        const fromMarker = new ymaps.Placemark(
          [safeFrom.lat, safeFrom.lon],
          {},
          {
            preset: "islands#greenCircleDotIcon",
          },
        )
        const toMarker = new ymaps.Placemark(
          [safeTo.lat, safeTo.lon],
          {},
          {
            preset: "islands#blueCircleDotIcon",
          },
        )
        const routeLine = new ymaps.GeoObject(
          {
            geometry: {
              type: "LineString",
              coordinates: lineCoords,
            },
          },
          {},
          {
            strokeColor: "#f5b400",
            strokeWidth: 4,
            strokeOpacity: 0.9,
          },
        )

        fromMarkerRef.current = fromMarker
        toMarkerRef.current = toMarker
        lineRef.current = routeLine

        map.geoObjects.add(routeLine)
        map.geoObjects.add(fromMarker)
        map.geoObjects.add(toMarker)

        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => fitYandexViewport(mapRef.current))
          ro.observe(containerEl)
          resizeObserverRef.current = ro
        }

        fitRouteBounds(map, lineCoords)
        mapLogInfo("RoutePreview map ready", {
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
          provider: "yandex",
        })
      } catch (err) {
        if (!cancelled) {
          setError(trRef.current("Unable to load map preview", "Unable to load map preview"))
        }
        mapLogError("RoutePreview init failed", err, { provider: "yandex" })
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
        map.destroy()
      } catch (err) {
        mapLogWarn("RoutePreview map destroy failed", { error: String(err), provider: "yandex" })
      }
    }
  }, [containerEl])

  useEffect(() => {
    const map = mapRef.current
    const fromMarker = fromMarkerRef.current
    const toMarker = toMarkerRef.current
    const line = lineRef.current
    if (!map || !fromMarker || !toMarker || !line) return

    fromMarker.geometry.setCoordinates([safeFrom.lat, safeFrom.lon])
    toMarker.geometry.setCoordinates([safeTo.lat, safeTo.lon])
    line.geometry.setCoordinates(lineCoords)
    fitRouteBounds(map, lineCoords)
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

