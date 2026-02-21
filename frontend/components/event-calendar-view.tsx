"use client"

import Link from "next/link"
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
import { Button } from "@/components/ui/button"

interface EventCalendarViewProps {
  events: CalendarEvent[]
  month: Date
  onMonthChange: (next: Date) => void
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

export function EventCalendarView({ events, month, onMonthChange }: EventCalendarViewProps) {
  const { tr } = useI18n()
  const { data: profile } = useProfile()

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{format(month, "LLLL yyyy")}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(addMonths(month, 1))}>
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
              className={`min-h-[120px] rounded-md border p-2 ${inCurrentMonth ? "bg-card" : "bg-muted/25 text-muted-foreground"}`}
            >
              <div className="mb-1 text-xs font-medium">{format(day, "d")}</div>
              <div className="flex flex-col gap-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="truncate rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/20"
                  >
                    {event.title}
                  </Link>
                ))}
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