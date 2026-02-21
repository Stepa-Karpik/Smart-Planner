"use client"

import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/lib/types"
import { useProfile } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { formatTimeInTimezone, getZonedDateParts } from "@/lib/timezone"

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

  const timedEvents = events.filter((e) => !e.all_day && e.status !== "canceled")

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
        const colorClass = eventColors[i % eventColors.length]

        return (
          <a
            key={event.id}
            href={`/events/${event.id}`}
            className={cn(
              "absolute left-12 right-2 rounded-md border px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80 overflow-hidden",
              colorClass
            )}
            style={{ top, height, minHeight: 28 }}
          >
            <p className="font-medium truncate">{event.title}</p>
            {height > 36 && (
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
