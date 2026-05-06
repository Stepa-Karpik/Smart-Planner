"use client"

import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/lib/types"
import { useProfile } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { dayKeyInTimezone, formatTimeInTimezone, fromDateValueToUtcIso, getZonedDateParts } from "@/lib/timezone"
import { getEventTemporalStatus } from "@/lib/calendar-colors"

const HOUR_HEIGHT = 60 // px per hour
const START_HOUR = 7
const END_HOUR = 22

function formatTime(iso: string, timezone?: string | null, locale?: string | null) {
  return formatTimeInTimezone(iso, timezone, locale)
}

function getPosition(iso: string, timezone?: string | null) {
  const parts = getZonedDateParts(iso, timezone)
  if (!parts) return 0
  const hours = parts.hour + parts.minute / 60
  return Math.max(0, (hours - START_HOUR) * HOUR_HEIGHT)
}

function getDuration(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  return Math.max(HOUR_HEIGHT * 0.5, diffHours * HOUR_HEIGHT)
}

function splitEventForTimelineDay(event: CalendarEvent, dayKey: string, timezone?: string | null) {
  const dayStart = fromDateValueToUtcIso(dayKey, timezone)
  const dayEnd = fromDateValueToUtcIso(dayKey, timezone, { endOfDay: true })
  if (!dayStart || !dayEnd) return null

  const startMs = Math.max(new Date(event.start_at).getTime(), new Date(dayStart).getTime())
  const endMs = Math.min(new Date(event.end_at).getTime(), new Date(dayEnd).getTime())
  if (endMs <= startMs) return null

  const startDay = dayKeyInTimezone(event.start_at, timezone)
  const endDay = dayKeyInTimezone(event.end_at, timezone)
  const isLongEvent = Boolean(startDay && endDay && startDay !== endDay)
  return {
    ...event,
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    isLongEvent,
  }
}

const eventColors = [
  "bg-accent/15 border-accent/30 text-accent",
  "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400",
  "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-400",
]

export function EventTimeline({ events }: { events: CalendarEvent[] }) {
  const { data: profile } = useProfile()
  const { locale } = useI18n()
  const timezone = profile?.timezone
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  // Now indicator
  const nowParts = getZonedDateParts(new Date().toISOString(), timezone)
  const nowHours = nowParts ? nowParts.hour + nowParts.minute / 60 : 0
  const showNow = nowHours >= START_HOUR && nowHours <= END_HOUR
  const nowTop = (nowHours - START_HOUR) * HOUR_HEIGHT

  const todayKey = dayKeyInTimezone(new Date().toISOString(), timezone)
  const timedEvents = todayKey
    ? events
        .filter((e) => !e.all_day && e.status !== "canceled")
        .map((event) => splitEventForTimelineDay(event, todayKey, timezone))
        .filter((event): event is CalendarEvent & { isLongEvent: boolean } => Boolean(event))
    : []

  return (
    <div className="relative" style={{ height: totalHeight }}>
      {/* Hour grid */}
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-border/50"
          style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
        >
          <span className="absolute -top-2.5 left-0 text-[10px] font-medium text-muted-foreground tabular-nums w-10 text-right pr-3">
            {String(hour).padStart(2, "0")}:00
          </span>
        </div>
      ))}

      {/* Now indicator */}
      {showNow && (
        <div
          className="absolute left-10 right-0 z-10 flex items-center"
          style={{ top: nowTop }}
        >
          <div className="h-2 w-2 rounded-full bg-destructive" />
          <div className="flex-1 h-px bg-destructive/60" />
        </div>
      )}

      {/* Events */}
      {timedEvents.map((event, i) => {
        const top = getPosition(event.start_at, timezone)
        const height = getDuration(event.start_at, event.end_at)
        const colorClass = event.isLongEvent ? "bg-slate-500/10 border-slate-400/40 text-slate-700 dark:text-white/70" : eventColors[i % eventColors.length]
        const temporalStatus = getEventTemporalStatus(event)

        return (
          <a
            key={event.id}
            href={`/events/${event.id}`}
            className={cn(
              "absolute left-12 right-2 rounded-md border px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 overflow-hidden",
              colorClass,
              event.isLongEvent && "border-dashed",
              temporalStatus === "past" && "opacity-60",
            )}
            style={{ top, height: event.isLongEvent ? Math.max(height, 18) : height, minHeight: event.isLongEvent ? 18 : 28 }}
          >
            <p className={cn("font-medium truncate", event.isLongEvent && "text-[10px]")}>{event.title}</p>
            {height > 36 && !event.isLongEvent && (
              <p className="opacity-70 text-[10px]">
                {formatTime(event.start_at, timezone, locale)} - {formatTime(event.end_at, timezone, locale)}
              </p>
            )}
          </a>
        )
      })}
    </div>
  )
}
