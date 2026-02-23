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
import { useCalendars, useEvents, useProfile } from "@/lib/hooks"
import type { EventStatus } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { dayKeyInTimezone, fromDateValueToUtcIso, resolveUserTimezone } from "@/lib/timezone"

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function TodayPage() {
  const { tr, locale } = useI18n()
  const { data: profile } = useProfile()
  const [editorOpen, setEditorOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all")
  const [calendarFilter, setCalendarFilter] = useState("all")

  const range = useMemo(() => {
    const now = new Date()
    const todayKey = dayKeyInTimezone(now.toISOString(), profile?.timezone) || now.toISOString().slice(0, 10)
    const from = fromDateValueToUtcIso(todayKey, profile?.timezone) || todayRange().from
    const to = fromDateValueToUtcIso(todayKey, profile?.timezone, { endOfDay: true }) || todayRange().to
    return { from, to }
  }, [profile?.timezone])

  const { data: events, isLoading, mutate } = useEvents({
    from: range.from,
    to: range.to,
    q: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    calendar_id: calendarFilter !== "all" ? calendarFilter : undefined,
  })
  const { data: calendars } = useCalendars()

  const todayLabel = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: resolveUserTimezone(profile?.timezone),
  }).format(new Date())

  const allDayEvents = events?.filter((event) => event.all_day) || []
  const timedEvents = events?.filter((event) => !event.all_day) || []

  return (
    <div className="relative mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-12 h-44 w-44 rounded-full bg-cyan-400/10 blur-[95px]" />
        <div className="absolute right-[12%] top-20 h-56 w-56 rounded-full bg-blue-500/10 blur-[110px]" />
      </div>

      <div className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{tr("Today", "Сегодня")}</h1>
          <p className="mt-1 text-sm text-white/55">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-xl border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/ai">
              <MessageSquare className="mr-1.5 h-4 w-4" />
              {tr("AI Assistant", "AI помощник")}
            </Link>
          </Button>
          <Button size="sm" className="rounded-xl bg-white text-black hover:bg-white/90" onClick={() => setEditorOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {tr("Event", "Событие")}
          </Button>
        </div>
      </div>

      <div className="relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 backdrop-blur-sm sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Search events...", "Поиск событий...")}
            className="h-9 rounded-xl border-white/15 bg-white/[0.03] pl-8 text-sm text-white placeholder:text-white/30"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EventStatus | "all")}>
          <SelectTrigger className="h-9 w-40 rounded-xl border-white/15 bg-white/[0.03] text-sm text-white">
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
          <SelectTrigger className="h-9 w-44 rounded-xl border-white/15 bg-white/[0.03] text-sm text-white">
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
            <Skeleton key={index} className="h-16 rounded-xl bg-white/10" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/25 py-20 text-center backdrop-blur-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <CalendarDays className="h-6 w-6 text-white/60" />
          </div>
          <h3 className="text-sm font-medium text-white">{tr("No events today", "Сегодня событий нет")}</h3>
          <p className="mt-1 text-sm text-white/50">{tr("Create your first event to get started.", "Создайте первое событие, чтобы начать.")}</p>
          <Button size="sm" className="mt-4 rounded-xl bg-white text-black hover:bg-white/90" onClick={() => setEditorOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {tr("New event", "Новое событие")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/45">{tr("Timeline", "Таймлайн")}</h2>
            <ScrollArea className="h-[600px] rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
              <EventTimeline events={timedEvents} />
            </ScrollArea>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
            <div className="flex flex-col gap-3">
              {allDayEvents.length > 0 && (
                <>
                  <h2 className="text-xs font-medium uppercase tracking-wider text-white/45">{tr("All day", "Весь день")}</h2>
                  {allDayEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </>
              )}

              <h2 className="text-xs font-medium uppercase tracking-wider text-white/45">
                {tr("Events", "События")} ({events.length})
              </h2>
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </div>
      )}

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} onSaved={() => mutate()} />
    </div>
  )
}

