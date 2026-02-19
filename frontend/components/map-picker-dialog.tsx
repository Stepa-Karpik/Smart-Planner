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
  type LeafletMapEvent,
} from "@/lib/leaflet-map"

interface MapPoint {
  lat: number
  lon: number
}

interface MapPickerDialogProps {
  value: MapPoint | null
  onSelect: (point: MapPoint) => void
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423]

function eventToCoords(event: LeafletMapEvent): [number, number] | null {
  const lat = Number(event.latlng?.lat)
  const lon = Number(event.latlng?.lng)
  if (!isValidLatLon(lat, lon)) return null
  return [lat, lon]
}

export function MapPickerDialog({ value, onSelect }: MapPickerDialogProps) {
  const { tr } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletCircleMarker | null>(null)
  const clickHandlerRef = useRef<((event: LeafletMapEvent) => void) | null>(null)
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
      mapLogInfo("MapPicker init started", { open })

      try {
        const sized = await waitForContainerSize(containerEl)
        if (!sized) {
          mapLogWarn("MapPicker container size timeout", {
            width: containerEl.clientWidth,
            height: containerEl.clientHeight,
          })
        }

        const L = await loadLeaflet()
        if (cancelled || mapRef.current) {
          mapLogWarn("MapPicker init cancelled after load", {
            cancelled,
            hasMap: Boolean(mapRef.current),
          })
          return
        }

        const map = L.map(containerEl, { zoomControl: true }).setView(center, 12)
        mapRef.current = map

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        })
        tileLayer.on?.("load", () => mapLogInfo("MapPicker tile layer loaded"))
        tileLayer.on?.("tileerror", (event) => mapLogWarn("MapPicker tile error", { event }))
        tileLayer.addTo(map)

        const marker = L.circleMarker(center, {
          radius: 7,
          color: "#f5b400",
          weight: 2,
          fillColor: "#f5b400",
          fillOpacity: 0.95,
        }).addTo(map)
        markerRef.current = marker

        const clickHandler = (event: LeafletMapEvent) => {
          const coords = eventToCoords(event)
          if (!coords) return

          marker.setLatLng(coords)
          const [lat, lon] = coords
          mapLogInfo("MapPicker point selected", { lat, lon })
          onSelectRef.current({ lat, lon })
          setOpen(false)
        }
        clickHandlerRef.current = clickHandler
        map.on("click", clickHandler)

        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => invalidateMapSize(mapRef.current))
          ro.observe(containerEl)
          resizeObserverRef.current = ro
        }

        invalidateMapSize(map)
        mapLogInfo("MapPicker map ready", {
          center,
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
        })
      } catch (err) {
        if (!cancelled) {
          setError(trRef.current("Unable to load map", "Unable to load map"))
        }
        mapLogError("MapPicker init failed", err)
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
          map.off("click", handler)
        } catch (err) {
          mapLogWarn("MapPicker off(click) failed", { error: String(err) })
        }
      }
      try {
        map.remove()
      } catch (err) {
        mapLogWarn("MapPicker map remove failed", { error: String(err) })
      }
    }
  }, [open, containerEl])

  useEffect(() => {
    if (!open || !mapRef.current || !markerRef.current) return
    markerRef.current.setLatLng(center)
    mapRef.current.setView(center, 12)
    invalidateMapSize(mapRef.current)
  }, [open, center])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        mapLogInfo("MapPicker dialog state changed", { open: next })
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
            mapLogInfo("MapPicker trigger clicked")
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
