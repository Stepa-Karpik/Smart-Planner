"use client"

import type { LeafletMap, LeafletNamespace, LeafletPolyline } from "@/lib/leaflet-map"
import type { YandexMap, YandexNamespace, YandexPolyline } from "@/lib/yandex-map"

type LatLonPath = [number, number][]

type LeafletDrawArgs = {
  mapProvider: "leaflet"
  geometryLatLon: LatLonPath
  map: LeafletMap
  L: LeafletNamespace
  line?: LeafletPolyline | null
}

type YandexDrawArgs = {
  mapProvider: "yandex"
  geometryLatLon: LatLonPath
  map: YandexMap
  ymaps: YandexNamespace
  line?: YandexPolyline | null
}

export function drawRoute(args: LeafletDrawArgs): LeafletPolyline
export function drawRoute(args: YandexDrawArgs): YandexPolyline
export function drawRoute(args: LeafletDrawArgs | YandexDrawArgs): LeafletPolyline | YandexPolyline {
  if (args.mapProvider === "leaflet") {
    if (args.line) {
      args.line.setLatLngs(args.geometryLatLon)
      return args.line
    }
    return args.L.polyline(args.geometryLatLon, {
      color: "#f5b400",
      weight: 4,
      opacity: 0.9,
    }).addTo(args.map)
  }

  if (args.line) {
    args.line.geometry.setCoordinates(args.geometryLatLon)
    return args.line
  }
  const line = new args.ymaps.Polyline(
    args.geometryLatLon,
    {},
    {
      strokeColor: "#f5b400",
      strokeWidth: 4,
      strokeOpacity: 0.9,
    },
  )
  args.map.geoObjects.add(line)
  return line
}

