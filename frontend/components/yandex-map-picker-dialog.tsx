"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Map } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { isValidLatLon, mapLogError, mapLogInfo, mapLogWarn, waitForContainerSize } from "@/lib/leaflet-map"
import { fitYandexViewport, loadYandexMaps, type YandexGeoObject, type YandexMap, type YandexMapEvent } from "@/lib/yandex-map"
import { useI18n } from "@/lib/i18n"

interface MapPoint {
  lat: number
  lon: number
}

interface YandexMapPickerDialogProps {
  value: MapPoint | null
  onSelect: (point: MapPoint) => void
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423]

function eventToCoords(event: YandexMapEvent): [number, number] | null {
  const raw = event.get("coords")
  if (!Array.isArray(raw) || raw.length < 2) return null

  const lat = Number(raw[0])
  const lon = Number(raw[1])
  if (!isValidLatLon(lat, lon)) return null
  return [lat, lon]
}

export function YandexMapPickerDialog({ value, onSelect }: YandexMapPickerDialogProps) {
  const { tr } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const mapRef = useRef<YandexMap | null>(null)
  const markerRef = useRef<YandexGeoObject | null>(null)
  const clickHandlerRef = useRef<((event: YandexMapEvent) => void) | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const onSelectRef = useRef(onSelect)
  const trRef = useRef(tr)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    trRef.current = tr
  }, [tr])

  const center = useMemo<[number, number]>(() => {
    if (value && isValidLatLon(value.lat, value.lon)) return [value.lat, value.lon]
    return DEFAULT_CENTER
  }, [value?.lat, value?.lon])

  useEffect(() => {
    if (!open || !containerEl || mapRef.current) return

    let cancelled = false

    const initMap = async () => {
      setLoading(true)
      setError(null)
      mapLogInfo("MapPicker init started", { open, provider: "yandex" })

      try {
        const sized = await waitForContainerSize(containerEl)
        if (!sized) {
          mapLogWarn("MapPicker container size timeout", {
            width: containerEl.clientWidth,
            height: containerEl.clientHeight,
            provider: "yandex",
          })
        }

        const ymaps = await loadYandexMaps()
        if (cancelled || mapRef.current) return

        const map = new ymaps.Map(
          containerEl,
          {
            center,
            zoom: 12,
            controls: ["zoomControl"],
          },
          {
            suppressMapOpenBlock: true,
          },
        )
        mapRef.current = map

        const marker = new ymaps.Placemark(
          center,
          {},
          {
            preset: "islands#yellowCircleDotIcon",
          },
        )
        markerRef.current = marker
        map.geoObjects.add(marker)

        const clickHandler = (event: YandexMapEvent) => {
          const coords = eventToCoords(event)
          if (!coords) return

          marker.geometry.setCoordinates(coords)
          const [lat, lon] = coords
          mapLogInfo("MapPicker point selected", { lat, lon, provider: "yandex" })
          onSelectRef.current({ lat, lon })
          setOpen(false)
        }
        clickHandlerRef.current = clickHandler
        map.events.add("click", clickHandler)

        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => fitYandexViewport(mapRef.current))
          ro.observe(containerEl)
          resizeObserverRef.current = ro
        }

        fitYandexViewport(map)
        mapLogInfo("MapPicker map ready", {
          center,
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
          provider: "yandex",
        })
      } catch (err) {
        if (!cancelled) {
          setError(trRef.current("Unable to load map", "Unable to load map"))
        }
        mapLogError("MapPicker init failed", err, { provider: "yandex" })
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
      const handler = clickHandlerRef.current
      mapRef.current = null
      markerRef.current = null
      clickHandlerRef.current = null

      if (!map) return
      if (handler) {
        try {
          map.events.remove("click", handler)
        } catch (err) {
          mapLogWarn("MapPicker events.remove(click) failed", { error: String(err), provider: "yandex" })
        }
      }

      try {
        map.destroy()
      } catch (err) {
        mapLogWarn("MapPicker map destroy failed", { error: String(err), provider: "yandex" })
      }
    }
  }, [open, containerEl])

  useEffect(() => {
    if (!open || !mapRef.current || !markerRef.current) return

    markerRef.current.geometry.setCoordinates(center)
    mapRef.current.setCenter(center, 12, { duration: 0 })
    fitYandexViewport(mapRef.current)
  }, [open, center])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        mapLogInfo("MapPicker dialog state changed", { open: next, provider: "yandex" })
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title={tr("Pick on map", "Pick on map")}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            mapLogInfo("MapPicker trigger clicked", { provider: "yandex" })
          }}
        >
          <Map className="h-4 w-4" />
          <span className="sr-only">{tr("Pick on map", "Pick on map")}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tr("Select location on map", "Select location on map")}</DialogTitle>
          <DialogDescription className="sr-only">
            {tr(
              "Pick a point on the map to set event location.",
              "Pick a point on the map to set event location.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative rounded-md border">
          <div ref={setContainerEl} className="h-[420px] w-full rounded-md" />

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6 text-sm text-muted-foreground">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

