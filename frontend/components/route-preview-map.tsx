"use client"

import type { MapProvider } from "@/lib/types"
import { LeafletRoutePreviewMap } from "@/components/leaflet-route-preview-map"
import { YandexRoutePreviewMap } from "@/components/yandex-route-preview-map"

interface RoutePoint {
  lat: number
  lon: number
}

interface RoutePreviewMapProps {
  fromPoint: RoutePoint
  toPoint: RoutePoint
  geometryLatLon?: unknown
  geometry?: unknown
  provider?: MapProvider
}

export function RoutePreviewMap({ fromPoint, toPoint, geometryLatLon, geometry, provider = "leaflet" }: RoutePreviewMapProps) {
  if (provider === "yandex") {
    return <YandexRoutePreviewMap fromPoint={fromPoint} toPoint={toPoint} geometryLatLon={geometryLatLon} geometry={geometry} />
  }

  return <LeafletRoutePreviewMap fromPoint={fromPoint} toPoint={toPoint} geometryLatLon={geometryLatLon} geometry={geometry} />
}

