import type { RouteMode } from "@/lib/types"

export const baseRouteModes: RouteMode[] = ["walking", "public_transport", "driving", "bicycle"]

export function hasMetroCity(location?: string | null) {
  const normalized = (location || "").toLowerCase()
  return /москв|moscow|санкт[-\s]?петербург|петербург|spb|saint[-\s]?petersburg|st\.?\s?petersburg|новосибирск|novosibirsk/.test(
    normalized,
  )
}

export function routeModesForLocation(location?: string | null): RouteMode[] {
  if (!hasMetroCity(location)) return baseRouteModes
  return ["walking", "public_transport", "metro", "driving", "bicycle"]
}
