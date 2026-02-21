"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { createCalendar, createEvent, updateEvent, useCalendars, useProfile } from "@/lib/hooks"
import type { CalendarEvent, EventCreate, EventUpdate } from "@/lib/types"
import { LocationInput } from "@/components/location-input"
import { useI18n } from "@/lib/i18n"
import { fromDateTimeLocalValueToUtcIso, toDateTimeLocalValue } from "@/lib/timezone"

interface EventEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: CalendarEvent | null
  onSaved?: () => void
}

type LocationSource = "manual_text" | "geocoded" | "map_pick"

function toLocalDateTimeInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function EventEditorModal({ open, onOpenChange, event, onSaved }: EventEditorModalProps) {
  const { tr } = useI18n()
  const { data: profile } = useProfile()
  const { data: calendars, mutate: mutateCalendars } = useCalendars()
  const isEdit = !!event

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [calendarId, setCalendarId] = useState("")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [hasEndAt, setHasEndAt] = useState(true)
  const [allDay, setAllDay] = useState(false)
  const [priority, setPriority] = useState<0 | 1 | 2 | 3>(1)
  const [locationText, setLocationText] = useState("")
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLon, setLocationLon] = useState<number | null>(null)
  const [locationSource, setLocationSource] = useState<LocationSource>("manual_text")

  const [calendarCreateOpen, setCalendarCreateOpen] = useState(false)
  const [newCalendarTitle, setNewCalendarTitle] = useState("")
  const [newCalendarColor, setNewCalendarColor] = useState("#2563eb")

  const [loading, setLoading] = useState(false)
  const [creatingCalendar, setCreatingCalendar] = useState(false)

  useEffect(() => {
    if (!open) return

    if (event) {
      setTitle(event.title)
      setDescription(event.description || "")
      setCalendarId(event.calendar_id)
      setStartAt(toDateTimeLocalValue(event.start_at, profile?.timezone))
      setEndAt(toDateTimeLocalValue(event.end_at, profile?.timezone))
      setHasEndAt(true)
      setAllDay(event.all_day)
      setPriority((event.priority ?? 1) as 0 | 1 | 2 | 3)
      setLocationText(event.location_text || "")
      setLocationLat(event.location_lat ?? null)
      setLocationLon(event.location_lon ?? null)
      setLocationSource((event.location_source as LocationSource) || "manual_text")
    } else {
      const now = new Date()
      const later = new Date(now.getTime() + 60 * 60 * 1000)
      setTitle("")
      setDescription("")
      setCalendarId(calendars?.[0]?.id || "")
      setStartAt(toDateTimeLocalValue(now.toISOString(), profile?.timezone) || toLocalDateTimeInput(now))
      setEndAt(toDateTimeLocalValue(later.toISOString(), profile?.timezone) || toLocalDateTimeInput(later))
      setHasEndAt(true)
      setAllDay(false)
      setPriority(1)
      setLocationText("")
      setLocationLat(null)
      setLocationLon(null)
      setLocationSource("manual_text")
    }
  }, [open, event, calendars, profile?.timezone])

  async function handleCreateCalendar() {
    if (!newCalendarTitle.trim()) {
      toast.error(tr("Calendar title is required", "Введите название календаря"))
      return
    }

    setCreatingCalendar(true)
    const response = await createCalendar({ title: newCalendarTitle.trim(), color: newCalendarColor })
    setCreatingCalendar(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to create calendar", "Не удалось создать календарь"))
      return
    }

    await mutateCalendars()
    setCalendarId(response.data.id)
    setNewCalendarTitle("")
    setCalendarCreateOpen(false)
    toast.success(tr("Calendar created", "Календарь создан"))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const resolvedCalendarId = calendarId || calendars?.[0]?.id
    if (!resolvedCalendarId) {
      toast.error(tr("Calendar is required", "Нужно выбрать календарь"))
      return
    }

    if (!startAt) {
      toast.error(tr("Start date is required", "Нужно указать время начала"))
      return
    }

    const startIso = fromDateTimeLocalValueToUtcIso(startAt, profile?.timezone)
    const endIso = hasEndAt && endAt ? fromDateTimeLocalValueToUtcIso(endAt, profile?.timezone) || undefined : undefined
    if (!startIso) {
      toast.error(tr("Start date is required", "Нужно указать время начала"))
      return
    }

    if (hasEndAt && endIso && new Date(endIso) <= new Date(startIso)) {
      toast.error(tr("End must be later than start", "Окончание должно быть позже начала"))
      return
    }

    setLoading(true)

    const commonPayload = {
      title: title.trim(),
      description: description || undefined,
      calendar_id: resolvedCalendarId,
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      priority,
      location_text: locationText || undefined,
      location_lat: locationLat ?? undefined,
      location_lon: locationLon ?? undefined,
      location_source: locationSource,
    }

    if (isEdit && event) {
      const data: EventUpdate = commonPayload
      const response = await updateEvent(event.id, data)
      setLoading(false)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      toast.success(tr("Event updated", "Событие обновлено"))
      onOpenChange(false)
      onSaved?.()
      return
    }

    const data: EventCreate = commonPayload
    const response = await createEvent(data)
    setLoading(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event created", "Событие создано"))
    onOpenChange(false)
    onSaved?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? tr("Edit Event", "Редактировать событие") : tr("New Event", "Новое событие")}</DialogTitle>
          <DialogDescription className="sr-only">
            {tr("Fill event details and save changes.", "Заполните данные события и сохраните изменения.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-title">{tr("Title", "Название")}</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={tr("Event title", "Название события")}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="event-desc">{tr("Description", "Описание")}</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={tr("Optional description", "Описание (необязательно)")}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="event-calendar">{tr("Calendar", "Календарь")}</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setCalendarCreateOpen((v) => !v)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {tr("Add", "Добавить")}
                </Button>
              </div>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger id="event-calendar">
                  <SelectValue placeholder={tr("Select calendar", "Выберите календарь")} />
                </SelectTrigger>
                <SelectContent>
                  {calendars?.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {calendarCreateOpen && (
                <div className="rounded-md border bg-muted/30 p-2.5">
                  <div className="flex items-end gap-2">
                    <Input
                      value={newCalendarTitle}
                      onChange={(event) => setNewCalendarTitle(event.target.value)}
                      placeholder={tr("New calendar title", "Название нового календаря")}
                    />
                    <Input
                      type="color"
                      value={newCalendarColor}
                      onChange={(event) => setNewCalendarColor(event.target.value)}
                      className="h-10 w-12 p-1"
                    />
                    <Button type="button" size="sm" onClick={handleCreateCalendar} disabled={creatingCalendar}>
                      {creatingCalendar && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                      {tr("Create", "Создать")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="event-priority">{tr("Priority", "Приоритет")}</Label>
              <Select value={String(priority)} onValueChange={(value) => setPriority(Number(value) as 0 | 1 | 2 | 3)}>
                <SelectTrigger id="event-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{tr("Low", "Низкий")}</SelectItem>
                  <SelectItem value="1">{tr("Normal", "Обычный")}</SelectItem>
                  <SelectItem value="2">{tr("High", "Высокий")}</SelectItem>
                  <SelectItem value="3">{tr("Urgent", "Срочный")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Switch id="event-allday" checked={allDay} onCheckedChange={setAllDay} />
              <Label htmlFor="event-allday">{tr("All day", "Весь день")}</Label>
            </div>
            {!allDay && (
              <div className="flex items-center gap-2">
                <Switch id="event-has-end" checked={hasEndAt} onCheckedChange={setHasEndAt} />
                <Label htmlFor="event-has-end">{tr("Specify end time", "Указать время окончания")}</Label>
              </div>
            )}
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-start">{tr("Start", "Начало")}</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-end">{tr("End", "Окончание")}</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  disabled={!hasEndAt}
                  required={hasEndAt}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="event-location">{tr("Location", "Локация")}</Label>
            <LocationInput
              id="event-location"
              value={locationText}
              lat={locationLat}
              lon={locationLon}
              placeholder={tr("Type address or pick from map", "Введите адрес или выберите на карте")}
              onChange={(next) => {
                setLocationText(next.text)
                setLocationLat(next.lat)
                setLocationLon(next.lon)
                setLocationSource(next.source)
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tr("Cancel", "Отмена")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? tr("Save changes", "Сохранить") : tr("Create event", "Создать событие")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
