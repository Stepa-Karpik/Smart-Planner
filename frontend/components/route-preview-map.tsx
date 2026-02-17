"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useRouteConfig } from "@/lib/hooks"

interface RoutePoint {
  lat: number
  lon: number
}

interface RoutePreviewMapProps {
  fromPoint: RoutePoint
  toPoint: RoutePoint
  geometry?: unknown
}

interface YMapLike {
  geoObjects: {
    add: (geoObject: unknown) => void
  }
  setCenter?: (coords: number[], zoom?: number) => void
  destroy: () => void
}

interface YPlacemarkLike {
  geometry: {
    setCoordinates: (coords: number[]) => void
  }
}

interface YPolylineLike {
  geometry: {
    setCoordinates: (coords: number[][]) => void
  }
}

let yandexScriptPromise: Promise<void> | null = null
const YANDEX_SCRIPT_ID = "yandex-maps-script"

function loadYandexMaps(apiKey?: string | null) {
  if (typeof window === "undefined") {
    return Promise.resolve()
  }
  if (window.ymaps) {
    return Promise.resolve()
  }
  if (yandexScriptPromise) {
    return yandexScriptPromise
  }

  const resolvedApiKey = (apiKey || process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "").trim()
  const keyPart = resolvedApiKey ? `apikey=${encodeURIComponent(resolvedApiKey)}&` : ""
  const src = `https://api-maps.yandex.ru/2.1/?${keyPart}lang=ru_RU`

  yandexScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(YANDEX_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      const existingStatus = existing.dataset.status
      if (window.ymaps && existingStatus !== "error") {
        resolve()
        return
      }
      if (existingStatus === "loading" || existingStatus === "loaded") {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener(
          "error",
          () => {
            yandexScriptPromise = null
            reject(new Error("Failed to load Yandex Maps script"))
          },
          { once: true },
        )
        return
      }
      if (existingStatus === "error") {
        existing.remove()
      }
    }

    const script = document.createElement("script")
    script.id = YANDEX_SCRIPT_ID
    script.src = src
    script.async = true
    script.defer = true
    script.dataset.status = "loading"
    script.onload = () => {
      script.dataset.status = "loaded"
      resolve()
    }
    script.onerror = () => {
      script.dataset.status = "error"
      yandexScriptPromise = null
      reject(new Error("Failed to load Yandex Maps script"))
    }
    document.head.appendChild(script)
  })

  return yandexScriptPromise
}

function toMapCoords(pair: unknown): [number, number] | null {
  if (!Array.isArray(pair) || pair.length < 2) return null
  const a = Number(pair[0])
  const b = Number(pair[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null

  // Routing APIs usually return [lon, lat]. Yandex map expects [lat, lon].
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    return [b, a]
  }
  if (Math.abs(b) > 90 && Math.abs(a) <= 90) {
    return [a, b]
  }
  return [b, a]
}

function parseWktLineString(value: string): [number, number][] {
  const match = value.match(/LINESTRING\s*\((.+)\)/i)
  if (!match) return []

  const pairs = match[1].split(",")
  const result: [number, number][] = []
  for (const pair of pairs) {
    const [lonRaw, latRaw] = pair.trim().split(/\s+/)
    const lon = Number(lonRaw)
    const lat = Number(latRaw)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue
    }
    result.push([lat, lon])
  }
  return result
}

function normalizeGeometry(geometry: unknown, fromPoint: RoutePoint, toPoint: RoutePoint): [number, number][] {
  const fallback: [number, number][] = [
    [fromPoint.lat, fromPoint.lon],
    [toPoint.lat, toPoint.lon],
  ]

  if (!geometry) {
    return fallback
  }

  if (typeof geometry === "string") {
    const parsed = parseWktLineString(geometry)
    return parsed.length >= 2 ? parsed : fallback
  }

  const rawCoords =
    Array.isArray(geometry) ? geometry :
      typeof geometry === "object" && geometry !== null && "coordinates" in geometry
        ? (geometry as { coordinates?: unknown }).coordinates
        : null

  if (!Array.isArray(rawCoords)) {
    return fallback
  }

  const parsed: [number, number][] = []
  for (const point of rawCoords) {
    const coords = toMapCoords(point)
    if (coords) {
      parsed.push(coords)
    }
  }

  return parsed.length >= 2 ? parsed : fallback
}

