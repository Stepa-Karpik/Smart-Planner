"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, Check, Clock, Loader2, MapPin, Pencil, Route, Ruler, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { EventEditorModal } from "@/components/event-editor-modal"
import { ReminderList } from "@/components/reminder-list"
import { RoutePreviewMap } from "@/components/route-preview-map"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteEvent, fetchRoutePreview, fetchRouteRecommendations, updateEvent, useEvent, useProfile } from "@/lib/hooks"
import { routeModesForLocation } from "@/lib/route-modes"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { formatDateTimeInTimezone } from "@/lib/timezone"
import type { MapProvider, RouteMode, RoutePreview, RouteRecommendation } from "@/lib/types"

const statusColors: Record<string, string> = {
  planned: "bg-accent/10 text-accent border-accent/20",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
}

const priorityColors: Record<string, string> = {
  "3": "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-200",
  "2": "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  "1": "border-slate-200 bg-white/80 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70",
  "0": "border-slate-200 bg-white/80 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70",
}

function formatDateTime(value: string, timezone?: string | null, locale?: string | null) {
  return formatDateTimeInTimezone(value, timezone, locale)
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
  if (mode === "public_transport") return tr("Transport", "Транспорт")
  if (mode === "metro") return tr("Metro", "Метро")
  return tr("Bicycle", "Вело")
}

