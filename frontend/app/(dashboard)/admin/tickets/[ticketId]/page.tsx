"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2, MessageSquare, RefreshCw, Search, Send, Ticket } from "lucide-react"
import { toast } from "sonner"
import { TicketChatMessage } from "@/components/support/ticket-chat-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { closeAdminSupportTicketById, replyToAdminSupportTicket, useAdminSupportTicket, useAdminSupportTickets } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { supportStatusLabel, supportSubtopicLabel, supportTopicLabel } from "@/lib/support-topics"
import type { SupportTicket, SupportTicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | SupportTicketStatus

type SeenTicketMap = Record<string, string>

const ADMIN_TICKET_SEEN_KEY = "admin_support_ticket_seen_updates_v1"

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
      return "border-sky-400/30 bg-sky-400/10 text-sky-200"
    case "answered":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    case "closed":
      return "border-white/15 bg-white/5 text-white/70"
    default:
      return "border-white/15 bg-white/5 text-white/70"
  }
}

function readSeenMap(): SeenTicketMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(ADMIN_TICKET_SEEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const result: SeenTicketMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

function writeSeenMap(next: SeenTicketMap) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ADMIN_TICKET_SEEN_KEY, JSON.stringify(next))
}

function isTicketUnread(ticket: SupportTicket, seenMap: SeenTicketMap) {
  const seenAt = seenMap[ticket.id]
  if (!seenAt) return true
  return +new Date(ticket.updated_at) > +new Date(seenAt)
}

