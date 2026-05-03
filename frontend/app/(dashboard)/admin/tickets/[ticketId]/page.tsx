"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2, MessageSquare, RefreshCw, Search, Send, UserRound } from "lucide-react"
import { toast } from "sonner"
import { TicketChatMessage } from "@/components/support/ticket-chat-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function statusBadgeClass(status: SupportTicketStatus) {
  switch (status) {
    case "open":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200"
    case "answered":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
    case "closed":
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
    default:
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
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
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const listQuery = useAdminSupportTickets({
    q: deferredQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
    offset: 0,
  })
  const detailQuery = useAdminSupportTicket(ticketIdParam)
  const detail = detailQuery.data

  const tickets = useMemo(() => {
    return [...(listQuery.data ?? [])].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
  }, [listQuery.data])

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

  useEffect(() => {
    const textarea = replyTextareaRef.current
    if (!textarea) return
    textarea.style.height = "0px"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }, [replyText])

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

  function showUserTickets() {
    if (!detail) return
    setStatusFilter("all")
    setQuery(detail.user_username || detail.user_id)
  }

  return (
    <div className="relative min-h-full">
      <div className="relative mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:p-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-3xl border-slate-200/80 bg-white/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-white/10 dark:bg-black/30 xl:h-[calc(100svh-8rem)]">
          <CardHeader className="gap-3 pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm text-slate-950 dark:text-white">{tr("Queue", "Очередь")}</CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                  onClick={() => void Promise.all([listQuery.mutate(), detailQuery.mutate()])}
                  title={tr("Refresh", "Обновить")}
                >
                  <RefreshCw className={cn("h-4 w-4", (listQuery.isLoading || detailQuery.isLoading) && "animate-spin")} />
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                  title={tr("Back to tickets", "К списку тикетов")}
                >
                  <Link href="/admin/tickets">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/35" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tr("Search by user, subject or topic", "Поиск по пользователю, теме или категории")}
                  className="h-10 rounded-xl border-slate-200 bg-white pl-9 text-slate-950 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/35"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-300 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-white/30"
              >
                <option value="all" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("All statuses", "Все статусы")}</option>
                <option value="open" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Open", "Открыт")}</option>
                <option value="answered" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Answered", "Есть ответ")}</option>
                <option value="closed" className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">{tr("Closed", "Закрыт")}</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-8.5rem)] p-3 pt-0">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-2">
                {listQuery.isLoading && !listQuery.data ? (
                  Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-white/[0.03]" />)
                ) : listQuery.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/5 dark:text-red-200">
                    {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/50">
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
                            ? "border-slate-950/15 bg-slate-950/[0.06] dark:border-white/20 dark:bg-white/[0.08]"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" /> : null}
                            <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                              {supportStatusLabel(locale, ticket.status)}
                            </Badge>
                            {needsReply ? (
                              <Badge className="rounded-full border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                                {tr("Reply", "Ответ")}
                              </Badge>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-400 dark:text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                        </div>
                        <p className="line-clamp-1 text-sm font-medium text-slate-950 dark:text-white">{ticket.subject}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-white/45">
                          {ticket.user_username ? `@${ticket.user_username}` : ticket.user_id.slice(0, 8)} · {supportTopicLabel(locale, ticket.topic)}
                        </p>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex min-h-[70svh] flex-col rounded-3xl border-slate-200/80 bg-white/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-white/10 dark:bg-black/30 xl:h-[calc(100svh-8rem)]">
          <CardHeader className="border-b border-slate-200/70 pb-3 dark:border-white/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <CardTitle className="line-clamp-1 text-base text-slate-950 dark:text-white">
                  {detail ? detail.subject : tr("Ticket chat", "Чат тикета")}
                </CardTitle>
                {detail ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-white/55">
                    <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(detail.status))}>{supportStatusLabel(locale, detail.status)}</Badge>
                    <span>{supportTopicLabel(locale, detail.topic)}</span>
                    <span className="text-slate-300 dark:text-white/25">•</span>
                    <span>{supportSubtopicLabel(locale, detail.topic, detail.subtopic)}</span>
                    <span className="text-slate-300 dark:text-white/25">•</span>
                    <span>{formatDateTime(detail.created_at, locale)}</span>
                  </div>
                ) : null}
              </div>
              {detail ? (
                <div className="flex max-w-full flex-wrap items-center justify-start gap-2 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={showUserTickets}
                  >
                    <UserRound className="mr-1.5 h-4 w-4" />
                    {tr("Tickets", "Тикеты")} {detail.user_username ? `@${detail.user_username}` : detail.user_id.slice(0, 8)}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCloseTicket}
                    disabled={closing || detail.status === "closed"}
                    className="h-9 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {closing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                    {detail.status === "closed" ? tr("Closed", "Закрыт") : tr("Close ticket", "Закрыть тикет")}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            {detailQuery.isLoading && !detailQuery.data ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-200/70 dark:border-white/10 dark:bg-white/[0.03]" />)}
              </div>
            ) : detailQuery.error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/5 dark:text-red-200">
                {tr("Failed to load ticket details", "Не удалось загрузить детали тикета")}
              </div>
            ) : detail ? (
              <>
                <ScrollArea className="min-h-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/75 p-2.5 pr-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="space-y-2">
                    {detail.messages.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-slate-500 dark:text-white/50">{tr("No messages yet", "Сообщений пока нет")}</div>
                    ) : (
                      detail.messages.map((message) => (
                        <TicketChatMessage key={message.id} scope="admin" ticketId={detail.id} message={message} locale={locale} viewerRole="admin" />
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
                  <div className="flex items-end gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 dark:text-white/35">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <Textarea
                      ref={replyTextareaRef}
                      rows={1}
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder={detail.status === "closed" ? tr("Ticket closed", "Тикет закрыт") : tr("Message", "Сообщение")}
                      className="max-h-36 min-h-10 resize-none rounded-xl border-0 bg-transparent px-1 py-2.5 text-slate-950 shadow-none outline-none placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-white dark:placeholder:text-white/35"
                      disabled={detail.status === "closed"}
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl"
                      onClick={handleReply}
                      disabled={sendingReply || detail.status === "closed" || !replyText.trim()}
                      title={tr("Send reply", "Отправить ответ")}
                    >
                      {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {detail.status === "closed" ? (
                    <p className="px-2 pt-2 text-xs text-slate-500 dark:text-white/45">{tr("Closed tickets are read-only", "Закрытые тикеты доступны только для чтения")}</p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-sm font-medium text-slate-950 dark:text-white">{tr("Ticket not found", "Тикет не найден")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
