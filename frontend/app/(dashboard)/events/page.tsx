"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar as CalendarIcon, List, Plus, Search, TableProperties } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EventCard } from "@/components/event-card"
import { EventEditorModal } from "@/components/event-editor-modal"
import { EventCalendarView } from "@/components/event-calendar-view"
import { EventGantt } from "@/components/event-gantt"
import { fetchRoutePreview, updateEvent, useCalendars, useEvents, useProfile } from "@/lib/hooks"
import type { CalendarEvent, EventStatus } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { dayKeyInTimezone, fromDateTimeLocalValueToUtcIso, fromDateValueToUtcIso, toDateTimeLocalValue } from "@/lib/timezone"
import { toast } from "sonner"

type ViewMode = "list" | "calendar" | "gantt"
type TravelDetails = Record<string, { minutes: number; sourceTitle: string; sourceKind: "home" | "event" }>
type TravelSource =
  | { kind: "home"; title: string; value: string }
  | { kind: "event"; title: string; value: string }

function formatDateForInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

function eventPointValue(event: CalendarEvent) {
  if (event.location_lat != null && event.location_lon != null) return `${event.location_lat},${event.location_lon}`
  return event.location_text?.trim() || ""
}

function eventSpansMultipleDays(event: CalendarEvent, timezone?: string | null) {
  const startDay = dayKeyInTimezone(event.start_at, timezone)
  const endDay = dayKeyInTimezone(event.end_at, timezone)
  return Boolean(startDay && endDay && startDay !== endDay)
}

function findActiveLongEvent(events: CalendarEvent[], target: CalendarEvent, timezone?: string | null) {
  const targetStart = new Date(target.start_at).getTime()
  return events.find((event) => {
    if (event.id === target.id || event.status === "canceled" || !eventSpansMultipleDays(event, timezone)) return false
    return new Date(event.start_at).getTime() <= targetStart && new Date(event.end_at).getTime() >= targetStart && Boolean(eventPointValue(event))
  })
}

function findTravelSourceForEvent(params: {
  events: CalendarEvent[]
  event: CalendarEvent
  previousEvent?: CalendarEvent
  homeValue: string
  timezone?: string | null
  tr: (en: string, ru: string) => string
}): TravelSource | null {
  const { events, event, previousEvent, homeValue, timezone, tr } = params
  const eventDay = dayKeyInTimezone(event.start_at, timezone)
  const previousDay = previousEvent ? dayKeyInTimezone(previousEvent.start_at, timezone) : null

  if (previousEvent && previousDay === eventDay) {
    const value = eventPointValue(previousEvent)
    if (value) return { kind: "event", title: previousEvent.title, value }
  }

  const longEvent = findActiveLongEvent(events, event, timezone)
  if (longEvent) {
    return { kind: "event", title: longEvent.title, value: eventPointValue(longEvent) }
  }

  if (homeValue) {
    return { kind: "home", title: tr("Home", "Дом"), value: homeValue }
  }

  return null
}

