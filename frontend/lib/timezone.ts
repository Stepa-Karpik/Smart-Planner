const DEFAULT_USER_TIMEZONE = "Europe/Moscow"

function normalizeLocale(locale?: string | null): string {
  return locale === "ru" ? "ru-RU" : "en-US"
}

export function resolveUserTimezone(timezone?: string | null): string {
  if (typeof timezone === "string" && timezone.trim()) {
    return timezone.trim()
  }
  return DEFAULT_USER_TIMEZONE
}

function makeFormatter(
  locale: string | null | undefined,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    ...options,
    timeZone: resolveUserTimezone(timezone),
  })
}

export function formatTimeInTimezone(iso: string, timezone?: string | null, locale?: string | null): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return makeFormatter(locale, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function formatDateTimeInTimezone(iso: string, timezone?: string | null, locale?: string | null): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return makeFormatter(locale, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export function getZonedDateParts(
  iso: string,
  timezone?: string | null,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const parts = makeFormatter("en-US", timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const byType = new Map<string, string>()
  for (const part of parts) {
    if (part.type === "literal") continue
    byType.set(part.type, part.value)
  }

  const year = Number(byType.get("year"))
  const month = Number(byType.get("month"))
  const day = Number(byType.get("day"))
  const hour = Number(byType.get("hour"))
  const minute = Number(byType.get("minute"))
  if ([year, month, day, hour, minute].some((item) => Number.isNaN(item))) {
    return null
  }
  return { year, month, day, hour, minute }
}

export function dayKeyInTimezone(iso: string, timezone?: string | null): string | null {
  const parts = getZonedDateParts(iso, timezone)
  if (!parts) return null
  const mm = String(parts.month).padStart(2, "0")
  const dd = String(parts.day).padStart(2, "0")
  return `${parts.year}-${mm}-${dd}`
}

function localValueToParts(value: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  if ([year, month, day, hour, minute].some((item) => Number.isNaN(item))) return null
  return { year, month, day, hour, minute }
}

function toEpochMinute(parts: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) / 60000)
}

export function toDateTimeLocalValue(iso: string, timezone?: string | null): string {
  const parts = getZonedDateParts(iso, timezone)
  if (!parts) return ""
  const mm = String(parts.month).padStart(2, "0")
  const dd = String(parts.day).padStart(2, "0")
  const hh = String(parts.hour).padStart(2, "0")
  const min = String(parts.minute).padStart(2, "0")
  return `${parts.year}-${mm}-${dd}T${hh}:${min}`
}

export function fromDateTimeLocalValueToUtcIso(value: string, timezone?: string | null): string | null {
  const desired = localValueToParts(value)
  if (!desired) return null
  const tz = resolveUserTimezone(timezone)
  const desiredEpochMinute = toEpochMinute(desired)

  let guessMs = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute)
  for (let i = 0; i < 3; i++) {
    const actual = getZonedDateParts(new Date(guessMs).toISOString(), tz)
    if (!actual) break
    const actualEpochMinute = toEpochMinute(actual)
    const deltaMinutes = desiredEpochMinute - actualEpochMinute
    if (deltaMinutes === 0) break
    guessMs += deltaMinutes * 60 * 1000
  }
  return new Date(guessMs).toISOString()
}

export function fromDateValueToUtcIso(
  value: string,
  timezone?: string | null,
  options?: { endOfDay?: boolean },
): string | null {
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const suffix = options?.endOfDay ? "T23:59" : "T00:00"
  return fromDateTimeLocalValueToUtcIso(`${normalized}${suffix}`, timezone)
}
