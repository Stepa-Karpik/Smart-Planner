"use client"

import Link from "next/link"
import { format } from "date-fns"
import type { CalendarEvent } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

interface EventGanttProps {
  events: CalendarEvent[]
  travelMinutes: Record<string, number>
}

const PX_PER_MINUTE = 1.1
const DAY_MINUTES = 24 * 60
const CHART_WIDTH = Math.round(DAY_MINUTES * PX_PER_MINUTE)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function minutesFromDayStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function groupByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = new Date(event.start_at).toISOString().slice(0, 10)
    const list = map.get(key) || []
    list.push(event)
    map.set(key, list)
  }
  return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
}

function formatTravel(minutes: number, tr: (en: string, ru: string) => string) {
  if (minutes < 60) return `${minutes}${tr("m", "м")}`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) {
    return `${hours}${tr("h", "ч")}`
  }
  return `${hours}${tr("h", "ч")} ${mins}${tr("m", "м")}`
}

export function EventGantt({ events, travelMinutes }: EventGanttProps) {
  const { tr } = useI18n()
  const groups = groupByDay(events)

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[980px] p-3">
        <div className="mb-2 grid grid-cols-[220px_1fr] items-center text-xs text-muted-foreground">
          <div>{tr("Event", "Событие")}</div>
          <div className="relative h-5">
            {Array.from({ length: 25 }).map((_, hour) => (
              <div
                key={hour}
                className="absolute top-0 text-[10px]"
                style={{ left: `${(hour * 60 * PX_PER_MINUTE).toFixed(2)}px` }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {groups.map(([day, dayEvents]) => (
            <div key={day} className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {format(new Date(day), "EEEE, dd LLL yyyy")}
              </div>

              {dayEvents
                .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))
                .map((event) => {
                  const start = new Date(event.start_at)
                  const end = new Date(event.end_at)
                  const startMinute = clamp(minutesFromDayStart(start), 0, DAY_MINUTES)
                  const endMinute = clamp(minutesFromDayStart(end), startMinute + 1, DAY_MINUTES)
                  const left = startMinute * PX_PER_MINUTE
                  const width = Math.max((endMinute - startMinute) * PX_PER_MINUTE, 6)

                  const travel = travelMinutes[event.id] || 0
                  const travelWidth = travel * PX_PER_MINUTE
                  const travelLeft = clamp(left - travelWidth, 0, CHART_WIDTH - 1)
                  const travelLabelLeft = clamp(travelLeft + travelWidth / 2 - 18, 0, CHART_WIDTH - 36)

                  return (
                    <div key={event.id} className="grid grid-cols-[220px_1fr] items-center gap-3">
                      <div className="truncate text-sm">
                        <Link href={`/events/${event.id}`} className="font-medium hover:underline">
                          {event.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {format(start, "HH:mm")} - {format(end, "HH:mm")}
                        </div>
                      </div>

                      <div className="relative h-10 rounded-md border bg-muted/20" style={{ width: `${CHART_WIDTH}px` }}>
                        {travel > 0 && (
                          <>
                            <div
                              className="absolute top-[6px] h-[3px] rounded bg-amber-400/90"
                              style={{ left: `${travelLeft}px`, width: `${travelWidth}px` }}
                              title={`${tr("Travel", "Путь")}: ${travel} ${tr("min", "мин")}`}
                            />
                            <div
                              className="absolute top-[0px] rounded bg-amber-100/90 px-1 text-[9px] text-amber-800"
                              style={{ left: `${travelLabelLeft}px` }}
                            >
                              {formatTravel(travel, tr)}
                            </div>
                          </>
                        )}

                        <div
                          className={`absolute top-[12px] h-5 rounded ${event.status === "done" ? "bg-emerald-500/70" : "bg-accent/80"}`}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          title={`${event.title} ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
