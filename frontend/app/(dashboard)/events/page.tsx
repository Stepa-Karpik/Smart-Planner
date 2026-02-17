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
import { fetchRoutePreview, useCalendars, useEvents, useProfile } from "@/lib/hooks"
import type { EventStatus } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

type ViewMode = "list" | "calendar" | "gantt"

function formatDateForInput(value: Date) {
  return value.toISOString().slice(0, 10)
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
    end.setDate(end.getDate() + 30)
    return formatDateForInput(end)
  })
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [travelMinutes, setTravelMinutes] = useState<Record<string, number>>({})

  const query = useMemo(
    () => ({
      from: new Date(fromDate).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString(),
      q: search || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      calendar_id: calendarFilter !== "all" ? calendarFilter : undefined,
      limit: 200,
      offset: 0,
    }),
    [calendarFilter, fromDate, search, statusFilter, toDate],
  )

  const { data: events, isLoading, mutate } = useEvents(query)

  useEffect(() => {
    if (!events || events.length < 2) {
      setTravelMinutes({})
      return
    }

    let cancelled = false
    const mode = profile?.default_route_mode || "public_transport"

    const sorted = [...events]
      .filter((item) => item.status !== "canceled")
      .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))

    const compute = async () => {
      const nextMap: Record<string, number> = {}

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const curr = sorted[i]

        if (
          prev.location_lat == null ||
          prev.location_lon == null ||
          curr.location_lat == null ||
          curr.location_lon == null
        ) {
          continue
        }

        const prevDay = prev.start_at.slice(0, 10)
        const currDay = curr.start_at.slice(0, 10)
        if (prevDay !== currDay) {
          continue
        }

        const response = await fetchRoutePreview(
          `${prev.location_lat},${prev.location_lon}`,
          `${curr.location_lat},${curr.location_lon}`,
          mode,
        )
        if (response.data?.duration_sec) {
          nextMap[curr.id] = Math.round(response.data.duration_sec / 60)
        }
      }

      if (!cancelled) {
        setTravelMinutes(nextMap)
      }
    }

    compute()
    return () => {
      cancelled = true
    }
  }, [events, profile?.default_route_mode])

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
            <EventCalendarView events={events} month={calendarMonth} onMonthChange={setCalendarMonth} />
          )}

          {viewMode === "gantt" && <EventGantt events={events} travelMinutes={travelMinutes} />}
        </>
      )}

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} onSaved={() => mutate()} />
    </div>
  )
}