export default function EventsPage() {
  const { tr } = useI18n()
  const { data: profile } = useProfile()
  const { data: calendars } = useCalendars()

  const [editorOpen, setEditorOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all")
  const [calendarFilter, setCalendarFilter] = useState("all")

  const today = new Date()
  const [fromDate, setFromDate] = useState(() => {
    const start = new Date(today)
    start.setDate(start.getDate() - 7)
    return formatDateForInput(start)
  })
  const [toDate, setToDate] = useState(() => {
    const end = new Date(today)
    end.setMonth(end.getMonth() + 6)
    return formatDateForInput(end)
  })
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [travelDetails, setTravelDetails] = useState<TravelDetails>({})

  const query = useMemo(
    () => {
      const fromIso = fromDateValueToUtcIso(fromDate, profile?.timezone) || new Date(fromDate).toISOString()
      const toIso = fromDateValueToUtcIso(toDate, profile?.timezone, { endOfDay: true }) || new Date(`${toDate}T23:59:59`).toISOString()
      return {
        from: fromIso,
        to: toIso,
        q: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        calendar_id: calendarFilter !== "all" ? calendarFilter : undefined,
        limit: 500,
        offset: 0,
      }
    },
    [calendarFilter, fromDate, profile?.timezone, search, statusFilter, toDate],
  )

  const { data: events, isLoading, mutate } = useEvents(query)

  async function handleCalendarMove(event: CalendarEvent, day: Date) {
    const localStart = toDateTimeLocalValue(event.start_at, profile?.timezone)
    if (!localStart) return

    const targetDay = formatDateForInput(day)
    const startTime = localStart.slice(11, 16)
    const nextStartIso = fromDateTimeLocalValueToUtcIso(`${targetDay}T${startTime}`, profile?.timezone)
    if (!nextStartIso) return

    const durationMs = new Date(event.end_at).getTime() - new Date(event.start_at).getTime()
    const nextEndIso = new Date(new Date(nextStartIso).getTime() + Math.max(durationMs, 60_000)).toISOString()

    const response = await updateEvent(event.id, {
      start_at: nextStartIso,
      end_at: nextEndIso,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event moved", "Событие перенесено"))
    mutate()
  }

  useEffect(() => {
    if (!events || events.length === 0) {
      setTravelDetails({})
      return
    }

    let cancelled = false
    const mode = profile?.default_route_mode || "public_transport"
    const homeValue =
      profile?.home_location_lat != null && profile?.home_location_lon != null
        ? `${profile.home_location_lat},${profile.home_location_lon}`
        : profile?.home_location_text?.trim() || ""

    const sorted = [...events]
      .filter((item) => item.status !== "canceled")
      .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))

    const compute = async () => {
      const nextMap: TravelDetails = {}

      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i]
        const prev = i > 0 ? sorted[i - 1] : undefined
        const toValue = eventPointValue(curr)
        if (!toValue) continue

        const source = findTravelSourceForEvent({
          events: sorted,
          event: curr,
          previousEvent: prev,
          homeValue,
          timezone: profile?.timezone,
          tr,
        })
        if (!source) continue

        const fromValue = source.kind === "home" ? source.value : source.value
        if (source.kind === "event" && source.value === toValue) continue

        const response = await fetchRoutePreview(fromValue, toValue, mode)
        if (response.data?.duration_sec) {
          nextMap[curr.id] = {
            minutes: Math.round(response.data.duration_sec / 60),
            sourceTitle: source.title,
            sourceKind: source.kind,
          }
        }
      }

      if (!cancelled) {
        setTravelDetails(nextMap)
      }
    }

    compute()
    return () => {
      cancelled = true
    }
  }, [events, profile?.default_route_mode, profile?.home_location_lat, profile?.home_location_lon, profile?.home_location_text, profile?.timezone, tr])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Events", "События")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tr("List, calendar and gantt views with travel overlays.", "Список, календарь и диаграмма Ганта с учётом времени в пути.")}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditorOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {tr("Event", "Событие")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Search by title, description, location...", "Поиск по названию, описанию, локации...")}
            className="pl-8"
          />
        </div>
        <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <Select value={calendarFilter} onValueChange={setCalendarFilter}>
          <SelectTrigger>
            <SelectValue placeholder={tr("Calendar", "Календарь")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("All calendars", "Все календари")}</SelectItem>
            {calendars?.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EventStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("All statuses", "Все статусы")}</SelectItem>
            <SelectItem value="planned">{tr("Planned", "Запланировано")}</SelectItem>
            <SelectItem value="done">{tr("Done", "Выполнено")}</SelectItem>
            <SelectItem value="canceled">{tr("Canceled", "Отменено")}</SelectItem>
          </SelectContent>
        </Select>

        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="w-fit">
          <TabsList>
            <TabsTrigger value="list">
              <List className="mr-1.5 h-3.5 w-3.5" />
              {tr("List", "Список")}
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {tr("Calendar", "Календарь")}
            </TabsTrigger>
            <TabsTrigger value="gantt">
              <TableProperties className="mr-1.5 h-3.5 w-3.5" />
              Gantt
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {tr("No events in selected filters.", "По выбранным фильтрам событий нет.")}
        </div>
      ) : (
        <>
          {viewMode === "list" && (
            <div className="flex flex-col gap-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}

          {viewMode === "calendar" && (
            <EventCalendarView
              events={events}
              calendars={calendars || []}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onEventMove={handleCalendarMove}
            />
          )}

          {viewMode === "gantt" && <EventGantt events={events} calendars={calendars || []} travelDetails={travelDetails} />}
        </>
      )}

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} onSaved={() => mutate()} />
    </div>
  )
}
