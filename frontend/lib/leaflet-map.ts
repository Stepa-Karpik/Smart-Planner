"use client"

const MAP_LOG_PREFIX = "[SmartPlanner:Leaflet]"
const LEAFLET_SCRIPT_ID = "leaflet-sdk-script"
const LEAFLET_CSS_ID = "leaflet-sdk-css"
const LEAFLET_JS_SOURCES = [
  "/vendor/leaflet/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
] as const
const LEAFLET_CSS_SOURCES = [
  "/vendor/leaflet/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
] as const
const LEAFLET_LOAD_TIMEOUT_MS = 10_000

interface LeafletPoint {
  lat: number
  lng: number
}

interface LeafletMapEvent {
  latlng: LeafletPoint
}

interface LeafletLayer<TLayer = unknown> {
  addTo: (target: LeafletMap) => TLayer
  remove?: () => void
  on?: (event: string, handler: (event: unknown) => void) => TLayer
  off?: (event: string, handler?: (event: unknown) => void) => TLayer
}

interface LeafletCircleMarker extends LeafletLayer<LeafletCircleMarker> {
  setLatLng: (latlng: [number, number] | LeafletPoint) => LeafletCircleMarker
  getLatLng: () => LeafletPoint
}

interface LeafletPolyline extends LeafletLayer<LeafletPolyline> {
  setLatLngs: (latlngs: [number, number][]) => LeafletPolyline
  getBounds: () => LeafletLatLngBounds
}

interface LeafletLatLngBounds {
  isValid: () => boolean
}

interface LeafletTileLayer extends LeafletLayer<LeafletTileLayer> {}

interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  on: (event: string, handler: (event: LeafletMapEvent) => void) => LeafletMap
  off: (event: string, handler?: (event: LeafletMapEvent) => void) => LeafletMap
  remove: () => void
  invalidateSize: (options?: { animate?: boolean; pan?: boolean }) => void
  fitBounds: (bounds: LeafletLatLngBounds, options?: { padding?: [number, number]; maxZoom?: number }) => void
}

interface LeafletNamespace {
  map: (container: HTMLElement, options?: Record<string, unknown>) => LeafletMap
  tileLayer: (urlTemplate: string, options?: Record<string, unknown>) => LeafletTileLayer
  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletCircleMarker
  polyline: (latlngs: [number, number][], options?: Record<string, unknown>) => LeafletPolyline
  latLngBounds: (points: [number, number][]) => LeafletLatLngBounds
}

declare global {
  interface Window {
    L?: LeafletNamespace
  }
}

let loaderPromise: Promise<LeafletNamespace> | null = null

export function mapLogInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`${MAP_LOG_PREFIX} ${message}`, details)
  } else {
    console.log(`${MAP_LOG_PREFIX} ${message}`)
  }
}

export function mapLogWarn(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.warn(`${MAP_LOG_PREFIX} ${message}`, details)
  } else {
    console.warn(`${MAP_LOG_PREFIX} ${message}`)
  }
}

export function mapLogError(message: string, error?: unknown, details?: Record<string, unknown>) {
  if (details) {
    console.error(`${MAP_LOG_PREFIX} ${message}`, { error, ...details })
  } else {
    console.error(`${MAP_LOG_PREFIX} ${message}`, error)
  }
}

function ensureLeafletCss(): Promise<void> {
  const existing = document.getElementById(LEAFLET_CSS_ID) as HTMLLinkElement | null
  if (existing?.dataset.state === "loaded") {
    return Promise.resolve()
  }

  if (existing?.dataset.state === "loading") {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Failed to load Leaflet CSS")), { once: true })
    })
  }

  existing?.remove()

  return new Promise((resolve, reject) => {
    let sourceIndex = 0

    const tryNextSource = () => {
      if (sourceIndex >= LEAFLET_CSS_SOURCES.length) {
        reject(new Error("Failed to load Leaflet CSS from all sources"))
        return
      }

      const href = LEAFLET_CSS_SOURCES[sourceIndex++]
      const link = document.createElement("link")
      link.id = LEAFLET_CSS_ID
      link.rel = "stylesheet"
      link.href = href
      link.dataset.state = "loading"

      link.onload = () => {
        link.dataset.state = "loaded"
        mapLogInfo("Leaflet CSS loaded", { href })
        resolve()
      }

      link.onerror = () => {
        mapLogWarn("Leaflet CSS load failed", { href })
        link.remove()
        tryNextSource()
      }

      document.head.appendChild(link)
    }

    tryNextSource()
  })
}

