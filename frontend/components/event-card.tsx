"use client"

import Link from "next/link"
import { MapPin, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"
import { useI18n } from "@/lib/i18n"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const priorityColors: Record<string, string> = {
  "3": "bg-destructive/10 text-destructive border-destructive/20",
  "2": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "1": "bg-muted text-muted-foreground border-border",
  "0": "bg-muted text-muted-foreground border-border",
}

const statusColors: Record<string, string> = {
  planned: "bg-accent/10 text-accent border-accent/20",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  canceled: "bg-muted text-muted-foreground border-border line-through",
}

function locationMapLink(event: CalendarEvent) {
  if (typeof event.location_lat === "number" && typeof event.location_lon === "number") {
    return `https://yandex.ru/maps/?ll=${event.location_lon},${event.location_lat}&z=16&pt=${event.location_lon},${event.location_lat},pm2rdm`
  }
  if (event.location_text) {
    return `https://yandex.ru/maps/?text=${encodeURIComponent(event.location_text)}`
  }
  return null
}

export function EventCard({ event }: { event: CalendarEvent }) {
  const { tr } = useI18n()
  const mapLink = locationMapLink(event)

  return (
    <div className={cn("group flex flex-col gap-2 rounded-lg border bg-card p-3", event.status === "canceled" && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/events/${event.id}`} className="min-w-0 flex-1 hover:underline">
          <h3 className={cn("truncate text-sm font-medium leading-snug text-card-foreground", event.status === "canceled" && "line-through")}>
            {event.title}
          </h3>
        </Link>
        <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", statusColors[event.status])}>
          {event.status === "planned" ? tr("planned", "запланировано") : event.status === "done" ? tr("done", "выполнено") : tr("canceled", "отменено")}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {event.all_day ? tr("All day", "Весь день") : `${formatTime(event.start_at)} - ${formatTime(event.end_at)}`}
        </span>
      </div>

      {event.location_text && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {mapLink ? (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-foreground hover:underline"
              title={tr("Show on map", "Показать на карте")}
            >
              {event.location_text}
            </a>
          ) : (
            <span className="truncate">{event.location_text}</span>
          )}

          {typeof event.location_lat === "number" && typeof event.location_lon === "number" && (
            <Link
              href={`/routes?to=${event.location_lat},${event.location_lon}`}
              className="ml-auto inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent/10"
              title={tr("Build route", "Построить маршрут")}
            >
              <Navigation className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {typeof event.priority === "number" && event.priority > 1 && (
        <Badge variant="outline" className={cn("w-fit text-[10px] px-1.5 py-0", priorityColors[String(event.priority)] || priorityColors["1"])}>
          p{event.priority}
        </Badge>
      )}
    </div>
  )
}
