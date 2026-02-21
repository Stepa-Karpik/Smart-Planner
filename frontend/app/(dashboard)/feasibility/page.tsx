"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { fetchFeasibility, useProfile } from "@/lib/hooks"
import type { FeasibilityResult, RouteMode } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { formatDateTimeInTimezone, fromDateValueToUtcIso } from "@/lib/timezone"

function modeLabel(mode: RouteMode, tr: (en: string, ru: string) => string) {
  if (mode === "walking") return tr("Walking", "Пешком")
  if (mode === "driving") return tr("Driving", "Авто")
  if (mode === "public_transport") return tr("Public transport", "Общественный транспорт")
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

  useEffect(() => {
    if (profile?.default_route_mode) {
      setMode(profile.default_route_mode)
    }
  }, [profile?.default_route_mode])

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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Feasibility check", "Проверка успеваемости")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr("Detect conflicts between consecutive events considering travel time.", "Выявляет конфликты между соседними событиями с учётом времени в пути.")}
        </p>
      </div>

      <Card className="border-border/50">
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
                    <SelectItem value="walking">{modeLabel("walking", tr)}</SelectItem>
                    <SelectItem value="public_transport">{modeLabel("public_transport", tr)}</SelectItem>
                    <SelectItem value="driving">{modeLabel("driving", tr)}</SelectItem>
                    <SelectItem value="bicycle">{modeLabel("bicycle", tr)}</SelectItem>
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
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {tr("Conflicts", "Конфликты")} ({result.conflicts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tr("Event", "Событие")}</TableHead>
                      <TableHead>{tr("Mode", "Режим")}</TableHead>
                      <TableHead>{tr("Suggestion", "Рекомендация")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.conflicts.map((conflict) => (
                      <TableRow key={`${conflict.next_event_id}-${conflict.suggested_start_at}`}>
                        <TableCell className="font-medium">{conflict.next_event_title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{modeLabel(conflict.mode, tr)}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tr("Move to", "Перенести на")} {formatDateTimeInTimezone(conflict.suggested_start_at, profile?.timezone, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