export default function AdminTicketWorkspacePage() {
  const { tr, locale } = useI18n()
  const router = useRouter()
  const params = useParams<{ ticketId: string }>()
  const ticketIdParam = Array.isArray(params?.ticketId) ? params.ticketId[0] : params?.ticketId

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const [closing, setClosing] = useState(false)
  const [seenMap, setSeenMap] = useState<SeenTicketMap>({})

  const deferredQuery = useDeferredValue(query)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const listQuery = useAdminSupportTickets({
    q: deferredQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
    offset: 0,
  })
  const tickets = useMemo(() => {
    return [...(listQuery.data ?? [])].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
  }, [listQuery.data])

  const detailQuery = useAdminSupportTicket(ticketIdParam)
  const detail = detailQuery.data

  useEffect(() => {
    setSeenMap(readSeenMap())
  }, [])

  useEffect(() => {
    if (!detail?.id || !detail.updated_at) return
    setSeenMap((prev) => {
      const prevSeen = prev[detail.id]
      if (prevSeen && +new Date(prevSeen) >= +new Date(detail.updated_at)) return prev
      const next = { ...prev, [detail.id]: detail.updated_at }
      writeSeenMap(next)
      return next
    })
  }, [detail?.id, detail?.updated_at])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [detail?.id, detail?.messages.length])

  const stats = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        acc.all += 1
        acc[ticket.status] += 1
        if (isTicketUnread(ticket, seenMap)) acc.unread += 1
        if (ticket.status === "open") acc.needsReply += 1
        return acc
      },
      { all: 0, unread: 0, needsReply: 0, open: 0, answered: 0, closed: 0 } as Record<
        "all" | "unread" | "needsReply" | SupportTicketStatus,
        number
      >,
    )
  }, [tickets, seenMap])

  async function handleReply() {
    if (!ticketIdParam) return
    const message = replyText.trim()
    if (!message) {
      toast.error(tr("Reply message is required", "Текст ответа обязателен"))
      return
    }
    if (detail?.status === "closed") {
      toast.error(tr("Ticket is closed", "Тикет закрыт"))
      return
    }

    setSendingReply(true)
    const response = await replyToAdminSupportTicket(ticketIdParam, message)
    setSendingReply(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to send reply", "Не удалось отправить ответ"))
      return
    }

    setReplyText("")
    setSeenMap((prev) => {
      const next = { ...prev, [response.data!.id]: response.data!.updated_at }
      writeSeenMap(next)
      return next
    })

    toast.success(tr("Reply sent", "Ответ отправлен"))
    await Promise.all([listQuery.mutate(), detailQuery.mutate()])
  }

  async function handleCloseTicket() {
    if (!ticketIdParam) return
    setClosing(true)
    const response = await closeAdminSupportTicketById(ticketIdParam)
    setClosing(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to close ticket", "Не удалось закрыть тикет"))
      return
    }

    setSeenMap((prev) => {
      const next = { ...prev, [response.data!.id]: response.data!.updated_at }
      writeSeenMap(next)
      return next
    })

    toast.success(tr("Ticket closed", "Тикет закрыт"))
    await Promise.all([listQuery.mutate(), detailQuery.mutate()])
  }

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[-4rem] h-64 w-64 rounded-full bg-sky-400/10 blur-[100px]" />
        <div className="absolute right-[10%] top-[8rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute bottom-[6%] left-[45%] h-60 w-60 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
        <Card className="rounded-3xl border-white/10 bg-gradient-to-br from-black/35 via-black/25 to-black/30 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-sm">
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                <Ticket className="mr-1.5 h-3.5 w-3.5" />
                {tr("Ticket Workspace", "Рабочее окно тикета")}
              </Badge>
              <div>
                <CardTitle className="text-2xl tracking-tight text-white">
                  {detail ? `${tr("Ticket", "Тикет")} #${detail.public_number}` : tr("Tickets", "Тикеты")}
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-white/55">
                  {detail
                    ? detail.subject
                    : tr("Dedicated chat screen with queue on the left.", "Отдельный экран чата с очередью слева.")}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/80">
                {tr("Unread", "Непрочитанные")}: {stats.unread}
              </Badge>
              <Badge className="rounded-full border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-200">
                {tr("Needs reply", "Ждут ответа")}: {stats.needsReply}
              </Badge>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/admin/tickets">
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  {tr("Queue", "Очередь")}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => void Promise.all([listQuery.mutate(), detailQuery.mutate()])}
                disabled={listQuery.isLoading || detailQuery.isLoading}
              >
                <RefreshCw className={cn("mr-1.5 h-4 w-4", (listQuery.isLoading || detailQuery.isLoading) && "animate-spin")} />
                {tr("Refresh", "Обновить")}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-3xl border-white/10 bg-black/30 backdrop-blur-sm xl:h-[calc(100svh-15.5rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">{tr("Queue", "Очередь")}</CardTitle>
              <CardDescription className="text-white/45">
                {tr("Sorted by latest activity. Unread and unanswered are highlighted.", "Отсортировано по последней активности. Непрочитанные и без ответа подсвечены.")}
              </CardDescription>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={tr("Search by subject, topic or subtopic", "Поиск по теме, категории или подкатегории")}
                    className="h-10 rounded-xl border-white/15 bg-white/5 pl-10 text-white placeholder:text-white/30"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
                >
                  <option value="all" className="bg-[#0b0f17]">{tr("All statuses", "Все статусы")}</option>
                  <option value="open" className="bg-[#0b0f17]">{tr("Open", "Открыт")}</option>
                  <option value="answered" className="bg-[#0b0f17]">{tr("Answered", "Есть ответ")}</option>
                  <option value="closed" className="bg-[#0b0f17]">{tr("Closed", "Закрыт")}</option>
                </select>
              </div>
            </CardHeader>

            <CardContent className="h-[calc(100%-12.5rem)] p-3 pt-0">
              <ScrollArea className="h-full pr-2">
                <div className="space-y-2">
                  {listQuery.isLoading && !listQuery.data ? (
                    Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />)
                  ) : listQuery.error ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-3 text-sm text-red-200">
                      {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                      {tr("No tickets found", "Тикеты не найдены")}
                    </div>
                  ) : (
                    tickets.map((ticket) => {
                      const active = ticket.id === ticketIdParam
                      const unread = isTicketUnread(ticket, seenMap)
                      const needsReply = ticket.status === "open"
                      return (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => router.push(`/admin/tickets/${ticket.id}`)}
                          className={cn(
                            "w-full rounded-2xl border p-3 text-left transition",
                            active
                              ? "border-white/20 bg-white/[0.09] shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                              : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            {unread ? <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" /> : null}
                            <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                              #{ticket.public_number}
                            </Badge>
                            {unread ? (
                              <Badge className="rounded-full border-cyan-300/20 bg-cyan-300/10 text-[10px] text-cyan-100">
                                {tr("Unread", "Непрочитан")}
                              </Badge>
                            ) : null}
                            {needsReply ? (
                              <Badge className="rounded-full border-amber-400/20 bg-amber-400/10 text-[10px] text-amber-200">
                                {tr("Needs reply", "Без ответа")}
                              </Badge>
                            ) : null}
                            <span className="ml-auto text-[11px] text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                          </div>

                          <p className="line-clamp-1 text-sm font-semibold text-white">{ticket.subject}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-white/45">
                            {supportTopicLabel(locale, ticket.topic)} · {supportSubtopicLabel(locale, ticket.topic, ticket.subtopic)}
                          </p>
                          <p className="mt-1 line-clamp-1 text-[11px] text-white/35">
                            {supportStatusLabel(locale, ticket.status)} · {ticket.user_id}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex min-h-[62svh] flex-col rounded-3xl border-white/10 bg-black/30 backdrop-blur-sm xl:h-[calc(100svh-15.5rem)]">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-base text-white">
                    {detail ? `${tr("Ticket", "Тикет")} #${detail.public_number}` : tr("Ticket chat", "Чат тикета")}
                  </CardTitle>
                  <CardDescription className="mt-1 text-white/45">
                    {detail ? detail.subject : tr("Loading ticket details...", "Загрузка деталей тикета...")}
                  </CardDescription>
                </div>
                {detail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(detail.status))}>{supportStatusLabel(locale, detail.status)}</Badge>
                    <Badge className="rounded-full border-white/15 bg-white/5 text-[10px] text-white/70">
                      {tr("User", "Пользователь")}: {detail.user_id.slice(0, 8)}…
                    </Badge>
                    <Badge className="rounded-full border-white/15 bg-white/5 text-[10px] text-white/70">
                      {formatDateTime(detail.updated_at, locale)}
                    </Badge>
                  </div>
                ) : null}
              </div>

              {detail ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/55">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{supportTopicLabel(locale, detail.topic)}</span>
                    <span className="text-white/25">•</span>
                    <span>{supportSubtopicLabel(locale, detail.topic, detail.subtopic)}</span>
                    <span className="text-white/25">•</span>
                    <span>{tr("Created", "Создан")}: {formatDateTime(detail.created_at, locale)}</span>
                  </div>
                </div>
              ) : null}
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              {detailQuery.isLoading && !detailQuery.data ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />)}
                </div>
              ) : detailQuery.error ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
                  {tr("Failed to load ticket details", "Не удалось загрузить детали тикета")}
                </div>
              ) : detail ? (
                <>
                  <ScrollArea className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 pr-3">
                    <div className="space-y-2">
                      {detail.messages.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-white/55">{tr("No messages yet", "Сообщений пока нет")}</div>
                      ) : (
                        detail.messages.map((message) => (
                          <TicketChatMessage key={message.id} scope="admin" ticketId={detail.id} message={message} locale={locale} viewerRole="admin" />
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="space-y-2">
                      <Label htmlFor="admin-ticket-reply" className="text-white/80">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          {tr("Reply to user", "Ответ пользователю")}
                        </div>
                      </Label>
                      <Textarea
                        id="admin-ticket-reply"
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder={tr(
                          "Write a reply. Line breaks will be preserved.",
                          "Напишите ответ. Переносы строк будут сохранены.",
                        )}
                        className="min-h-[120px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                        disabled={detail.status === "closed"}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={handleReply} disabled={sendingReply || detail.status === "closed"} className="rounded-xl">
                        {sendingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {tr("Send reply", "Отправить ответ")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseTicket}
                        disabled={closing || detail.status === "closed"}
                        className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      >
                        {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {detail.status === "closed" ? tr("Closed", "Закрыт") : tr("Close ticket", "Закрыть тикет")}
                      </Button>
                      {detail.status === "closed" ? (
                        <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/70">
                          {tr("Read-only", "Только чтение")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
                  {tr("Ticket not found", "Тикет не найден")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
