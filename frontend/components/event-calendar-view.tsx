"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useProfile } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { dayKeyInTimezone } from "@/lib/timezone"
import type { Calendar, CalendarEvent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { calendarColorForTheme, getEventTemporalStatus, readableTextForColor, translucentColor } from "@/lib/calendar-colors"

interface EventCalendarViewProps {
  events: CalendarEvent[]
  calendars: Calendar[]
  month: Date
  onMonthChange: (next: Date) => void
  onEventMove?: (event: CalendarEvent, day: Date) => void
}

function eventsForDay(events: CalendarEvent[], day: Date, timezone?: string | null) {
  const dayKey = format(day, "yyyy-MM-dd")
  return events.filter((event) => {
    const startKey = dayKeyInTimezone(event.start_at, timezone)
    const endKey = dayKeyInTimezone(event.end_at, timezone)
    if (!startKey || !endKey) return false
    return startKey <= dayKey && endKey >= dayKey && event.status !== "canceled"
  })
}

export function EventCalendarView({ events, calendars, month, onMonthChange, onEventMove }: EventCalendarViewProps) {
  const { tr } = useI18n()
  const { resolvedTheme } = useTheme()
  const { data: profile } = useProfile()
  const monthSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calendarById = useMemo(() => new Map(calendars.map((calendar) => [calendar.id, calendar])), [calendars])
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null)
  const [hoverDayKey, setHoverDayKey] = useState<string | null>(null)

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  function clearMonthSwitchTimer() {
    if (monthSwitchTimer.current) {
      clearTimeout(monthSwitchTimer.current)
      monthSwitchTimer.current = null
    }
  }

  function scheduleMonthSwitch(direction: "prev" | "next") {
    if (monthSwitchTimer.current) return
    monthSwitchTimer.current = setTimeout(() => {
      monthSwitchTimer.current = null
      onMonthChange(direction === "prev" ? subMonths(month, 1) : addMonths(month, 1))
    }, 1500)
  }

  function previewEventsForDay(dayEvents: CalendarEvent[], day: Date) {
    if (!draggedEventId || !hoverDayKey) return dayEvents
    const dayKey = format(day, "yyyy-MM-dd")
    const draggedEvent = events.find((item) => item.id === draggedEventId)
    const withoutDragged = dayEvents.filter((item) => item.id !== draggedEventId)
    if (!draggedEvent || dayKey !== hoverDayKey) return withoutDragged
    return [...withoutDragged, draggedEvent].sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
  }

  function handleDrop(dragEvent: React.DragEvent<HTMLDivElement>) {
    dragEvent.preventDefault()
    clearMonthSwitchTimer()
    const dayKey = dragEvent.currentTarget.dataset.calendarDay
    const eventId = dragEvent.dataTransfer.getData("text/plain")
    const event = events.find((item) => item.id === eventId)
    if (event && dayKey) {
      onEventMove?.(event, new Date(`${dayKey}T12:00:00`))
    }
    setDraggedEventId(null)
    setHoverDayKey(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(subMonths(month, 1))}
          onDragEnter={() => scheduleMonthSwitch("prev")}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={clearMonthSwitchTimer}
          onDrop={clearMonthSwitchTimer}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{format(month, "LLLL yyyy")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(addMonths(month, 1))}
          onDragEnter={() => scheduleMonthSwitch("next")}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={clearMonthSwitchTimer}
          onDrop={clearMonthSwitchTimer}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="px-2 py-1 text-center">
            {tr(day, day === "Mon" ? "Пн" : day === "Tue" ? "Вт" : day === "Wed" ? "Ср" : day === "Thu" ? "Чт" : day === "Fri" ? "Пт" : day === "Sat" ? "Сб" : "Вс")}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day, profile?.timezone)
          const inCurrentMonth = isSameMonth(day, month)

          return (
            <div
              key={day.toISOString()}
              data-calendar-day={format(day, "yyyy-MM-dd")}
              className={cn(
                "min-h-[128px] rounded-xl border p-2 transition-colors",
                inCurrentMonth ? "bg-card/85" : "bg-muted/25 text-muted-foreground",
                hoverDayKey === format(day, "yyyy-MM-dd") && "ring-2 ring-accent/45",
              )}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault()
                setHoverDayKey(dragEvent.currentTarget.dataset.calendarDay || null)
              }}
              onDragLeave={(dragEvent) => {
                if (!dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) setHoverDayKey(null)
              }}
              onDrop={handleDrop}
            >
              <div className="mb-1 text-xs font-medium">{format(day, "d")}</div>
              <div className="flex flex-col gap-1">
                {previewEventsForDay(dayEvents, day).slice(0, 4).map((event) => {
                  const calendar = calendarById.get(event.calendar_id)
                  const calendarColor = calendarColorForTheme(calendar, resolvedTheme)
                  const temporalStatus = getEventTemporalStatus(event)
                  const isPreview = draggedEventId === event.id && hoverDayKey === format(day, "yyyy-MM-dd")
                  return (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      draggable
                      onDragStart={(dragEvent) => {
                        dragEvent.dataTransfer.effectAllowed = "move"
                        dragEvent.dataTransfer.setData("text/plain", event.id)
                        setDraggedEventId(event.id)
                      }}
                      onDragEnd={() => {
                        clearMonthSwitchTimer()
                        setDraggedEventId(null)
                        setHoverDayKey(null)
                      }}
                      className={cn(
                        "truncate rounded-lg px-1.5 py-1 text-[11px] font-semibold shadow-sm transition hover:opacity-90",
                        isPreview && "scale-[1.02] outline outline-2 outline-offset-1 outline-accent/50",
                        temporalStatus === "past" && "opacity-60",
                      )}
                      style={{
                        backgroundColor: translucentColor(calendarColor, temporalStatus === "in_progress" ? "38" : "22"),
                        borderLeft: `3px solid ${calendarColor}`,
                        color: readableTextForColor(calendarColor) === "#ffffff" ? calendarColor : "#0f172a",
                      }}
                    >
                      {event.title}
                    </Link>
                  )
                })}
                {previewEventsForDay(dayEvents, day).length > 4 && (
                  <div className="text-[11px] text-muted-foreground">
                    +{previewEventsForDay(dayEvents, day).length - 4} {tr("more", "ещё")}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
