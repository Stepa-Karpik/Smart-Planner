import type { CalendarEvent, EventStatus } from "@/lib/types"

export type TemporalStatus = EventStatus | "in_progress" | "past"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function parseHex(hex: string) {
  const normalized = hex.trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return { r: 37, g: 99, b: 235 }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mix(hex: string, target: "#000000" | "#ffffff", amount: number) {
  const source = parseHex(hex)
  const dest = target === "#ffffff" ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }
  return rgbToHex(
    source.r + (dest.r - source.r) * amount,
    source.g + (dest.g - source.g) * amount,
    source.b + (dest.b - source.b) * amount,
  )
}

export function colorLuminance(hex: string) {
  const { r, g, b } = parseHex(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function suggestDarkCalendarColor(lightColor: string) {
  return colorLuminance(lightColor) < 0.35 ? mix(lightColor, "#ffffff", 0.48) : mix(lightColor, "#ffffff", 0.16)
}

export function calendarColorForTheme(calendar: { color: string; color_dark?: string | null } | undefined, theme?: string | null) {
  if (!calendar) return "#2563eb"
  return theme === "dark" ? calendar.color_dark || suggestDarkCalendarColor(calendar.color) : calendar.color
}

export function readableTextForColor(hex: string) {
  return colorLuminance(hex) > 0.58 ? "#0f172a" : "#ffffff"
}

export function translucentColor(hex: string, alphaHex = "22") {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alphaHex}` : `#2563eb${alphaHex}`
}

export function travelLabelPlacement(minutes: number, pxPerMinute: number) {
  const width = minutes * pxPerMinute
  return width < 38 ? "outside" : "inside"
}

export function getEventTemporalStatus(event: CalendarEvent, now = new Date()): TemporalStatus {
  if (event.status === "canceled" || event.status === "done") return event.status
  const start = new Date(event.start_at).getTime()
  const end = new Date(event.end_at).getTime()
  const current = now.getTime()
  if (start <= current && current <= end) return "in_progress"
  if (end < current) return "past"
  return "planned"
}

export function eventStatusLabel(status: TemporalStatus, tr: (en: string, ru: string) => string) {
  if (status === "in_progress") return tr("In progress", "В процессе")
  if (status === "past") return tr("Past", "Прошло")
  if (status === "done") return tr("Done", "Выполнено")
  if (status === "canceled") return tr("Canceled", "Отменено")
  return tr("Planned", "Запланировано")
}
