"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import type { Calendar, CalendarEvent } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { useProfile } from "@/lib/hooks"
import { dayKeyInTimezone, formatTimeInTimezone, getZonedDateParts, resolveUserTimezone } from "@/lib/timezone"
import { calendarColorForTheme, getEventTemporalStatus, readableTextForColor, travelLabelPlacement } from "@/lib/calendar-colors"

interface EventGanttProps {
  events: CalendarEvent[]
  calendars: Calendar[]
  travelDetails: Record<string, { minutes: number; sourceTitle: string; sourceKind: "home" | "event" }>
}

const PX_PER_MINUTE = 1.1
const DAY_MINUTES = 24 * 60
const CHART_WIDTH = Math.round(DAY_MINUTES * PX_PER_MINUTE)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function minutesFromDayStart(parts: { hour: number; minute: number }) {
  return parts.hour * 60 + parts.minute
}

interface GanttSegment {
  event: CalendarEvent
  day: string
  startMinute: number
  endMinute: number
  isContinuation: boolean
  continuesAfter: boolean
  isLongEvent: boolean
}

function parseDayKey(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date, 12, 0, 0))
}

function addDays(day: string, amount: number) {
  const next = parseDayKey(day)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function splitEventIntoDaySegments(event: CalendarEvent, timezone?: string | null): GanttSegment[] {
  const startKey = dayKeyInTimezone(event.start_at, timezone)
  const endKey = dayKeyInTimezone(event.end_at, timezone)
  const startParts = getZonedDateParts(event.start_at, timezone)
  const endParts = getZonedDateParts(event.end_at, timezone)
  if (!startKey || !endKey || !startParts || !endParts) return []

  const result: GanttSegment[] = []
  for (let day = startKey; day <= endKey; day = addDays(day, 1)) {
    const isFirst = day === startKey
    const isLast = day === endKey
    const startMinute = isFirst ? clamp(minutesFromDayStart(startParts), 0, DAY_MINUTES) : 0
    let endMinute = isLast ? clamp(minutesFromDayStart(endParts), 0, DAY_MINUTES) : DAY_MINUTES
    if (isLast && endMinute === 0 && !isFirst) endMinute = DAY_MINUTES
    if (endMinute <= startMinute) endMinute = Math.min(DAY_MINUTES, startMinute + 1)

    result.push({
      event,
      day,
      startMinute,
      endMinute,
      isContinuation: !isFirst,
      continuesAfter: !isLast,
      isLongEvent: startKey !== endKey,
    })
  }
  return result
}

interface GanttDayGroup {
  key: string
  labelDay: string
  rangeEnd?: string
  segments: GanttSegment[]
}

function groupByDay(events: CalendarEvent[], timezone?: string | null) {
  const map = new Map<string, GanttSegment[]>()
  for (const event of events) {
    if (event.status === "canceled") continue
    for (const segment of splitEventIntoDaySegments(event, timezone)) {
      const list = map.get(segment.day) || []
      list.push(segment)
      map.set(segment.day, list)
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, segments]) => ({ key: day, labelDay: day, segments }))
}

function isOnlyFullDayLongLane(group: GanttDayGroup) {
  return group.segments.length > 0 && group.segments.every((segment) => segment.isLongEvent && segment.startMinute === 0 && segment.endMinute === DAY_MINUTES)
}

