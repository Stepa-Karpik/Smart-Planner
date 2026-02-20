"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Clock, Loader2, Navigation, Ruler } from "lucide-react"
import { toast } from "sonner"
import { RoutePreviewMap } from "@/components/route-preview-map"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LocationInput } from "@/components/location-input"
import { fetchRoutePreview, fetchRouteRecommendations, updateProfile, useProfile } from "@/lib/hooks"
import type { MapProvider, RouteMode, RoutePreview, RouteRecommendation } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

interface LocationState {
  text: string
  lat: number | null
  lon: number | null
}

function formatDuration(seconds: number, tr: (en: string, ru: string) => string) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${tr("min", "мин")}`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours} ${tr("h", "ч")} ${mins} ${tr("m", "м")}`
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${meters} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function modeLabel(mode: RouteMode, tr: (en: string, ru: string) => string) {
  if (mode === "walking") return tr("Walking", "Пешком")
  if (mode === "driving") return tr("Driving", "Авто")
  if (mode === "public_transport") return tr("Public transport", "Общественный транспорт")
  return tr("Bicycle", "Велосипед/самокат")
}

function toQueryLocation(value: LocationState) {
  if (value.lat !== null && value.lon !== null) {
    return `${value.lat},${value.lon}`
  }
  return value.text.trim()
}

