"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle, Loader2, MoveRight, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { fetchFeasibility, updateEvent, useProfile } from "@/lib/hooks"
import { routeModesForLocation } from "@/lib/route-modes"
import type { FeasibilityConflict, FeasibilityResult, RouteMode } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { formatDateTimeInTimezone, fromDateValueToUtcIso } from "@/lib/timezone"

function modeLabel(mode: RouteMode, tr: (en: string, ru: string) => string) {
  if (mode === "walking") return tr("Walking", "Пешком")
  if (mode === "driving") return tr("Driving", "Авто")
  if (mode === "public_transport") return tr("Public transport", "Общественный транспорт")
  if (mode === "metro") return tr("Metro", "Метро")
  return tr("Bicycle", "Велосипед/самокат")
}

export default function FeasibilityPage() {
  const { tr, locale } = useI18n()
  const { data: profile } = useProfile()

  const today = new Date()
  const [fromDate, setFromDate] = useState(() => today.toISOString().slice(0, 10))
  const [toDate, setToDate] = useState(() => {
    const date = new Date(today)
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  })
  const [mode, setMode] = useState<RouteMode>("public_transport")
  const [result, setResult] = useState<FeasibilityResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const availableModes = routeModesForLocation(profile?.home_location_text)

  useEffect(() => {
    if (profile?.default_route_mode) {
      setMode(profile.default_route_mode)
    }
  }, [profile?.default_route_mode])

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode("public_transport")
    }
  }, [availableModes, mode])

  async function handleCheck(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const fromIso = fromDateValueToUtcIso(fromDate, profile?.timezone) || new Date(fromDate).toISOString()
    const toIso = fromDateValueToUtcIso(toDate, profile?.timezone, { endOfDay: true }) || new Date(`${toDate}T23:59:59`).toISOString()
    const response = await fetchFeasibility(fromIso, toIso, mode)
    setLoading(false)
    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to run feasibility check", "Не удалось выполнить проверку"))
      return
    }
    setResult(response.data)
  }

  async function refreshCheck() {
    const fromIso = fromDateValueToUtcIso(fromDate, profile?.timezone) || new Date(fromDate).toISOString()
    const toIso = fromDateValueToUtcIso(toDate, profile?.timezone, { endOfDay: true }) || new Date(`${toDate}T23:59:59`).toISOString()
    const response = await fetchFeasibility(fromIso, toIso, mode)
    if (!response.error && response.data) {
      setResult(response.data)
    }
  }

  async function handleRescheduleConflict(conflict: FeasibilityConflict) {
    setActionBusy(`move-${conflict.next_event_id}`)
    const response = await updateEvent(conflict.next_event_id, {
      start_at: conflict.suggested_start_at,
      end_at: conflict.suggested_end_at,
    })
    setActionBusy(null)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event moved", "Событие перенесено"))
    await refreshCheck()
  }

  async function handleCancelConflictEvent(eventId: string | null | undefined) {
    if (!eventId) return
    setActionBusy(`cancel-${eventId}`)
    const response = await updateEvent(eventId, { status: "canceled" })
    setActionBusy(null)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event canceled", "Событие отменено"))
    await refreshCheck()
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Feasibility check", "Проверка успеваемости")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr("Detect conflicts between consecutive events considering travel time.", "Выявляет конфликты между соседними событиями с учётом времени в пути.")}
        </p>
      </div>

      <Card className="border-border/70 bg-card/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <CardContent className="pt-6">
          <form onSubmit={handleCheck} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>{tr("From", "С")}</Label>
                <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{tr("To", "По")}</Label>
                <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{tr("Transport mode", "Режим передвижения")}</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as RouteMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModes.map((item) => (
                      <SelectItem key={item} value={item}>{modeLabel(item, tr)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" size="sm" className="w-fit" disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />}
              {tr("Check", "Проверить")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="flex flex-col gap-4">
          {result.conflicts.length === 0 ? (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="flex items-center gap-3 py-4">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-foreground">{tr("No conflicts found", "Конфликтов не найдено")}</p>
                  <p className="text-xs text-muted-foreground">{tr("Your schedule is feasible for the selected period.", "В выбранном периоде расписание выполнимо.")}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/70 bg-card/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {tr("Conflicts", "Конфликты")} ({result.conflicts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-2">
                {result.conflicts.map((conflict) => (
                  <div key={`${conflict.next_event_id}-${conflict.suggested_start_at}`} className="rounded-2xl border border-border/70 bg-background/75 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <CalendarClock className="h-4 w-4 text-amber-500" />
                        {tr("Conflict pair", "Пара событий")}
                      </div>
                      <Badge variant="outline" className="rounded-full">{modeLabel(conflict.mode, tr)}</Badge>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                      <div className="rounded-xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">{tr("Previous", "Предыдущее")}</p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">{conflict.prev_event_title || tr("Unknown event", "Неизвестное событие")}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 h-8 rounded-xl text-xs"
                          disabled={!conflict.prev_event_id || actionBusy === `cancel-${conflict.prev_event_id}`}
                          onClick={() => handleCancelConflictEvent(conflict.prev_event_id)}
                        >
                          {actionBusy === `cancel-${conflict.prev_event_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          {tr("Cancel", "Отменить")}
                        </Button>
                      </div>

                      <div className="hidden items-center justify-center text-muted-foreground xl:flex">
                        <MoveRight className="h-5 w-5" />
                      </div>

                      <div className="rounded-xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">{tr("Late event", "Опаздывающее")}</p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">{conflict.next_event_title}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {tr("Move to", "Перенести на")} {formatDateTimeInTimezone(conflict.suggested_start_at, profile?.timezone, locale)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-xl text-xs"
                            disabled={actionBusy === `move-${conflict.next_event_id}`}
                            onClick={() => handleRescheduleConflict(conflict)}
                          >
                            {actionBusy === `move-${conflict.next_event_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoveRight className="h-3.5 w-3.5" />}
                            {tr("Move", "Перенести")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl text-xs"
                            disabled={actionBusy === `cancel-${conflict.next_event_id}`}
                            onClick={() => handleCancelConflictEvent(conflict.next_event_id)}
                          >
                            {actionBusy === `cancel-${conflict.next_event_id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            {tr("Cancel", "Отменить")}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                      {tr("Travel time", "Время в пути")}: {Math.round(conflict.travel_time_sec / 60)} {tr("min", "мин")}
                      {conflict.faster_mode ? ` · ${tr("Faster mode", "Быстрее")}: ${modeLabel(conflict.faster_mode, tr)}` : ""}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
