"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"
import { MapPickerDialog } from "@/components/map-picker-dialog"
import { fetchLocationSuggestions, reverseGeocode, useProfile } from "@/lib/hooks"
import type { LocationSuggestion, MapProvider } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

type LocationSource = "manual_text" | "geocoded" | "map_pick"
const LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30
const LOCATION_CACHE_STORAGE_KEY = "sp_location_suggest_cache_v1"
const LOCATION_CACHE_MAX_ITEMS = 80

type LocationCacheEntry = {
  expiresAt: number
  suggestions: LocationSuggestion[]
}

const locationSuggestionMemoryCache = new Map<string, LocationCacheEntry>()
const locationSuggestionInFlight = new Map<string, Promise<LocationSuggestion[]>>()

function normalizeLocationQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function locationCacheKey(query: string, limit: number) {
  return `${normalizeLocationQuery(query)}:${limit}`
}

function readStoredLocationCache(): Record<string, LocationCacheEntry> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(LOCATION_CACHE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStoredLocationCache(cache: Record<string, LocationCacheEntry>) {
  if (typeof window === "undefined") return
  const entries = Object.entries(cache)
    .filter(([, value]) => value.expiresAt > Date.now())
    .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
    .slice(0, LOCATION_CACHE_MAX_ITEMS)
  window.localStorage.setItem(LOCATION_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
}

function getCachedLocationSuggestions(key: string): LocationSuggestion[] | null {
  const memory = locationSuggestionMemoryCache.get(key)
  if (memory && memory.expiresAt > Date.now()) return memory.suggestions

  const stored = readStoredLocationCache()[key]
  if (!stored || stored.expiresAt <= Date.now()) return null
  locationSuggestionMemoryCache.set(key, stored)
  return stored.suggestions
}

function setCachedLocationSuggestions(key: string, suggestions: LocationSuggestion[]) {
  const entry = { expiresAt: Date.now() + LOCATION_CACHE_TTL_MS, suggestions }
  locationSuggestionMemoryCache.set(key, entry)
  const stored = readStoredLocationCache()
  stored[key] = entry
  writeStoredLocationCache(stored)
}

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
  mapProvider?: MapProvider
  onChange: (next: LocationInputChange) => void
}

export function LocationInput({ id, value, lat, lon, placeholder, mapProvider, onChange }: LocationInputProps) {
  const { tr } = useI18n()
  const { data: profile } = useProfile()
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const resolvedMapProvider: MapProvider = mapProvider || profile?.map_provider || "leaflet"

  useEffect(() => {
    const controller = new AbortController()
    const query = value.trim()

    if (query.length < 2) {
      setSuggestions([])
      setLoading(false)
      return () => controller.abort()
    }

    const timer = setTimeout(async () => {
      const key = locationCacheKey(query, 8)
      const cached = getCachedLocationSuggestions(key)
      if (cached) {
        setSuggestions(cached)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        let request = locationSuggestionInFlight.get(key)
        if (!request) {
          request = fetchLocationSuggestions(query, 8, controller.signal).then((response) => response.data || [])
          locationSuggestionInFlight.set(key, request)
        }
        const nextSuggestions = await request
        if (!controller.signal.aborted) {
          setCachedLocationSuggestions(key, nextSuggestions)
          setSuggestions(nextSuggestions)
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
        }
      } finally {
        locationSuggestionInFlight.delete(key)
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
            onSelect={handleMapSelect}
            provider={resolvedMapProvider}
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
