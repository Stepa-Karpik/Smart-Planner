"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, MessageSquare, Plus, Search } from "lucide-react"
import { EventCard } from "@/components/event-card"
import { EventEditorModal } from "@/components/event-editor-modal"
import { EventTimeline } from "@/components/event-timeline"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useCalendars, useEvents } from "@/lib/hooks"
import type { EventStatus } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function TodayPage() {
  const { tr } = useI18n()
  const [editorOpen, setEditorOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all")
  const [calendarFilter, setCalendarFilter] = useState("all")

  const range = useMemo(() => todayRange(), [])
  const { data: events, isLoading, mutate } = useEvents({
    from: range.from,
    to: range.to,
    q: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    calendar_id: calendarFilter !== "all" ? calendarFilter : undefined,
  })
  const { data: calendars } = useCalendars()

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const allDayEvents = events?.filter((event) => event.all_day) || []
  const timedEvents = events?.filter((event) => !event.all_day) || []

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Today", "Сегодня")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/ai">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              {tr("AI Assistant", "AI помощник")}
            </Link>
          </Button>
          <Button size="sm" onClick={() => setEditorOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {tr("Event", "Событие")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Search events...", "Поиск событий...")}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EventStatus | "all")}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder={tr("Status", "Статус")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("All statuses", "Все статусы")}</SelectItem>
            <SelectItem value="planned">{tr("Planned", "Запланировано")}</SelectItem>
            <SelectItem value="done">{tr("Done", "Выполнено")}</SelectItem>
            <SelectItem value="canceled">{tr("Canceled", "Отменено")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={calendarFilter} onValueChange={setCalendarFilter}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder={tr("Calendar", "Календарь")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("All calendars", "Все календари")}</SelectItem>
            {calendars?.map((calendar) => (
              <SelectItem key={calendar.id} value={calendar.id}>
                {calendar.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <CalendarDays className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">{tr("No events today", "Сегодня событий нет")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tr("Create your first event to get started.", "Создайте первое событие, чтобы начать.")}</p>
          <Button size="sm" className="mt-4" onClick={() => setEditorOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {tr("New event", "Новое событие")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Timeline", "Таймлайн")}</h2>
            <ScrollArea className="h-[600px] rounded-lg border bg-card p-4">
              <EventTimeline events={timedEvents} />
            </ScrollArea>
          </div>

          <div className="flex flex-col gap-3">
            {allDayEvents.length > 0 && (
              <>
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("All day", "Весь день")}</h2>
                {allDayEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </>
            )}
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {tr("Events", "События")} ({events.length})
            </h2>
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} onSaved={() => mutate()} />
    </div>
  )
}
