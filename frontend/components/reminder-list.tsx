"use client"

import { useState } from "react"
import { Bell, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { createReminder, deleteReminder, useReminders } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const statusColors: Record<string, string> = {
  scheduled: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  sent: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  canceled: "bg-muted text-muted-foreground border-border",
}

export function ReminderList({ eventId }: { eventId: string }) {
  const { tr } = useI18n()
  const { data: reminders, isLoading, mutate } = useReminders(eventId)
  const [offsetMinutes, setOffsetMinutes] = useState("15")
  const [creating, setCreating] = useState(false)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const value = parseInt(offsetMinutes, 10)
    if (Number.isNaN(value) || value < 1) {
      toast.error(tr("Enter valid minutes", "Введите корректное количество минут"))
      return
    }
    setCreating(true)
    const response = await createReminder(eventId, { offset_minutes: value })
    setCreating(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Reminder added", "Напоминание добавлено"))
    mutate()
  }

  async function handleDelete(reminderId: string) {
    const response = await deleteReminder(reminderId, eventId)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Reminder removed", "Напоминание удалено"))
    mutate()
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Bell className="h-4 w-4" />
        {tr("Reminders", "Напоминания")}
      </h3>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 rounded" />
          <Skeleton className="h-8 rounded" />
        </div>
      ) : reminders && reminders.length > 0 ? (
        <div className="flex flex-col gap-2">
          {reminders.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">
                  {item.offset_minutes} {tr("min before", "мин до события")}
                </span>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColors[item.status])}>
                  {item.status}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="sr-only">{tr("Delete reminder", "Удалить напоминание")}</span>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{tr("No reminders set.", "Напоминаний нет.")}</p>
      )}

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="offset" className="text-xs">
            {tr("Minutes before", "Минут до события")}
          </Label>
          <Input id="offset" type="number" min="1" value={offsetMinutes} onChange={(event) => setOffsetMinutes(event.target.value)} className="h-8 text-sm" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={creating} className="h-8">
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          {tr("Add", "Добавить")}
        </Button>
      </form>
    </div>
  )
}
