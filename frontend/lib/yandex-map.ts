"use client"

import { apiRequest } from "@/lib/api-client"

const MAP_LOG_PREFIX = "[SmartPlanner:YandexMaps]"
const YANDEX_SCRIPT_ID = "yandex-maps-sdk-script"
const YANDEX_LOAD_TIMEOUT_MS = 12_000

interface YandexMapEvent {
  get: (key: string) => unknown
}

interface YandexEventManager {
  add: (event: string, handler: (event: YandexMapEvent) => void) => void
  remove: (event: string, handler: (event: YandexMapEvent) => void) => void
}

interface YandexGeometry {
  setCoordinates: (coords: [number, number] | [number, number][]) => void
}

interface YandexGeoObject {
  geometry: YandexGeometry
}

interface YandexGeoObjectCollection {
  add: (item: YandexGeoObject) => void
  remove: (item: YandexGeoObject) => void
  removeAll: () => void
}

interface YandexMap {
  events: YandexEventManager
  geoObjects: YandexGeoObjectCollection
  container: {
    fitToViewport: () => void
  }
  setCenter: (center: [number, number], zoom?: number, options?: Record<string, unknown>) => void
  setBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void
  destroy: () => void
}

interface YandexMapState {
  center: [number, number]
  zoom: number
  controls?: string[]
}

interface YandexNamespace {
  ready: (handler: () => void) => void
  Map: new (container: HTMLElement, state: YandexMapState, options?: Record<string, unknown>) => YandexMap
  Placemark: new (
    coordinates: [number, number],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YandexGeoObject
  GeoObject: new (
    feature: {
      geometry: {
        type: "LineString"
        coordinates: [number, number][]
      }
    },
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YandexGeoObject
}

declare global {
  interface Window {
    ymaps?: YandexNamespace
  }
}

let loaderPromise: Promise<YandexNamespace> | null = null
let keyPromise: Promise<string> | null = null

function mapLogInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`${MAP_LOG_PREFIX} ${message}`, details)
  } else {
    console.log(`${MAP_LOG_PREFIX} ${message}`)
  }
}

function mapLogWarn(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.warn(`${MAP_LOG_PREFIX} ${message}`, details)
  } else {
    console.warn(`${MAP_LOG_PREFIX} ${message}`)
  }
}

function mapLogError(message: string, error?: unknown, details?: Record<string, unknown>) {
  if (details) {
    console.error(`${MAP_LOG_PREFIX} ${message}`, { error, ...details })
  } else {
    console.error(`${MAP_LOG_PREFIX} ${message}`, error)
  }
}

function yandexScriptSrc(apiKey: string): string {
  const params = new URLSearchParams({
    apikey: apiKey,
    lang: "ru_RU",
  })
  return `https://api-maps.yandex.ru/2.1/?${params.toString()}`
}

async function resolveApiKey(): Promise<string> {
  if (keyPromise) {
    return keyPromise
  }

  keyPromise = (async () => {
    const response = await apiRequest<{ api_key: string | null }>("/api/v1/routes/config")
    if (response.error) {
      throw new Error(response.error.message)
    }

    const key = response.data?.api_key?.trim()
    if (!key) {
      throw new Error("Yandex Maps API key is empty")
    }
    return key
  })().catch((error) => {
    keyPromise = null
    throw error
  })

  return keyPromise
}

function ensureYandexScript(apiKey: string): Promise<void> {
  const existing = document.getElementById(YANDEX_SCRIPT_ID) as HTMLScriptElement | null
  if (window.ymaps) {
    return Promise.resolve()
  }

  if (existing?.dataset.state === "loading") {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Failed to load Yandex Maps script")), { once: true })
    })
  }

  existing?.remove()

  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.id = YANDEX_SCRIPT_ID
    script.src = yandexScriptSrc(apiKey)
    script.async = true
    script.dataset.state = "loading"

    const timeoutId = window.setTimeout(() => {
      script.remove()
      reject(new Error("Yandex Maps script load timeout"))
    }, YANDEX_LOAD_TIMEOUT_MS)

    script.onload = () => {
      window.clearTimeout(timeoutId)
      script.dataset.state = "loaded"
      mapLogInfo("Yandex Maps script loaded")
      resolve()
    }

    script.onerror = () => {
      window.clearTimeout(timeoutId)
      script.remove()
      reject(new Error("Failed to load Yandex Maps script"))
    }

    document.head.appendChild(script)
  })
}

function waitForYandexReady(): Promise<YandexNamespace> {
  const ymaps = window.ymaps
  if (!ymaps) {
    return Promise.reject(new Error("window.ymaps is unavailable"))
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Yandex Maps ready timeout"))
    }, YANDEX_LOAD_TIMEOUT_MS)

    try {
      ymaps.ready(() => {
        window.clearTimeout(timeoutId)
        resolve(ymaps)
      })
    } catch (error) {
      window.clearTimeout(timeoutId)
      reject(error)
    }
  })
}

export async function loadYandexMaps(): Promise<YandexNamespace> {
  if (typeof window === "undefined") {
    throw new Error("Yandex Maps can only be loaded in browser")
  }

  if (loaderPromise) {
    return loaderPromise
  }

  mapLogInfo("Yandex Maps load requested", { hasYmaps: Boolean(window.ymaps) })

  loaderPromise = (async () => {
    const apiKey = await resolveApiKey()
    await ensureYandexScript(apiKey)
    return waitForYandexReady()
  })().catch((error) => {
    loaderPromise = null
    mapLogError("Yandex Maps load failed", error)
    throw error
  })

  return loaderPromise
}

export function fitYandexViewport(map: YandexMap | null) {
  if (!map) return

  const run = () => {
    try {
      map.container.fitToViewport()
    } catch (error) {
      mapLogWarn("fitToViewport failed", { error: String(error) })
    }
  }

  run()
  requestAnimationFrame(run)
  setTimeout(run, 60)
  setTimeout(run, 220)
}

export function calcYandexBounds(points: [number, number][]): [[number, number], [number, number]] | null {
  if (points.length === 0) {
    return null
  }

  let minLat = Number.POSITIVE_INFINITY
  let minLon = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY

  for (const [lat, lon] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue

    minLat = Math.min(minLat, lat)
    minLon = Math.min(minLon, lon)
    maxLat = Math.max(maxLat, lat)
    maxLon = Math.max(maxLon, lon)
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLat) || !Number.isFinite(maxLon)) {
    return null
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ]
}

export type {
  YandexGeoObject,
  YandexMap,
  YandexMapEvent,
  YandexNamespace,
}

