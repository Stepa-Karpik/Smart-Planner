"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Map } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n"
import { useRouteConfig } from "@/lib/hooks"

declare global {
  interface Window {
    ymaps?: {
      ready: (callback: () => void) => void
      Map: new (container: HTMLElement, options: Record<string, unknown>) => YMap
      Placemark: new (coords: number[], properties?: Record<string, unknown>, options?: Record<string, unknown>) => YPlacemark
      Polyline?: new (coords: number[][], properties?: Record<string, unknown>, options?: Record<string, unknown>) => unknown
    }
  }
}

interface YMap {
  events: {
    add: (eventName: string, handler: (event: { get: (key: string) => number[] }) => void) => void
  }
  geoObjects: {
    add: (geoObject: unknown) => void
  }
  setCenter?: (coords: number[], zoom?: number) => void
  destroy: () => void
}

interface YPlacemark {
  geometry: {
    setCoordinates: (coords: number[]) => void
  }
}

interface MapPoint {
  lat: number
  lon: number
}

interface MapPickerDialogProps {
  value: MapPoint | null
  preferredCenter?: MapPoint | null
  onSelect: (point: MapPoint) => void
}

function isValidLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
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

function haversineDistanceKm(a: [number, number], b: [number, number]): number {
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const r = 6371
  const dLat = toRadians(b[0] - a[0])
  const dLon = toRadians(b[1] - a[1])
  const lat1 = toRadians(a[0])
  const lat2 = toRadians(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export function MapPickerDialog({ value, preferredCenter = null, onSelect }: MapPickerDialogProps) {
  const { tr } = useI18n()
  const { data: routeConfig, isLoading: routeConfigLoading } = useRouteConfig()
  const staticApiKey = (process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "").trim()
  const runtimeApiKey = (staticApiKey || routeConfig?.api_key || "").trim()
  const shouldWaitForRuntimeConfig = !staticApiKey && routeConfigLoading
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browserCenter, setBrowserCenter] = useState<[number, number] | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<YMap | null>(null)
  const placemarkRef = useRef<YPlacemark | null>(null)
  const onSelectRef = useRef(onSelect)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!open || browserCenter || typeof navigator === "undefined" || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBrowserCenter([position.coords.latitude, position.coords.longitude])
      },
      () => {
        // Ignore denied/failed geolocation and keep fallback center.
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    )
  }, [open, browserCenter])

  const initialCenter = useMemo<[number, number]>(() => {
    const selectedPoint = value && isValidLatLon(value.lat, value.lon) ? ([value.lat, value.lon] as [number, number]) : null
    const homePoint =
      preferredCenter && isValidLatLon(preferredCenter.lat, preferredCenter.lon) ? ([preferredCenter.lat, preferredCenter.lon] as [number, number]) : null
    const geoPoint = browserCenter && isValidLatLon(browserCenter[0], browserCenter[1]) ? browserCenter : null

    if (selectedPoint) {
      return selectedPoint
    }
    if (homePoint && geoPoint) {
      const distanceKm = haversineDistanceKm(geoPoint, homePoint)
      if (distanceKm > 500) {
        return homePoint
      }
      return geoPoint
    }
    if (homePoint) {
      return homePoint
    }
    if (geoPoint) {
      return geoPoint
    }
    return [55.751244, 37.618423]
  }, [value, preferredCenter, browserCenter])

  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current || shouldWaitForRuntimeConfig) return

    let cancelled = false

    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        await loadYandexMaps(runtimeApiKey || null)
        if (cancelled || !window.ymaps || !containerRef.current) return

        window.ymaps.ready(() => {
          if (cancelled || !containerRef.current || !window.ymaps || mapRef.current) return

          const map = new window.ymaps.Map(containerRef.current, {
            center: initialCenter,
            zoom: 12,
            controls: ["zoomControl", "fullscreenControl", "typeSelector"],
          })
          mapRef.current = map

          const placemark = new window.ymaps.Placemark(initialCenter, {}, { draggable: false })
          placemarkRef.current = placemark
          map.geoObjects.add(placemark)

          map.events.add("click", (event) => {
            const coords = event.get("coords")
            if (!coords || coords.length < 2) return

            const lat = Number(coords[0])
            const lon = Number(coords[1])
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

            placemark.geometry.setCoordinates([lat, lon])
            onSelectRef.current({ lat, lon })
            setOpen(false)
          })

          setLoading(false)
        })
      } catch {
        if (!cancelled) {
          setError(tr("Unable to load map", "Не удалось загрузить карту"))
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
      placemarkRef.current = null
      if (!map) return
      try {
        map.destroy()
      } catch {
        // Ignore map destroy races during dialog unmount.
      }
    }
  }, [open, tr, runtimeApiKey, shouldWaitForRuntimeConfig])

  useEffect(() => {
    if (!open || !value || !placemarkRef.current) return
    placemarkRef.current.geometry.setCoordinates([value.lat, value.lon])
    mapRef.current?.setCenter?.([value.lat, value.lon])
  }, [open, value?.lat, value?.lon])

  useEffect(() => {
    if (!open || value || !placemarkRef.current) return
    placemarkRef.current.geometry.setCoordinates(initialCenter)
    mapRef.current?.setCenter?.(initialCenter)
  }, [open, value, initialCenter])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" title={tr("Pick on map", "Выбрать на карте")}>
          <Map className="h-4 w-4" />
          <span className="sr-only">{tr("Pick on map", "Выбрать на карте")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tr("Select location on map", "Выбор точки на карте")}</DialogTitle>
          <DialogDescription className="sr-only">
            {tr("Pick a point on the map to set event location.", "Выберите точку на карте, чтобы указать место события.")}
          </DialogDescription>
        </DialogHeader>
        <div className="relative rounded-md border">
          <div ref={containerRef} className="h-[420px] w-full rounded-md" />
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6 text-sm text-muted-foreground">{error}</div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