export function RoutePreviewMap({ fromPoint, toPoint, geometry }: RoutePreviewMapProps) {
  const { tr } = useI18n()
  const { data: routeConfig, isLoading: routeConfigLoading } = useRouteConfig()
  const staticApiKey = (process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "").trim()
  const runtimeApiKey = (staticApiKey || routeConfig?.api_key || "").trim()
  const shouldWaitForRuntimeConfig = !staticApiKey && routeConfigLoading
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<YMapLike | null>(null)
  const fromPlacemarkRef = useRef<YPlacemarkLike | null>(null)
  const toPlacemarkRef = useRef<YPlacemarkLike | null>(null)
  const polylineRef = useRef<YPolylineLike | null>(null)

  const lineCoords = useMemo(
    () => normalizeGeometry(geometry, fromPoint, toPoint),
    [geometry, fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon],
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current || shouldWaitForRuntimeConfig) return
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        await loadYandexMaps(runtimeApiKey || null)
        if (cancelled || !window.ymaps || !containerRef.current || mapRef.current) return

        window.ymaps.ready(() => {
          if (cancelled || !containerRef.current || !window.ymaps || mapRef.current) return

          const center: [number, number] = [
            (fromPoint.lat + toPoint.lat) / 2,
            (fromPoint.lon + toPoint.lon) / 2,
          ]

          const map = new window.ymaps.Map(containerRef.current, {
            center,
            zoom: 12,
            controls: ["zoomControl", "fullscreenControl"],
          }) as unknown as YMapLike
          mapRef.current = map

          const fromPlacemark = new window.ymaps.Placemark([fromPoint.lat, fromPoint.lon], { iconCaption: "A" }, {}) as unknown as YPlacemarkLike
          const toPlacemark = new window.ymaps.Placemark([toPoint.lat, toPoint.lon], { iconCaption: "B" }, {}) as unknown as YPlacemarkLike
          fromPlacemarkRef.current = fromPlacemark
          toPlacemarkRef.current = toPlacemark

          if (window.ymaps.Polyline) {
            const polyline = new window.ymaps.Polyline(
              lineCoords,
              {},
              {
                strokeColor: "#f5b400",
                strokeWidth: 4,
                strokeOpacity: 0.9,
              },
            ) as unknown as YPolylineLike
            polylineRef.current = polyline
            map.geoObjects.add(polyline)
          }

          map.geoObjects.add(fromPlacemark)
          map.geoObjects.add(toPlacemark)
          setLoading(false)
        })
      } catch {
        if (!cancelled) {
          setError(tr("Unable to load map preview", "Не удалось загрузить карту маршрута"))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      const map = mapRef.current
      mapRef.current = null
      fromPlacemarkRef.current = null
      toPlacemarkRef.current = null
      polylineRef.current = null

      if (!map) return
      try {
        map.destroy()
      } catch {
        // Ignore map destroy races during tab switches/unmount.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeApiKey, shouldWaitForRuntimeConfig])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    fromPlacemarkRef.current?.geometry.setCoordinates([fromPoint.lat, fromPoint.lon])
    toPlacemarkRef.current?.geometry.setCoordinates([toPoint.lat, toPoint.lon])

    if (polylineRef.current) {
      polylineRef.current.geometry.setCoordinates(lineCoords)
    } else if (window.ymaps?.Polyline) {
      const polyline = new window.ymaps.Polyline(
        lineCoords,
        {},
        {
          strokeColor: "#f5b400",
          strokeWidth: 4,
          strokeOpacity: 0.9,
        },
      ) as unknown as YPolylineLike
      polylineRef.current = polyline
      map.geoObjects.add(polyline)
    }

    map.setCenter?.([
      (fromPoint.lat + toPoint.lat) / 2,
      (fromPoint.lon + toPoint.lon) / 2,
    ])
  }, [fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon, lineCoords])

  return (
    <div className="relative rounded-lg border bg-card">
      <div ref={containerRef} className="h-[320px] w-full rounded-lg" />
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4 text-sm text-muted-foreground">{error}</div>}
    </div>
  )
}