function buildMapUrl(locationText?: string, lat?: number, lon?: number) {
  if (typeof lat === "number" && typeof lon === "number") {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
  }
  if (locationText) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(locationText)}`
  }
  return null
}

function pointQuery(lat?: number | null, lon?: number | null, fallback?: string | null) {
  if (typeof lat === "number" && typeof lon === "number") return `${lat},${lon}`
  return fallback?.trim() || ""
}

export default function EventDetailPage() {
  const { tr, locale } = useI18n()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const { data: event, isLoading, mutate } = useEvent(eventId)
  const { data: profile } = useProfile()
  const mapProvider: MapProvider = profile?.map_provider || "leaflet"

  const [editorOpen, setEditorOpen] = useState(false)
  const [mode, setMode] = useState<RouteMode>("public_transport")
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.default_route_mode) setMode(profile.default_route_mode)
  }, [profile?.default_route_mode])

  const fromValue = useMemo(
    () => pointQuery(profile?.home_location_lat, profile?.home_location_lon, profile?.home_location_text),
    [profile?.home_location_lat, profile?.home_location_lon, profile?.home_location_text],
  )
  const toValue = useMemo(
    () => pointQuery(event?.location_lat, event?.location_lon, event?.location_text),
    [event?.location_lat, event?.location_lon, event?.location_text],
  )
  const availableRouteModes = useMemo(() => routeModesForLocation(profile?.home_location_text), [profile?.home_location_text])
  const routeReady = Boolean(fromValue && toValue && event)

  useEffect(() => {
    if (!availableRouteModes.includes(mode)) {
      setMode("public_transport")
    }
  }, [availableRouteModes, mode])

  useEffect(() => {
    let cancelled = false

    async function buildRoute() {
      if (!event || !fromValue || !toValue) {
        setPreview(null)
        setRecommendations([])
        setRouteError(null)
        return
      }

      setRouteLoading(true)
      setRouteError(null)
      const [previewResponse, recommendationsResponse] = await Promise.all([
        fetchRoutePreview(fromValue, toValue, mode, event.start_at),
        fetchRouteRecommendations({
          from: fromValue,
          to: toValue,
          modes: availableRouteModes,
          departure_at: event.start_at,
        }),
      ])

      if (cancelled) return
      setRouteLoading(false)

      if (previewResponse.error || !previewResponse.data) {
        setPreview(null)
        setRecommendations([])
        setRouteError(previewResponse.error?.message || (locale === "ru" ? "Не удалось построить маршрут" : "Failed to build route"))
        return
      }

      setPreview(previewResponse.data)
      if (recommendationsResponse.error || !recommendationsResponse.data) {
        setRecommendations([])
      } else {
        setRecommendations(recommendationsResponse.data)
      }
    }

    void buildRoute()
    return () => {
      cancelled = true
    }
  }, [availableRouteModes, event, fromValue, locale, mode, toValue])

  async function handleStatusChange(status: "done" | "canceled") {
    const response = await updateEvent(eventId, { status })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(status === "done" ? tr("Marked as done", "Отмечено выполненным") : tr("Marked as canceled", "Отмечено отменённым"))
    mutate()
  }

  async function handleDelete() {
    const response = await deleteEvent(eventId)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event deleted", "Событие удалено"))
    router.push("/events")
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-[42rem] rounded-3xl" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-sm font-medium text-foreground">{tr("Event not found", "Событие не найдено")}</h2>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/events">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {tr("Back to events", "Назад к событиям")}
          </Link>
        </Button>
      </div>
    )
  }

  const mapUrl = buildMapUrl(event.location_text, event.location_lat, event.location_lon)

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 md:p-6">
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-card/85 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur dark:bg-card/75">
        <div className="flex flex-col gap-4 border-b border-border/70 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 w-fit rounded-xl text-muted-foreground hover:text-foreground">
            <Link href="/events">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {tr("Events", "События")}
            </Link>
          </Button>
            <h1 className={cn("break-words text-2xl font-semibold tracking-tight text-foreground md:text-3xl", event.status === "canceled" && "line-through opacity-60")}>
              {event.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("rounded-full text-xs", statusColors[event.status])}>
                {event.status === "planned" ? tr("planned", "запланировано") : event.status === "done" ? tr("done", "выполнено") : tr("canceled", "отменено")}
              </Badge>
              <Badge variant="outline" className={cn("rounded-full text-xs", priorityColors[String(event.priority)] || priorityColors["0"])}>
                {tr("Priority", "Приоритет")}: {event.priority}
              </Badge>
              {!event.all_day ? (
                <Badge variant="outline" className="rounded-full border-border bg-background text-xs text-muted-foreground">
                  {formatDateTime(event.start_at, profile?.timezone, locale)}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setEditorOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {tr("Edit", "Изменить")}
            </Button>
            {event.status === "planned" && (
              <>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleStatusChange("done")}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {tr("Done", "Выполнено")}
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleStatusChange("canceled")}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  {tr("Cancel", "Отменить")}
                </Button>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tr("Delete event?", "Удалить событие?")}</AlertDialogTitle>
                  <AlertDialogDescription>{tr("This action cannot be undone.", "Это действие нельзя отменить.")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr("Cancel", "Отмена")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {tr("Delete", "Удалить")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{tr("Details", "Детали")}</div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                {event.all_day ? (
                    <span className="text-foreground">{tr("All day", "Весь день")}</span>
                ) : (
                    <div className="text-foreground">
                      <p>{formatDateTime(event.start_at, profile?.timezone, locale)}</p>
                      <p className="text-muted-foreground">{formatDateTime(event.end_at, profile?.timezone, locale)}</p>
                  </div>
                )}
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                {event.location_text ? (
                  mapUrl ? (
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="break-words text-foreground hover:underline">{event.location_text}</a>
                  ) : (
                      <span className="break-words text-foreground">{event.location_text}</span>
                  )
                ) : (
                    <span className="text-muted-foreground">{tr("No location", "Локация не указана")}</span>
                )}
                </div>
              </div>
              {event.description ? (
                <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm leading-relaxed text-foreground">
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {tr("Reminders", "Напоминания")}
              </div>
              <ReminderList eventId={eventId} />
            </div>
          </aside>

          <main className="rounded-2xl border border-border/70 bg-background/70 p-3">
            <div className="mb-3 flex flex-col gap-3 px-1 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Route className="h-4 w-4" />
                {tr("Route to event", "Маршрут к событию")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableRouteModes.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant={mode === item ? "default" : "outline"}
                      className="h-8 rounded-xl px-3 text-xs"
                      onClick={() => setMode(item)}
                    >
                      {modeLabel(item, tr)}
                    </Button>
                ))}
              </div>
            </div>

            {!routeReady ? (
              <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                  {tr(
                    "Set your home location in profile and add a location to the event to build the route automatically.",
                    "Укажите место проживания в профиле и локацию события, чтобы маршрут строился автоматически.",
                  )}
                </div>
              ) : routeLoading && !preview ? (
              <div className="flex h-[480px] items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : routeError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/5 dark:text-red-200">
                  {routeError}
                </div>
              ) : preview ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
                <RoutePreviewMap
                  fromPoint={preview.from_point}
                  toPoint={preview.to_point}
                  geometryLatLon={preview.geometry_latlon}
                  geometry={preview.geometry}
                  provider={mapProvider}
                  className="h-[480px]"
                />
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full">{modeLabel(preview.mode, tr)}</Badge>
                      {routeLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-muted/50 p-3">
                        <Clock className="mb-2 h-4 w-4 text-muted-foreground" />
                      {formatDuration(preview.duration_sec, tr)}
                    </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <Ruler className="mb-2 h-4 w-4 text-muted-foreground" />
                      {formatDistance(preview.distance_m)}
                    </div>
                  </div>
                  </div>
                  {recommendations.length > 0 ? (
                    <div className="space-y-2">
                      <div className="px-1 text-xs font-semibold uppercase text-muted-foreground">{tr("Options", "Варианты")}</div>
                      {recommendations.filter((item) => availableRouteModes.includes(item.mode)).slice(0, 4).map((item, index) => (
                        <button
                          key={`${item.mode}-${index}`}
                          type="button"
                          onClick={() => setMode(item.mode)}
                          className={cn(
                            "rounded-2xl border p-3 text-left transition",
                            item.mode === mode
                              ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black"
                              : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:bg-white/[0.07]",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{modeLabel(item.mode, tr)}</span>
                            {index === 0 ? <Badge className="rounded-full bg-emerald-600 text-[10px]">{tr("Best", "Лучший")}</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs opacity-70">
                            {formatDuration(item.duration_sec, tr)} · {formatDistance(item.distance_m)}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              ) : null}
          </main>
        </div>
      </section>

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} event={event} onSaved={() => mutate()} />
    </div>
  )
}