function ensureLeafletScript(): Promise<void> {
  const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null
  if (window.L) {
    return Promise.resolve()
  }

  if (existing?.dataset.state === "loading") {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Failed to load Leaflet script")), { once: true })
    })
  }

  existing?.remove()

  return new Promise((resolve, reject) => {
    let sourceIndex = 0

    const tryNextSource = () => {
      if (sourceIndex >= LEAFLET_JS_SOURCES.length) {
        reject(new Error("Failed to load Leaflet script from all sources"))
        return
      }

      const src = LEAFLET_JS_SOURCES[sourceIndex++]
      const script = document.createElement("script")
      script.id = LEAFLET_SCRIPT_ID
      script.src = src
      script.async = true
      script.dataset.state = "loading"

      const timeoutId = window.setTimeout(() => {
        script.remove()
        mapLogWarn("Leaflet script load timeout", { src, timeoutMs: LEAFLET_LOAD_TIMEOUT_MS })
        tryNextSource()
      }, LEAFLET_LOAD_TIMEOUT_MS)

      script.onload = () => {
        window.clearTimeout(timeoutId)
        script.dataset.state = "loaded"
        mapLogInfo("Leaflet script loaded", { src })
        resolve()
      }

      script.onerror = () => {
        window.clearTimeout(timeoutId)
        script.remove()
        mapLogWarn("Leaflet script load failed", { src })
        tryNextSource()
      }

      document.head.appendChild(script)
    }

    tryNextSource()
  })
}

export function loadLeaflet(): Promise<LeafletNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet can only be loaded in browser"))
  }

  if (window.L) {
    return Promise.resolve(window.L)
  }

  if (loaderPromise) {
    return loaderPromise
  }

  mapLogInfo("Leaflet load requested", { hasL: Boolean(window.L) })

  loaderPromise = (async () => {
    await ensureLeafletCss()
    await ensureLeafletScript()

    if (!window.L) {
      throw new Error("Leaflet loaded but window.L missing")
    }
    return window.L
  })().catch((error) => {
    loaderPromise = null
    mapLogError("Leaflet load failed", error)
    throw error
  })

  return loaderPromise
}

export function isValidLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

export async function waitForContainerSize(
  element: HTMLElement,
  options?: { timeoutMs?: number; minWidth?: number; minHeight?: number },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 3000
  const minWidth = options?.minWidth ?? 40
  const minHeight = options?.minHeight ?? 40
  const started = Date.now()

  if (element.clientWidth >= minWidth && element.clientHeight >= minHeight) {
    return true
  }

  return new Promise((resolve) => {
    const check = () => {
      if (element.clientWidth >= minWidth && element.clientHeight >= minHeight) {
        resolve(true)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false)
        return
      }
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  })
}

export function invalidateMapSize(map: LeafletMap | null) {
  if (!map) return
  const run = () => {
    try {
      map.invalidateSize({ animate: false, pan: false })
    } catch (error) {
      mapLogWarn("invalidateSize failed", { error: String(error) })
    }
  }
  run()
  requestAnimationFrame(run)
  setTimeout(run, 50)
  setTimeout(run, 250)
  setTimeout(run, 700)
}

export type {
  LeafletLatLngBounds,
  LeafletMap,
  LeafletMapEvent,
  LeafletNamespace,
  LeafletCircleMarker,
  LeafletPolyline,
}
