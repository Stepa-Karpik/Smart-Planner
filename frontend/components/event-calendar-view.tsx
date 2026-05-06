"use client"

import Link from "next/link"
import { useMemo, useRef } from "react"
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
import type { CalendarEvent } from "@/lib/types"
import type { Calendar } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

function readableTextColor(hex?: string) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff"
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 > 170 ? "#0f172a" : "#ffffff"
}

export function EventCalendarView({ events, calendars, month, onMonthChange, onEventMove }: EventCalendarViewProps) {
  const { tr } = useI18n()
  const { data: profile } = useProfile()
  const monthSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const calendarById = useMemo(() => new Map(calendars.map((calendar) => [calendar.id, calendar])), [calendars])

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

  function handleDrop(day: Date, dragEvent: React.DragEvent<HTMLDivElement>) {
    dragEvent.preventDefault()
    clearMonthSwitchTimer()
    const eventId = dragEvent.dataTransfer.getData("text/plain")
    const event = events.find((item) => item.id === eventId)
    if (event) {
      onEventMove?.(event, day)
    }
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
              className={cn(
                "min-h-[120px] rounded-xl border p-2 transition-colors",
                inCurrentMonth ? "bg-card/85" : "bg-muted/25 text-muted-foreground",
              )}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(day, event)}
            >
              <div className="mb-1 text-xs font-medium">{format(day, "d")}</div>
              <div className="flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((event) => {
                  const calendarColor = calendarById.get(event.calendar_id)?.color || "#2563eb"
                  return (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      draggable
                      onDragStart={(dragEvent) => {
                        dragEvent.dataTransfer.effectAllowed = "move"
                        dragEvent.dataTransfer.setData("text/plain", event.id)
                      }}
                      onDragEnd={clearMonthSwitchTimer}
                      className="truncate rounded-lg px-1.5 py-1 text-[11px] font-medium shadow-sm transition hover:opacity-90"
                      style={{
                        backgroundColor: `${calendarColor}22`,
                        borderLeft: `3px solid ${calendarColor}`,
                        color: readableTextColor(calendarColor) === "#ffffff" ? calendarColor : "#0f172a",
                      }}
                    >
                      {event.title}
                    </Link>
                  )
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[11px] text-muted-foreground">
                    +{dayEvents.length - 3} {tr("more", "ещё")}
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
