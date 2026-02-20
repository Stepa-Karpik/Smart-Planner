"use client"

import type { MapProvider } from "@/lib/types"
import { LeafletMapPickerDialog } from "@/components/leaflet-map-picker-dialog"
import { YandexMapPickerDialog } from "@/components/yandex-map-picker-dialog"

interface MapPoint {
  lat: number
  lon: number
}

interface MapPickerDialogProps {
  value: MapPoint | null
  onSelect: (point: MapPoint) => void
  provider?: MapProvider
}

export function MapPickerDialog({ value, onSelect, provider = "leaflet" }: MapPickerDialogProps) {
  if (provider === "yandex") {
    return <YandexMapPickerDialog value={value} onSelect={onSelect} />
  }

  return <LeafletMapPickerDialog value={value} onSelect={onSelect} />
}

