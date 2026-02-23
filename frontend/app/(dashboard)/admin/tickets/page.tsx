"use client"

import { useDeferredValue, useEffect, useState } from "react"
import { CheckCircle2, Loader2, MessageSquare, RefreshCw, Send, Ticket } from "lucide-react"
import { toast } from "sonner"
import { TicketChatMessage } from "@/components/support/ticket-chat-message"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { closeAdminSupportTicketById, replyToAdminSupportTicket, useAdminSupportTicket, useAdminSupportTickets } from "@/lib/hooks"
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
      return "border-sky-400/30 bg-sky-400/10 text-sky-200"
    case "answered":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    case "closed":
      return "border-white/15 bg-white/5 text-white/70"
    default:
      return "border-white/15 bg-white/5 text-white/70"
  }
}

export default function AdminTicketsPage() {
  const { tr, locale } = useI18n()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const [closing, setClosing] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const listQuery = useAdminSupportTickets({
    q: deferredQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
    offset: 0,
  })
  const tickets = listQuery.data ?? []

  useEffect(() => {
    if (!tickets.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !tickets.some((ticket) => ticket.id === selectedId)) {
      setSelectedId(tickets[0].id)
    }
  }, [selectedId, tickets])

  const detailQuery = useAdminSupportTicket(selectedId ?? undefined)
  const detail = detailQuery.data

  async function handleReply() {
    if (!selectedId) return
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
    const response = await replyToAdminSupportTicket(selectedId, message)
    setSendingReply(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to send reply", "Не удалось отправить ответ"))
      return
    }

    toast.success(tr("Reply sent", "Ответ отправлен"))
    setReplyText("")
    await listQuery.mutate()
    await detailQuery.mutate()
  }

  async function handleCloseTicket() {
    if (!selectedId) return
    setClosing(true)
    const response = await closeAdminSupportTicketById(selectedId)
    setClosing(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to close ticket", "Не удалось закрыть тикет"))
      return
    }

    toast.success(tr("Ticket closed", "Тикет закрыт"))
    await listQuery.mutate()
    await detailQuery.mutate()
  }

  return (
    <AdminPageShell
      titleEn="Tickets"
      titleRu="Тикеты"
      descriptionEn="Support queue for reviewing tickets, replying to users, and closing resolved requests."
      descriptionRu="Очередь поддержки для просмотра тикетов, ответов пользователям и закрытия решённых обращений."
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          onClick={() => void Promise.all([listQuery.mutate(), detailQuery.mutate()])}
          disabled={listQuery.isLoading}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", listQuery.isLoading && "animate-spin")} />
          {tr("Refresh", "Обновить")}
        </Button>
      }
    >
      <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">{tr("Support tickets", "Тикеты поддержки")}</CardTitle>
          <CardDescription className="text-white/45">
            {tr("Open a ticket to review the chat and manage status.", "Откройте тикет, чтобы просмотреть чат и управлять статусом.")}
          </CardDescription>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Search by subject, topic or subtopic", "Поиск по теме, теме обращения или подтеме")}
              className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="all" className="bg-[#0b0f17]">{tr("All statuses", "Все статусы")}</option>
              <option value="open" className="bg-[#0b0f17]">{tr("Open", "Открыт")}</option>
              <option value="answered" className="bg-[#0b0f17]">{tr("Answered", "Есть ответ")}</option>
              <option value="closed" className="bg-[#0b0f17]">{tr("Closed", "Закрыт")}</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            {listQuery.isLoading && !listQuery.data ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
            ) : listQuery.error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
                {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
              </div>
            ) : tickets.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                {tr("No tickets found", "Тикеты не найдены")}
              </div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    ticket.id === selectedId ? "border-white/20 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                      #{ticket.public_number} · {supportStatusLabel(locale, ticket.status)}
                    </Badge>
                    <span className="text-xs text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80">
                      <Ticket className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-white">{ticket.subject}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-white/45">
                        {supportTopicLabel(locale, ticket.topic)} · {supportSubtopicLabel(locale, ticket.topic, ticket.subtopic)}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[11px] text-white/35">
                        {tr("User ID", "ID пользователя")}: {ticket.user_id}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <Card className="rounded-2xl border-white/10 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">
                {detail ? `${tr("Ticket", "Тикет")} #${detail.public_number}` : tr("Ticket chat", "Чат тикета")}
              </CardTitle>
              <CardDescription className="text-white/45">
                {detail ? detail.subject : tr("Select a ticket from the list", "Выберите тикет из списка")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedId && detailQuery.isLoading && !detailQuery.data ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
              ) : !selectedId ? (
                <p className="text-sm text-white/55">{tr("No ticket selected", "Тикет не выбран")}</p>
              ) : detailQuery.error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
                  {tr("Failed to load ticket details", "Не удалось загрузить детали тикета")}
                </div>
              ) : detail ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(detail.status))}>{supportStatusLabel(locale, detail.status)}</Badge>
                      <span className="text-xs text-white/40">{formatDateTime(detail.created_at, locale)}</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                      {supportTopicLabel(locale, detail.topic)} · {supportSubtopicLabel(locale, detail.topic, detail.subtopic)}
                    </p>
                    <p className="mt-1 break-all text-xs text-white/45">{tr("User ID", "ID пользователя")}: {detail.user_id}</p>
                  </div>

                  <div className="max-h-[56svh] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2 pr-1.5">
                    {detail.messages.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-white/50">{tr("No messages yet", "Сообщений пока нет")}</div>
                    ) : (
                      detail.messages.map((message) => (
                        <TicketChatMessage key={message.id} scope="admin" ticketId={detail.id} message={message} locale={locale} viewerRole="admin" />
                      ))
                    )}
                  </div>

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

                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </AdminPageShell>
  )
}