function collapseLongEventSegments(groups: GanttDayGroup[]) {
  const collapsed: GanttDayGroup[] = []
  for (const group of groups) {
    const previous = collapsed[collapsed.length - 1]
    if (previous && isOnlyFullDayLongLane(previous) && isOnlyFullDayLongLane(group)) {
      const sameEvents =
        previous.segments.length === group.segments.length &&
        previous.segments.every((segment) => group.segments.some((next) => next.event.id === segment.event.id))
      if (sameEvents) {
        previous.rangeEnd = group.labelDay
        continue
      }
    }
    collapsed.push({ ...group, segments: [...group.segments] })
  }
  return collapsed
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

function colorForCalendar(calendars: Calendar[], calendarId: string, theme?: string | null) {
  return calendarColorForTheme(calendars.find((calendar) => calendar.id === calendarId), theme)
}

function fitEventTitle(title: string, width: number) {
  if (width > 150) return { text: title, size: 11 }
  if (width > 86) return { text: title, size: 10 }
  const max = Math.max(4, Math.floor(width / 7))
  return { text: title.length > max ? `${title.slice(0, Math.max(1, max - 1))}...` : title, size: 9 }
}

export function EventGantt({ events, calendars, travelDetails }: EventGanttProps) {
  const { tr, locale } = useI18n()
  const { resolvedTheme } = useTheme()
  const { data: profile } = useProfile()
  const timezone = profile?.timezone
  const groups = collapseLongEventSegments(groupByDay(events, timezone))

  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white/80 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/25 dark:shadow-none">
      <div className="min-w-[1040px] p-4">
        <div className="mb-3 grid grid-cols-[132px_1fr] items-center text-xs text-muted-foreground">
          <div>{tr("Day", "День")}</div>
          <div className="relative h-5" style={{ width: `${CHART_WIDTH}px` }}>
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
          {groups.map((group) => (
            <div key={group.key} className="grid grid-cols-[132px_1fr] gap-3">
              <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
                  day: "2-digit",
                  month: "short",
                  timeZone: resolveUserTimezone(timezone),
                }).format(new Date(`${group.labelDay}T12:00:00Z`))}
                {group.rangeEnd ? ` - ${new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", timeZone: resolveUserTimezone(timezone) }).format(new Date(`${group.rangeEnd}T12:00:00Z`))}` : ""}
              </div>

              <div
                className="relative min-h-16 overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-950/[0.03] dark:border-white/10 dark:bg-white/[0.03]"
                style={{
                  width: `${CHART_WIDTH}px`,
                  backgroundImage:
                    "linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to right, rgba(148,163,184,0.28) 1px, transparent 1px)",
                  backgroundSize: `${60 * PX_PER_MINUTE}px 100%, ${240 * PX_PER_MINUTE}px 100%`,
                }}
              >
                {group.segments
                .sort((a, b) => Number(a.isLongEvent) - Number(b.isLongEvent) || a.startMinute - b.startMinute)
                .map((segment, index) => {
                  const event = segment.event
                  const left = segment.startMinute * PX_PER_MINUTE
                  const width = Math.max((segment.endMinute - segment.startMinute) * PX_PER_MINUTE, 8)
                  const calendarColor = colorForCalendar(calendars, event.calendar_id, resolvedTheme)

                  const travelInfo = travelDetails[event.id]
                  const travel = travelInfo?.minutes || 0
                  const travelWidth = travel * PX_PER_MINUTE
                  const travelLeft = clamp(left - travelWidth, 0, CHART_WIDTH - 1)
                  const travelLabelLeft = clamp(travelLeft + travelWidth / 2 - 18, 0, CHART_WIDTH - 36)
                  const label = fitEventTitle(event.title, width)
                  const temporalStatus = getEventTemporalStatus(event)
                  const top = segment.isLongEvent ? 42 : 12 + index * 26
                  const travelLabelMode = travelLabelPlacement(travel, PX_PER_MINUTE)

                  return (
                    <div key={`${event.id}-${segment.day}`} className={segment.isLongEvent ? "long-event-lane" : ""}>
                        {travelInfo && !segment.isLongEvent && travel > 0 && (
                          <>
                            <div
                              className="absolute top-[7px] h-[4px] rounded-full bg-amber-400/90 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                              style={{ left: `${travelLeft}px`, width: `${travelWidth}px` }}
                              title={`${tr("Travel", "Путь")}: ${travel} ${tr("min", "мин")} · ${travelInfo?.sourceTitle || ""}`}
                            />
                            <div
                              className="absolute rounded bg-amber-100/90 px-1 text-[9px] text-amber-800"
                              style={{
                                top: travelLabelMode === "inside" ? "0px" : "2px",
                                left: `${travelLabelMode === "inside" ? travelLabelLeft : clamp(travelLeft + travelWidth + 4, 0, CHART_WIDTH - 36)}px`,
                              }}
                            >
                              {formatTravel(travel, tr)}
                            </div>
                          </>
                        )}

                        <Link
                          href={`/events/${event.id}`}
                          className="absolute flex items-center overflow-hidden rounded-lg px-2 font-semibold shadow-[0_10px_22px_rgba(15,23,42,0.18)] transition hover:opacity-90"
                          style={{
                            top,
                            left: `${left}px`,
                            width: `${width}px`,
                            height: segment.isLongEvent ? 6 : 22,
                            backgroundColor: event.status === "done" ? "#10b981" : calendarColor,
                            borderTopLeftRadius: segment.isContinuation ? 3 : undefined,
                            borderBottomLeftRadius: segment.isContinuation ? 3 : undefined,
                            borderTopRightRadius: segment.continuesAfter ? 3 : undefined,
                            borderBottomRightRadius: segment.continuesAfter ? 3 : undefined,
                            color: readableTextForColor(calendarColor),
                            opacity: temporalStatus === "past" ? 0.55 : segment.isContinuation ? 0.82 : 0.95,
                            fontSize: label.size,
                          }}
                          title={`${event.title} ${formatTimeInTimezone(event.start_at, timezone, locale)} - ${formatTimeInTimezone(event.end_at, timezone, locale)}`}
                        >
                          {!segment.isLongEvent ? label.text : ""}
                        </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
