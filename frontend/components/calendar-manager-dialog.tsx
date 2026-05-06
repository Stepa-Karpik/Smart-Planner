"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCalendar, deleteCalendar, updateCalendar, useCalendars } from "@/lib/hooks"
import type { Calendar } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { suggestDarkCalendarColor } from "@/lib/calendar-colors"

interface CalendarManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CalendarManagerDialog({ open, onOpenChange }: CalendarManagerDialogProps) {
  const { tr } = useI18n()
  const { data: calendars, mutate } = useCalendars()
  const [drafts, setDrafts] = useState<Record<string, Pick<Calendar, "title" | "color" | "color_dark">>>({})
  const [newTitle, setNewTitle] = useState("")
  const [newLightColor, setNewLightColor] = useState("#2563eb")
  const [newDarkColor, setNewDarkColor] = useState(suggestDarkCalendarColor("#2563eb"))
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const next: Record<string, Pick<Calendar, "title" | "color" | "color_dark">> = {}
    for (const calendar of calendars || []) {
      next[calendar.id] = {
        title: calendar.title,
        color: calendar.color,
        color_dark: calendar.color_dark || suggestDarkCalendarColor(calendar.color),
      }
    }
    setDrafts(next)
  }, [calendars])

  async function handleCreateCalendar() {
    if (!newTitle.trim()) {
      toast.error(tr("Calendar title is required", "Введите название календаря"))
      return
    }
    setCreating(true)
    const response = await createCalendar({ title: newTitle.trim(), color: newLightColor, color_dark: newDarkColor })
    setCreating(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setNewTitle("")
    setNewLightColor("#2563eb")
    setNewDarkColor(suggestDarkCalendarColor("#2563eb"))
    await mutate()
    toast.success(tr("Calendar created", "Календарь создан"))
  }

  async function handleUpdateCalendar(calendar: Calendar) {
    const draft = drafts[calendar.id]
    if (!draft?.title.trim()) {
      toast.error(tr("Calendar title is required", "Введите название календаря"))
      return
    }
    setLoadingId(calendar.id)
    const response = await updateCalendar(calendar.id, {
      title: draft.title.trim(),
      color: draft.color,
      color_dark: draft.color_dark,
    })
    setLoadingId(null)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate()
    toast.success(tr("Calendar updated", "Календарь обновлён"))
  }

  async function handleDeleteCalendar(calendar: Calendar) {
    if (calendar.is_default) return
    if (!window.confirm(tr("Delete calendar and its events?", "Удалить календарь и его события?"))) return
    setLoadingId(calendar.id)
    const response = await deleteCalendar(calendar.id)
    setLoadingId(null)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate()
    toast.success(tr("Calendar deleted", "Календарь удалён"))
  }

  function patchDraft(id: string, patch: Partial<Pick<Calendar, "title" | "color" | "color_dark">>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-3xl border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-[#080b11] dark:text-white">
        <DialogHeader>
          <DialogTitle>{tr("Calendars", "Календари")}</DialogTitle>
          <DialogDescription>{tr("Manage names and separate colors for light and dark themes.", "Настройте названия и отдельные цвета для светлой и тёмной темы.")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_92px_92px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>{tr("New calendar", "Новый календарь")}</Label>
                <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder={tr("Title", "Название")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Light", "Светлая")}</Label>
                <Input
                  type="color"
                  value={newLightColor}
                  onChange={(event) => {
                    setNewLightColor(event.target.value)
                    setNewDarkColor(suggestDarkCalendarColor(event.target.value))
                  }}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Dark", "Тёмная")}</Label>
                <Input type="color" value={newDarkColor} onChange={(event) => setNewDarkColor(event.target.value)} className="h-10" />
              </div>
              <Button type="button" onClick={handleCreateCalendar} disabled={creating} className="rounded-xl">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            {(calendars || []).map((calendar) => {
              const draft = drafts[calendar.id] || calendar
              return (
                <div key={calendar.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03] md:grid-cols-[minmax(0,1fr)_92px_92px_auto_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>{calendar.is_default ? tr("Default calendar", "Основной календарь") : tr("Calendar", "Календарь")}</Label>
                    <Input value={draft.title} onChange={(event) => patchDraft(calendar.id, { title: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tr("Light", "Светлая")}</Label>
                    <Input
                      type="color"
                      value={draft.color}
                      onChange={(event) => {
                        patchDraft(calendar.id, { color: event.target.value, color_dark: suggestDarkCalendarColor(event.target.value) })
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tr("Dark", "Тёмная")}</Label>
                    <Input type="color" value={draft.color_dark} onChange={(event) => patchDraft(calendar.id, { color_dark: event.target.value })} className="h-10" />
                  </div>
                  <Button type="button" size="icon" className="h-10 w-10 rounded-xl" onClick={() => handleUpdateCalendar(calendar)} disabled={loadingId === calendar.id}>
                    {loadingId === calendar.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-10 w-10 rounded-xl text-destructive hover:text-destructive"
                    onClick={() => handleDeleteCalendar(calendar)}
                    disabled={calendar.is_default || loadingId === calendar.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
