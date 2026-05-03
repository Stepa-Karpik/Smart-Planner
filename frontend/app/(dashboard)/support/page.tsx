"use client"

import { type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"
import { HelpCircle, Loader2, Paperclip, Plus, RefreshCw, Search, Send, Ticket, X } from "lucide-react"
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
const MAX_SUBJECT_LENGTH = 30

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
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200"
    case "answered":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
    case "closed":
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
    default:
      return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
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
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const [createOpen, setCreateOpen] = useState(false)

  const [topicId, setTopicId] = useState(SUPPORT_TOPICS[0].id)
  const [subtopicId, setSubtopicId] = useState(SUPPORT_TOPICS[0].subtopics[0].id)
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketSearch, setTicketSearch] = useState("")
  const [replyText, setReplyText] = useState("")
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replySending, setReplySending] = useState(false)

  const ticketsQuery = useMySupportTickets({ limit: 100, offset: 0 })
  const tickets = (ticketsQuery.data ?? []).slice().sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
  const filteredTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase()
    if (!query) return tickets
    return tickets.filter((ticket) => {
      const haystack = [
        ticket.subject,
        `#${ticket.public_number}`,
        String(ticket.public_number),
        supportTopicLabel(locale, ticket.topic),
        supportSubtopicLabel(locale, ticket.topic, ticket.subtopic),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [locale, ticketSearch, tickets])

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

  useEffect(() => {
    const textarea = replyTextareaRef.current
    if (!textarea) return
    textarea.style.height = "0px"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }, [replyText])

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
    if (trimmedSubject.length > MAX_SUBJECT_LENGTH) {
      toast.error(tr(`Subject must be ${MAX_SUBJECT_LENGTH} characters or less`, `Краткая тема должна быть не длиннее ${MAX_SUBJECT_LENGTH} символов`))
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
    if (!text && replyFiles.length === 0) {
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

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-[-4rem] h-64 w-64 rounded-full bg-sky-300/20 blur-[110px] dark:bg-cyan-400/10" />
        <div className="absolute right-[10%] top-[8rem] h-72 w-72 rounded-full bg-blue-300/16 blur-[120px] dark:bg-violet-500/10" />
        <div className="absolute bottom-[5%] left-[45%] h-64 w-64 rounded-full bg-indigo-300/14 blur-[120px] dark:bg-blue-500/10" />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92svh] max-w-4xl overflow-hidden rounded-2xl border-slate-200 bg-white p-0 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b0f17] dark:text-white">
          <div className="border-b border-slate-200 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <DialogHeader>
              <DialogTitle>{tr("Create support ticket", "Создать тикет поддержки")}</DialogTitle>
              <DialogDescription>
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
                  <Label htmlFor="support-topic">{tr("Topic", "Тема")}</Label>
                  <select
                    id="support-topic"
                    value={topicId}
                    onChange={(event) => setTopicId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-white/30"
                  >
                    {SUPPORT_TOPICS.map((topic) => (
                      <option key={topic.id} value={topic.id} className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">
                        {tr(topic.titleEn, topic.titleRu)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-subtopic">{tr("Subtopic", "Подтема")}</Label>
                  <select
                    id="support-subtopic"
                    value={subtopicId}
                    onChange={(event) => setSubtopicId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-white/30"
                  >
                    {selectedTopic.subtopics.map((subtopic) => (
                      <option key={subtopic.id} value={subtopic.id} className="bg-white text-slate-950 dark:bg-[#0b0f17] dark:text-white">
                        {tr(subtopic.titleEn, subtopic.titleRu)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="support-subject">{tr("Short subject", "Краткая тема")}</Label>
                  <span className={cn("text-xs", subject.length >= MAX_SUBJECT_LENGTH ? "text-amber-600 dark:text-amber-300" : "text-slate-400 dark:text-white/40")}>
                    {subject.length}/{MAX_SUBJECT_LENGTH}
                  </span>
                </div>
                <Input
                  id="support-subject"
                  value={subject}
                  maxLength={MAX_SUBJECT_LENGTH}
                  onChange={(event) => setSubject(event.target.value.slice(0, MAX_SUBJECT_LENGTH))}
                  placeholder={tr("Example: Telegram 2FA", "Например: Telegram 2FA")}
                  className="h-10 rounded-xl border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message">{tr("Message", "Сообщение")}</Label>
                <Textarea
                  id="support-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={tr(
                    "Describe what happened, what you expected, and how to reproduce the issue.",
                    "Опишите, что произошло, что вы ожидали и как воспроизвести проблему.",
                  )}
                  className="min-h-[160px] rounded-xl border-slate-200 bg-white text-slate-950 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-files">{tr("Attachments", "Вложения")}</Label>
                <input
                  ref={createFileInputRef}
                  id="support-files"
                  type="file"
                  multiple
                  onChange={(event) => handleFileInputChange(event, setFiles)}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-white dark:file:bg-white/10 dark:file:text-white"
                  accept="image/*,.pdf,.txt,.log,.zip,.json"
                />
                <p className="text-xs text-slate-500 dark:text-white/45">{tr("Up to 3 files, up to 3 MB each", "До 3 файлов, до 3 МБ каждый")}</p>
                {files.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-700 dark:text-white/80">{file.name}</p>
                          <p className="text-xs text-slate-500 dark:text-white/45">{formatBytes(file.size)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
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
                <Badge className="rounded-full border-slate-200 bg-slate-100 px-3 py-1 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                  {tr("Topic", "Тема")}: {tr(selectedTopic.titleEn, selectedTopic.titleRu)} / {tr(selectedSubtopic.titleEn, selectedSubtopic.titleRu)}
                </Badge>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="relative mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 md:p-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-3xl border-slate-200/80 bg-white/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-white/10 dark:bg-black/30 xl:h-[calc(100svh-8rem)]">
          <CardHeader className="gap-3 pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm text-slate-950 dark:text-white">{tr("My tickets", "Мои тикеты")}</CardTitle>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                  onClick={() => void Promise.all([ticketsQuery.mutate(), detailQuery.mutate()])}
                  title={tr("Refresh", "Обновить")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                  asChild
                  title="FAQ"
                >
                  <a href="/support/faq">
                    <HelpCircle className="h-4 w-4" />
                  </a>
                </Button>
                <Button type="button" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setCreateOpen(true)} title={tr("Create ticket", "Создать тикет")}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/35" />
              <Input
                value={ticketSearch}
                onChange={(event) => setTicketSearch(event.target.value)}
                placeholder={tr("Search tickets...", "Поиск по тикетам...")}
                className="h-10 rounded-xl border-slate-200 bg-white pl-9 text-slate-950 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/35"
              />
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-7rem)] p-3 pt-0">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-2">
                {ticketsQuery.isLoading && !ticketsQuery.data ? (
                  Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
                ) : ticketsQuery.error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/5 dark:text-red-200">
                    {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
                      <Ticket className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-slate-950 dark:text-white">{tr("No tickets yet", "Пока нет тикетов")}</p>
                    <Button type="button" size="sm" className="mt-3 rounded-xl" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      {tr("Create ticket", "Создать тикет")}
                    </Button>
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/50">
                    {tr("Nothing found", "Ничего не найдено")}
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        ticket.id === selectedTicketId
                          ? "border-slate-950/15 bg-slate-950/[0.06] dark:border-white/20 dark:bg-white/[0.08]"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(ticket.status))}>
                          {supportStatusLabel(locale, ticket.status)}
                        </Badge>
                        <span className="text-[11px] text-slate-400 dark:text-white/40">{formatDateTime(ticket.updated_at, locale)}</span>
                      </div>
                      <p className="line-clamp-1 text-sm font-medium text-slate-950 dark:text-white">{ticket.subject}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-white/45">
                        {supportTopicLabel(locale, ticket.topic)} · {supportSubtopicLabel(locale, ticket.topic, ticket.subtopic)}
                      </p>
                    </button>
                  ))
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
                  {detail ? detail.subject : tr("Support chat", "Чат поддержки")}
                </CardTitle>
                {!detail ? (
                  <CardDescription className="mt-1">{tr("Select a ticket from the list", "Выберите тикет из списка")}</CardDescription>
                ) : null}
              </div>
              {detail ? (
                <div className="flex max-w-full flex-wrap items-center justify-start gap-2 text-xs text-slate-500 dark:text-white/55 lg:justify-end">
                  <Badge className={cn("rounded-full text-[10px]", statusBadgeClass(detail.status))}>{supportStatusLabel(locale, detail.status)}</Badge>
                  <span>{supportTopicLabel(locale, detail.topic)}</span>
                  <span className="text-slate-300 dark:text-white/25">•</span>
                  <span>{supportSubtopicLabel(locale, detail.topic, detail.subtopic)}</span>
                  <span className="text-slate-300 dark:text-white/25">•</span>
                  <span>{tr("Created", "Создан")}: {formatDateTime(detail.created_at, locale)}</span>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            {selectedTicketId && detailQuery.isLoading && !detailQuery.data ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
              </div>
            ) : !selectedTicketId ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-sm font-medium text-slate-950 dark:text-white">{tr("Choose a ticket to open chat", "Выберите тикет, чтобы открыть чат")}</p>
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
                      detail.messages.map((msg) => (
                        <TicketChatMessage key={msg.id} scope="user" ticketId={detail.id} message={msg} locale={locale} viewerRole="user" />
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
                  {replyFiles.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2 px-1">
                      {replyFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex max-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(index, setReplyFiles, replyFileInputRef)}
                            disabled={detail.status === "closed"}
                            className="ml-1 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <input
                      ref={replyFileInputRef}
                      type="file"
                      multiple
                      onChange={(event) => handleFileInputChange(event, setReplyFiles)}
                      className="sr-only"
                      accept="image/*,.pdf,.txt,.log,.zip,.json"
                      disabled={detail.status === "closed"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={() => replyFileInputRef.current?.click()}
                      disabled={detail.status === "closed"}
                      title={tr("Attach file", "Прикрепить файл")}
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Textarea
                      ref={replyTextareaRef}
                      id="support-reply"
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
                      disabled={replySending || detail.status === "closed" || (!replyText.trim() && replyFiles.length === 0)}
                      title={tr("Send message", "Отправить сообщение")}
                    >
                      {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {detail.status === "closed" ? (
                    <p className="px-2 pt-2 text-xs text-slate-500 dark:text-white/45">{tr("Closed tickets are read-only", "Закрытые тикеты доступны только для чтения")}</p>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