function parseLatLon(raw: string): { lat: number; lon: number } | null {
  const parts = raw.split(",")
  if (parts.length !== 2) return null
  const lat = Number(parts[0].trim())
  const lon = Number(parts[1].trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export default function RoutesPage() {
  const { tr } = useI18n()
  const searchParams = useSearchParams()
  const { data: profile, mutate: mutateProfile } = useProfile()
  const mapProvider: MapProvider = profile?.map_provider || "leaflet"

  const initialToRaw = searchParams.get("to") || ""
  const initialToCoords = parseLatLon(initialToRaw)

  const [from, setFrom] = useState<LocationState>({ text: "", lat: null, lon: null })
  const [to, setTo] = useState<LocationState>({
    text: initialToRaw,
    lat: initialToCoords?.lat ?? null,
    lon: initialToCoords?.lon ?? null,
  })
  const [mode, setMode] = useState<RouteMode>("public_transport")
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [savingDefaultMode, setSavingDefaultMode] = useState(false)

  useEffect(() => {
    if (profile?.default_route_mode) {
      setMode(profile.default_route_mode)
    }
  }, [profile?.default_route_mode])

  useEffect(() => {
    if (!profile) return
    if (from.text || from.lat !== null || from.lon !== null) return
    if (typeof profile.home_location_lat !== "number" || typeof profile.home_location_lon !== "number") return
    setFrom({
      text: profile.home_location_text || `${profile.home_location_lat.toFixed(5)}, ${profile.home_location_lon.toFixed(5)}`,
      lat: profile.home_location_lat,
      lon: profile.home_location_lon,
    })
  }, [
    profile,
    profile?.home_location_text,
    profile?.home_location_lat,
    profile?.home_location_lon,
    from.text,
    from.lat,
    from.lon,
  ])

  async function saveModeAsDefault() {
    if (!profile) return
    setSavingDefaultMode(true)
    const response = await updateProfile({ default_route_mode: mode })
    setSavingDefaultMode(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateProfile()
    toast.success(tr("Default transport mode updated", "Режим транспорта по умолчанию обновлён"))
  }

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault()
    const fromValue = toQueryLocation(from)
    const toValue = toQueryLocation(to)

    if (!fromValue || !toValue) {
      toast.error(tr("Please enter both points", "Укажите точку отправления и назначения"))
      return
    }

    setPreviewLoading(true)
    setRecommendationsLoading(true)
    const [previewResponse, recommendationsResponse] = await Promise.all([
      fetchRoutePreview(fromValue, toValue, mode),
      fetchRouteRecommendations({
        from: fromValue,
        to: toValue,
        modes: ["walking", "public_transport", "driving", "bicycle"],
      }),
    ])
    setPreviewLoading(false)
    setRecommendationsLoading(false)

    if (previewResponse.error || !previewResponse.data) {
      toast.error(previewResponse.error?.message || tr("Failed to build route", "Не удалось построить маршрут"))
      return
    }
    setPreview(previewResponse.data)

    if (recommendationsResponse.error || !recommendationsResponse.data) {
      setRecommendations([])
      toast.error(recommendationsResponse.error?.message || tr("Failed to get recommendations", "Не удалось получить рекомендации"))
      return
    }
    setRecommendations(recommendationsResponse.data)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Routes", "Маршруты")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr("Build route previews and compare optimal options", "Стройте маршрут и сравнивайте оптимальные варианты")}
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6">
          <form className="flex flex-col gap-4" onSubmit={handlePreview}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>{tr("From", "Откуда")}</Label>
                <LocationInput
                  value={from.text}
                  lat={from.lat}
                  lon={from.lon}
                  mapProvider={mapProvider}
                  placeholder={tr("Address or point", "Адрес или точка")}
                  onChange={(next) => setFrom({ text: next.text, lat: next.lat, lon: next.lon })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{tr("To", "Куда")}</Label>
                <LocationInput
                  value={to.text}
                  lat={to.lat}
                  lon={to.lon}
                  mapProvider={mapProvider}
                  placeholder={tr("Address or point", "Адрес или точка")}
                  onChange={(next) => setTo({ text: next.text, lat: next.lat, lon: next.lon })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label>{tr("Transport mode", "Режим передвижения")}</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as RouteMode)}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walking">{modeLabel("walking", tr)}</SelectItem>
                    <SelectItem value="public_transport">{modeLabel("public_transport", tr)}</SelectItem>
                    <SelectItem value="driving">{modeLabel("driving", tr)}</SelectItem>
                    <SelectItem value="bicycle">{modeLabel("bicycle", tr)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={previewLoading}>
                {previewLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Navigation className="mr-1.5 h-3.5 w-3.5" />}
                {tr("Build preview", "Построить маршрут")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={saveModeAsDefault} disabled={savingDefaultMode}>
                {savingDefaultMode && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {tr("Save as default", "Сделать по умолчанию")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="preview">
        <TabsList>
          <TabsTrigger value="preview">{tr("Preview", "Предпросмотр")}</TabsTrigger>
          <TabsTrigger value="best">{tr("Best options", "Лучшие варианты")}</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              {preview ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4">
                    <Badge variant="outline">{modeLabel(preview.mode, tr)}</Badge>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {formatDuration(preview.duration_sec, tr)}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      {formatDistance(preview.distance_m)}
                    </div>
                  </div>
                  <RoutePreviewMap
                    fromPoint={preview.from_point}
                    toPoint={preview.to_point}
                    geometry={preview.geometry}
                    provider={mapProvider}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{tr("Build route preview to see details.", "Постройте маршрут, чтобы увидеть детали.")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="best" className="mt-4">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {recommendationsLoading
                    ? tr("Calculating best options...", "Считаю лучшие варианты...")
                    : tr("Build route preview to compare variants.", "Постройте маршрут, чтобы сравнить варианты.")}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recommendations.map((item, index) => (
                    <div
                      key={`${item.mode}-${index}`}
                      className={`rounded-lg border p-3 ${index === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{modeLabel(item.mode, tr)}</Badge>
                          {index === 0 && <Badge className="bg-emerald-600">{tr("Best", "Лучший")}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          score: <span className="font-medium text-foreground">{item.score.toFixed(3)}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                        <span>
                          <Clock className="mr-1 inline h-4 w-4 text-muted-foreground" />
                          {formatDuration(item.duration_sec, tr)}
                        </span>
                        <span>
                          <Ruler className="mr-1 inline h-4 w-4 text-muted-foreground" />
                          {formatDistance(item.distance_m)}
                        </span>
                        <span>{tr("Cost", "Стоимость")}: {item.estimated_cost.toFixed(2)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
