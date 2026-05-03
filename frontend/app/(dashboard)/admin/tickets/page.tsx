"use client"

import Link from "next/link"
import { useDeferredValue, useMemo, useState } from "react"
import { ArrowRight, Loader2, RefreshCw, Search, Ticket } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAdminSupportTickets } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { supportStatusLabel, supportSubtopicLabel, supportTopicLabel } from "@/lib/support-topics"
import type { SupportTicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | SupportTicketStatus

function formatDateTime(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function statusBadgeClass(status: SupportTicketStatus) {
  switch (status) {
    case "open":
      return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200"
    case "answered":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
    case "closed":
      return "border-slate-200 bg-white/80 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
    default:
      return "border-slate-200 bg-white/80 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
  }
}

export default function AdminTicketsPage() {
  const { tr, locale } = useI18n()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const deferredQuery = useDeferredValue(query)

  const listQuery = useAdminSupportTickets({
    q: deferredQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
    offset: 0,
  })

  const tickets = useMemo(() => {
    return [...(listQuery.data ?? [])].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
  }, [listQuery.data])

  const stats = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        acc.all += 1
        acc[ticket.status] += 1
        return acc
      },
      { all: 0, open: 0, answered: 0, closed: 0 } as Record<"all" | SupportTicketStatus, number>,
    )
  }, [tickets])

  return (
    <AdminPageShell
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
          onClick={() => void listQuery.mutate()}
          disabled={listQuery.isLoading}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", listQuery.isLoading && "animate-spin")} />
          {tr("Refresh", "Обновить")}
        </Button>
      }
    >
      <Card className="rounded-3xl border-slate-200/80 bg-gradient-to-br from-white/90 via-white/[0.78] to-slate-50/80 shadow-[0_22px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-gradient-to-br dark:from-black/35 dark:via-black/25 dark:to-black/30 dark:shadow-none">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base text-slate-950 dark:text-white">{tr("Support queue", "Очередь поддержки")}</CardTitle>
              <CardDescription className="mt-1 text-slate-500 dark:text-white/50">
                {tr(
                  "Newest tickets stay on top. Open a dedicated chat workspace to reply and close requests.",
                  "Новые тикеты сверху. Откройте отдельное рабочее окно чата, чтобы ответить и закрыть обращение.",
                )}
              </CardDescription>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto lg:min-w-[420px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-white/45">{tr("All", "Всего")}</p>
                <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{stats.all}</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 dark:border-sky-400/15 dark:bg-sky-400/5">
                <p className="text-[11px] uppercase tracking-wider text-sky-700/70 dark:text-sky-200/70">{tr("Needs reply", "Ждут ответа")}</p>
                <p className="mt-1 text-xl font-semibold text-sky-800 dark:text-sky-100">{stats.open}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 dark:border-emerald-400/15 dark:bg-emerald-400/5">
                <p className="text-[11px] uppercase tracking-wider text-emerald-700/70 dark:text-emerald-200/70">{tr("Answered", "Отвечены")}</p>
                <p className="mt-1 text-xl font-semibold text-emerald-800 dark:text-emerald-100">{stats.answered}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-white/45">{tr("Closed", "Закрыты")}</p>
                <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{stats.closed}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/35" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("Search by user, subject or topic", "Поиск по пользователю, теме или категории")}
                className="h-11 rounded-xl border-slate-200 bg-white/80 pl-10 text-slate-800 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-11 rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-800 outline-none focus:border-slate-300 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-white/30"
            >
              <option value="all" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("All statuses", "Все статусы")}</option>
              <option value="open" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Open", "Открыт")}</option>
              <option value="answered" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Answered", "Есть ответ")}</option>
              <option value="closed" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Closed", "Закрыт")}</option>
            </select>
          </div>
        </CardHeader>

        <CardContent>
          {listQuery.isLoading && !listQuery.data ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-white/[0.03]" />
              ))}
            </div>
          ) : listQuery.error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700 dark:border-red-400/20 dark:text-red-200">
              {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
                <Ticket className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-950 dark:text-white">{tr("No tickets found", "Тикеты не найдены")}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
                {tr("Change filters or search query.", "Измените фильтры или поисковый запрос.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {tickets.map((ticket) => {
                const needsReply = ticket.status === "open"
                return (
                  <Link
                    key={ticket.id}
                    href={`/admin/tickets/${ticket.id}`}
                    className="group rounded-2xl border border-slate-200 bg-white/70 p-4 transition hover:border-slate-300 hover:bg-white/90 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                        #{ticket.public_number} · {supportStatusLabel(locale, ticket.status)}
                      </Badge>
                      {needsReply ? (
                        <Badge className="rounded-full border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                          {tr("Needs reply", "Нужен ответ")}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-xs text-slate-400 dark:text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                        <Ticket className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-white">{ticket.subject}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-white/50">
                          {supportTopicLabel(locale, ticket.topic)} · {supportSubtopicLabel(locale, ticket.topic, ticket.subtopic)}
                        </p>
                        <p className="mt-2 line-clamp-1 text-[11px] text-slate-400 dark:text-white/35">
                          {ticket.user_username ? `@${ticket.user_username}` : `${tr("User ID", "ID пользователя")}: ${ticket.user_id}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-600 transition group-hover:text-slate-950 dark:text-white/70 dark:group-hover:text-white">
                      {tr("Open chat workspace", "Открыть чат")}
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminPageShell>
  )
}
