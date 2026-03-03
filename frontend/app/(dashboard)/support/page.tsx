"use client"

import Link from "next/link"
import { type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"
import { FilePlus2, HelpCircle, LifeBuoy, Loader2, MessageSquare, RefreshCw, Send, Ticket, X } from "lucide-react"
import { toast } from "sonner"
import { TicketChatMessage } from "@/components/support/ticket-chat-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { createUserSupportTicket, replyToMySupportTicket, useMySupportTicket, useMySupportTickets } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { SUPPORT_TOPICS, supportStatusLabel, supportSubtopicLabel, supportTopicLabel } from "@/lib/support-topics"
import type { SupportTicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_FILES = 3
const MAX_FILE_SIZE = 3 * 1024 * 1024

type FilePickerStateSetter = Dispatch<SetStateAction<File[]>>

function formatDateTime(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function validateFiles(files: File[], locale: "en" | "ru") {
  if (files.length > MAX_FILES) {
    return locale === "ru" ? "Можно прикрепить не более 3 файлов" : "You can attach up to 3 files"
  }
  const oversized = files.find((file) => file.size > MAX_FILE_SIZE)
  if (oversized) {
    return locale === "ru" ? `Файл «${oversized.name}» больше 3 МБ` : `File "${oversized.name}" is larger than 3 MB`
  }
  return null
}

export default function SupportPage() {
  const { tr, locale } = useI18n()
  const createFileInputRef = useRef<HTMLInputElement | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const [createOpen, setCreateOpen] = useState(false)

  const [topicId, setTopicId] = useState(SUPPORT_TOPICS[0].id)
  const [subtopicId, setSubtopicId] = useState(SUPPORT_TOPICS[0].subtopics[0].id)
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replySending, setReplySending] = useState(false)

  const ticketsQuery = useMySupportTickets({ limit: 100, offset: 0 })
  const tickets = (ticketsQuery.data ?? []).slice().sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))

  const selectedTopic = useMemo(() => SUPPORT_TOPICS.find((topic) => topic.id === topicId) ?? SUPPORT_TOPICS[0], [topicId])
  const selectedSubtopic = useMemo(
    () => selectedTopic.subtopics.find((subtopic) => subtopic.id === subtopicId) ?? selectedTopic.subtopics[0],
    [selectedTopic, subtopicId],
  )

  useEffect(() => {
    if (!selectedTopic.subtopics.some((subtopic) => subtopic.id === subtopicId)) {
      setSubtopicId(selectedTopic.subtopics[0]?.id ?? "other")
    }
  }, [selectedTopic, subtopicId])

  useEffect(() => {
    if (!tickets.length) {
      setSelectedTicketId(null)
      return
    }
    if (!selectedTicketId || !tickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(tickets[0].id)
    }
  }, [selectedTicketId, tickets])

  const detailQuery = useMySupportTicket(selectedTicketId ?? undefined)
  const detail = detailQuery.data

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [detail?.id, detail?.messages.length])

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>, setTarget: FilePickerStateSetter) {
    const nextFiles = Array.from(event.target.files ?? [])
    const error = validateFiles(nextFiles, locale)
    if (error) {
      toast.error(error)
      event.target.value = ""
      return
    }
    setTarget(nextFiles)
  }

  function removeSelectedFile(index: number, setTarget: FilePickerStateSetter, inputRef: RefObject<HTMLInputElement | null>) {
    setTarget((prev) => prev.filter((_, i) => i !== index))
    if (inputRef.current) inputRef.current.value = ""
  }

  async function handleCreateTicket() {
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    if (!trimmedSubject || !trimmedMessage) {
      toast.error(tr("Subject and message are required", "Тема и текст обращения обязательны"))
      return
    }
    const fileError = validateFiles(files, locale)
    if (fileError) {
      toast.error(fileError)
      return
    }

    setSubmitting(true)
    const response = await createUserSupportTicket({
      topic: topicId,
      subtopic: subtopicId,
      subject: trimmedSubject,
      message: trimmedMessage,
      files,
    })
    setSubmitting(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to create ticket", "Не удалось создать тикет"))
      return
    }

    toast.success(tr("Ticket created", "Тикет создан"))
    setCreateOpen(false)
    setSubject("")
    setMessage("")
    setFiles([])
    if (createFileInputRef.current) createFileInputRef.current.value = ""

    setSelectedTicketId(response.data.id)
    await ticketsQuery.mutate()
  }

  async function handleReply() {
    if (!detail) return
    const text = replyText.trim()
    if (!text) {
      toast.error(tr("Reply message is required", "Текст сообщения обязателен"))
      return
    }
    if (detail.status === "closed") {
      toast.error(tr("Ticket is closed", "Тикет закрыт"))
      return
    }
    const fileError = validateFiles(replyFiles, locale)
    if (fileError) {
      toast.error(fileError)
      return
    }

    setReplySending(true)
    const response = await replyToMySupportTicket({
      ticketId: detail.id,
      message: text,
      files: replyFiles,
    })
    setReplySending(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to send reply", "Не удалось отправить сообщение"))
      return
    }

    toast.success(tr("Message sent", "Сообщение отправлено"))
    setReplyText("")
    setReplyFiles([])
    if (replyFileInputRef.current) replyFileInputRef.current.value = ""
    await Promise.all([ticketsQuery.mutate(), detailQuery.mutate()])
  }

  const totalOpen = tickets.filter((ticket) => ticket.status === "open").length
  const totalAnswered = tickets.filter((ticket) => ticket.status === "answered").length

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-[-4rem] h-64 w-64 rounded-full bg-cyan-400/10 blur-[110px]" />
        <div className="absolute right-[10%] top-[8rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute bottom-[5%] left-[45%] h-64 w-64 rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92svh] max-w-4xl overflow-hidden rounded-2xl border-white/10 bg-[#0b0f17] p-0 text-white">
          <div className="border-b border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-5">
            <DialogHeader>
              <DialogTitle className="text-white">{tr("Create support ticket", "Создать тикет поддержки")}</DialogTitle>
              <DialogDescription className="text-white/55">
                {tr(
                  "Choose topic and subtopic, describe the issue, and attach files if needed.",
                  "Выберите тему и подтему, опишите проблему и при необходимости добавьте вложения.",
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          <ScrollArea className="max-h-[calc(92svh-5.5rem)]">
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="support-topic" className="text-white/80">{tr("Topic", "Тема")}</Label>
                  <select
                    id="support-topic"
                    value={topicId}
                    onChange={(event) => setTopicId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
                  >
                    {SUPPORT_TOPICS.map((topic) => (
                      <option key={topic.id} value={topic.id} className="bg-[#0b0f17]">
                        {tr(topic.titleEn, topic.titleRu)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-subtopic" className="text-white/80">{tr("Subtopic", "Подтема")}</Label>
                  <select
                    id="support-subtopic"
                    value={subtopicId}
                    onChange={(event) => setSubtopicId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
                  >
                    {selectedTopic.subtopics.map((subtopic) => (
                      <option key={subtopic.id} value={subtopic.id} className="bg-[#0b0f17]">
                        {tr(subtopic.titleEn, subtopic.titleRu)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-subject" className="text-white/80">{tr("Short subject", "Краткая тема")}</Label>
                <Input
                  id="support-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={tr("Example: Telegram 2FA login does not complete", "Например: не завершается вход через Telegram 2FA")}
                  className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message" className="text-white/80">{tr("Message", "Сообщение")}</Label>
                <Textarea
                  id="support-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={tr(
                    "Describe what happened, what you expected, and how to reproduce the issue.",
                    "Опишите, что произошло, что вы ожидали и как воспроизвести проблему.",
                  )}
                  className="min-h-[160px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-files" className="text-white/80">{tr("Attachments", "Вложения")}</Label>
                <input
                  ref={createFileInputRef}
                  id="support-files"
                  type="file"
                  multiple
                  onChange={(event) => handleFileInputChange(event, setFiles)}
                  className="block w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
                  accept="image/*,.pdf,.txt,.log,.zip,.json"
                />
                <p className="text-xs text-white/45">{tr("Up to 3 files, up to 3 MB each", "До 3 файлов, до 3 МБ каждый")}</p>
                {files.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white/80">{file.name}</p>
                          <p className="text-xs text-white/45">{formatBytes(file.size)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                          onClick={() => removeSelectedFile(index, setFiles, createFileInputRef)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" className="rounded-xl" onClick={handleCreateTicket} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {tr("Send ticket", "Отправить тикет")}
                </Button>
                <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/70">
                  {tr("Topic", "Тема")}: {tr(selectedTopic.titleEn, selectedTopic.titleRu)} / {tr(selectedSubtopic.titleEn, selectedSubtopic.titleRu)}
                </Badge>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-4 p-4 md:p-6">
        <Card className="rounded-3xl border-white/10 bg-gradient-to-br from-black/35 via-black/25 to-black/30 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
                {tr("Support Center", "Центр поддержки")}
              </Badge>
              <div>
                <CardTitle className="text-2xl tracking-tight text-white">{tr("Support", "Поддержка")}</CardTitle>
                <CardDescription className="mt-1 text-sm text-white/55">
                  {tr(
                    "Ticket chat workspace. FAQ is available as a separate page to keep the conversation area larger.",
                    "Рабочее окно чатов поддержки. FAQ вынесен на отдельную страницу, чтобы освободить место для переписки.",
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                {tr("Open", "Открытые")}: {totalOpen}
              </Badge>
              <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                {tr("Answered", "С ответом")}: {totalAnswered}
              </Badge>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => void Promise.all([ticketsQuery.mutate(), detailQuery.mutate()])}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {tr("Refresh", "Обновить")}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="/support/faq">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  FAQ
                </Link>
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => setCreateOpen(true)}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {tr("Create ticket", "Создать тикет")}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="rounded-3xl border-white/10 bg-black/30 backdrop-blur-sm xl:h-[calc(100svh-15.5rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">{tr("My tickets", "Мои тикеты")}</CardTitle>
              <CardDescription className="text-white/45">
                {tr("Newest activity on top. Open any ticket to continue the conversation.", "Новая активность сверху. Откройте тикет, чтобы продолжить переписку.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-5.5rem)] p-3 pt-0">
              <ScrollArea className="h-full pr-2">
                <div className="space-y-2">
                  {ticketsQuery.isLoading && !ticketsQuery.data ? (
                    Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
                  ) : ticketsQuery.error ? (
                    <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-3 text-sm text-red-200">
                      {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/70">
                        <Ticket className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-medium text-white">{tr("No tickets yet", "Пока нет тикетов")}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {tr("Create your first support ticket to start chat.", "Создайте первый тикет поддержки, чтобы начать чат.")}
                      </p>
                      <Button type="button" size="sm" className="mt-3 rounded-xl" onClick={() => setCreateOpen(true)}>
                        <FilePlus2 className="mr-2 h-4 w-4" />
                        {tr("Create ticket", "Создать тикет")}
                      </Button>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition",
                          ticket.id === selectedTicketId ? "border-white/20 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                            #{ticket.public_number} · {supportStatusLabel(locale, ticket.status)}
                          </Badge>
                          <span className="text-[11px] text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                        </div>
                        <p className="line-clamp-1 text-sm font-medium text-white">{ticket.subject}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-white/45">
                          {supportTopicLabel(locale, ticket.topic)} · {supportSubtopicLabel(locale, ticket.topic, ticket.subtopic)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex min-h-[62svh] flex-col rounded-3xl border-white/10 bg-black/30 backdrop-blur-sm xl:h-[calc(100svh-15.5rem)]">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base text-white">
                    <Ticket className="h-4 w-4" />
                    {tr("Support chat", "Чат поддержки")}
                  </CardTitle>
                  <CardDescription className="mt-1 text-white/45">
                    {detail ? detail.subject : tr("Select a ticket from the list", "Выберите тикет из списка")}
                  </CardDescription>
                </div>
                {detail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(detail.status))}>{supportStatusLabel(locale, detail.status)}</Badge>
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
              {selectedTicketId && detailQuery.isLoading && !detailQuery.data ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
                </div>
              ) : !selectedTicketId ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
                  <p className="text-sm font-medium text-white">{tr("Choose a ticket to open chat", "Выберите тикет, чтобы открыть чат")}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {tr("Or create a new ticket using the button above.", "Или создайте новый тикет кнопкой сверху.")}
                  </p>
                </div>
              ) : detailQuery.error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
                  {tr("Failed to load ticket details", "Не удалось загрузить детали тикета")}
                </div>
              ) : detail ? (
                <>
                  <ScrollArea className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 pr-3">
                    <div className="space-y-2">
                      {detail.messages.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-white/50">{tr("No messages yet", "Сообщений пока нет")}</div>
                      ) : (
                        detail.messages.map((msg) => (
                          <TicketChatMessage key={msg.id} scope="user" ticketId={detail.id} message={msg} locale={locale} viewerRole="user" />
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <Label htmlFor="support-reply" className="text-white/80">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        {tr("Reply in chat", "Ответить в чате")}
                      </div>
                    </Label>
                    <Textarea
                      id="support-reply"
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder={tr(
                        "Write a message for support. Line breaks will be preserved.",
                        "Напишите сообщение поддержке. Переносы строк сохраняются.",
                      )}
                      className="min-h-[110px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                      disabled={detail.status === "closed"}
                    />

                    <div className="space-y-2">
                      <input
                        ref={replyFileInputRef}
                        type="file"
                        multiple
                        onChange={(event) => handleFileInputChange(event, setReplyFiles)}
                        className="block w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white"
                        accept="image/*,.pdf,.txt,.log,.zip,.json"
                        disabled={detail.status === "closed"}
                      />
                      {replyFiles.length > 0 ? (
                        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
                          {replyFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs text-white/80">{file.name}</p>
                                <p className="text-[11px] text-white/45">{formatBytes(file.size)}</p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-lg border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                onClick={() => removeSelectedFile(index, setReplyFiles, replyFileInputRef)}
                                disabled={detail.status === "closed"}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" className="rounded-xl" onClick={handleReply} disabled={replySending || detail.status === "closed"}>
                        {replySending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {detail.status === "closed" ? tr("Ticket closed", "Тикет закрыт") : tr("Send message", "Отправить сообщение")}
                      </Button>
                      {detail.status === "closed" ? (
                        <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/70">
                          {tr("Closed tickets are read-only", "Закрытые тикеты доступны только для чтения")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
