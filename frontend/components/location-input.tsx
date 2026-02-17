"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"
import { MapPickerDialog } from "@/components/map-picker-dialog"
import { fetchLocationSuggestions, reverseGeocode, useProfile } from "@/lib/hooks"
import type { LocationSuggestion } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

type LocationSource = "manual_text" | "geocoded" | "map_pick"

interface LocationInputChange {
  text: string
  lat: number | null
  lon: number | null
  source: LocationSource
}

interface LocationInputProps {
  id?: string
  value: string
  lat: number | null
  lon: number | null
  placeholder?: string
  onChange: (next: LocationInputChange) => void
}

export function LocationInput({ id, value, lat, lon, placeholder, onChange }: LocationInputProps) {
  const { tr } = useI18n()
  const { data: profile } = useProfile()
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const preferredCenter =
    typeof profile?.home_location_lat === "number" && typeof profile?.home_location_lon === "number"
      ? { lat: profile.home_location_lat, lon: profile.home_location_lon }
      : null

  useEffect(() => {
    const controller = new AbortController()
    const query = value.trim()

    if (query.length < 2) {
      setSuggestions([])
      setLoading(false)
      return () => controller.abort()
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetchLocationSuggestions(query, 8, controller.signal)
        if (!controller.signal.aborted) {
          setSuggestions(response.data || [])
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 240)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const hasSuggestions = open && suggestions.length > 0

  async function handleMapSelect(point: { lat: number; lon: number }) {
    let label = `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`
    try {
      const response = await reverseGeocode(point.lat, point.lon)
      if (response.data?.label) {
        label = response.data.label
      }
    } catch {
      // Keep coordinate fallback label when reverse geocoding is unavailable.
    }
    onChange({
      text: label,
      lat: point.lat,
      lon: point.lon,
      source: "map_pick",
    })
    setOpen(false)
  }

  function handleSuggestionPick(item: LocationSuggestion) {
    const label = item.subtitle ? `${item.title}, ${item.subtitle}` : item.title
    onChange({
      text: label,
      lat: item.lat,
      lon: item.lon,
      source: "geocoded",
    })
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="relative flex flex-col gap-2" ref={rootRef}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value
            onChange({
              text: nextValue,
              lat: null,
              lon: null,
              source: "manual_text",
            })
            setOpen(true)
          }}
          placeholder={placeholder || tr("Type location", "Введите место")}
          className="pr-10"
        />

        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <MapPickerDialog
            value={lat !== null && lon !== null ? { lat, lon } : null}
            preferredCenter={preferredCenter}
            onSelect={handleMapSelect}
          />
        </div>

        {loading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}
      </div>

      {hasSuggestions && (
        <div className="absolute z-20 top-[calc(100%+4px)] left-0 right-0 rounded-md border bg-popover shadow-md">
          <ul className="max-h-56 overflow-auto py-1">
            {suggestions.map((item) => (
              <li key={`${item.title}-${item.lat}-${item.lon}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent/10 transition-colors"
                  onClick={() => handleSuggestionPick(item)}
                >
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  {item.subtitle && <div className="text-xs text-muted-foreground">{item.subtitle}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lat !== null && lon !== null && (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
          <Navigation className="h-3 w-3" />
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </div>
      )}
    </div>
  )
}
