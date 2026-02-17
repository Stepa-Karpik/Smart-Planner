"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, Check, Clock, MapPin, Navigation, Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { EventEditorModal } from "@/components/event-editor-modal"
import { ReminderList } from "@/components/reminder-list"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteEvent, updateEvent, useEvent } from "@/lib/hooks"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const statusColors: Record<string, string> = {
  planned: "bg-accent/10 text-accent border-accent/20",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildMapUrl(locationText?: string, lat?: number, lon?: number) {
  if (typeof lat === "number" && typeof lon === "number") {
    return `https://yandex.ru/maps/?ll=${lon},${lat}&z=16&pt=${lon},${lat},pm2rdm`
  }
  if (locationText) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(locationText)}`
  }
  return null
}

export default function EventDetailPage() {
  const { tr } = useI18n()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const { data: event, isLoading, mutate } = useEvent(eventId)
  const [editorOpen, setEditorOpen] = useState(false)

  async function handleStatusChange(status: "done" | "canceled") {
    const response = await updateEvent(eventId, { status })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(status === "done" ? tr("Marked as done", "Отмечено выполненным") : tr("Marked as canceled", "Отмечено отменённым"))
    mutate()
  }

  async function handleDelete() {
    const response = await deleteEvent(eventId)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(tr("Event deleted", "Событие удалено"))
    router.push("/events")
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-sm font-medium text-foreground">{tr("Event not found", "Событие не найдено")}</h2>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/events">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {tr("Back to events", "Назад к событиям")}
          </Link>
        </Button>
      </div>
    )
  }

  const mapUrl = buildMapUrl(event.location_text, event.location_lat, event.location_lon)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
        <Link href="/events">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {tr("Events", "События")}
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className={cn("text-2xl font-semibold tracking-tight text-foreground", event.status === "canceled" && "line-through opacity-60")}>{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", statusColors[event.status])}>
              {event.status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {tr("Priority", "Приоритет")}: {event.priority}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {tr("Edit", "Изменить")}
          </Button>
          {event.status === "planned" && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange("done")}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {tr("Done", "Выполнено")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange("canceled")}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                {tr("Cancel", "Отменить")}
              </Button>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tr("Delete event?", "Удалить событие?")}</AlertDialogTitle>
                <AlertDialogDescription>{tr("This action cannot be undone.", "Это действие нельзя отменить.")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tr("Cancel", "Отмена")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {tr("Delete", "Удалить")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{tr("Details", "Детали")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-2 text-muted-foreground">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              {event.all_day ? (
                <span>{tr("All day", "Весь день")}</span>
              ) : (
                <div>
                  <p>{formatDateTime(event.start_at)}</p>
                  <p>{formatDateTime(event.end_at)}</p>
                </div>
              )}
            </div>

            {event.location_text && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                    {event.location_text}
                  </a>
                ) : (
                  <span>{event.location_text}</span>
                )}
              </div>
            )}

            {event.description && (
              <>
                <Separator />
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">{event.description}</p>
              </>
            )}

            {typeof event.location_lat === "number" && typeof event.location_lon === "number" && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {event.location_lat.toFixed(4)}, {event.location_lon.toFixed(4)}
                  </span>
                  <Button asChild variant="outline" size="sm" className="ml-auto h-7 text-xs">
                    <Link href={`/routes?to=${event.location_lat},${event.location_lon}`}>{tr("Build route", "Построить маршрут")}</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="h-4 w-4" />
              {tr("Reminders", "Напоминания")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReminderList eventId={eventId} />
          </CardContent>
        </Card>
      </div>

      <EventEditorModal open={editorOpen} onOpenChange={setEditorOpen} event={event} onSaved={() => mutate()} />
    </div>
  )
}
