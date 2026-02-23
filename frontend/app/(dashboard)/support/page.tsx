"use client"

import Link from "next/link"
import { type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, FilePlus2, HelpCircle, LifeBuoy, Loader2, Send, Ticket, X } from "lucide-react"
import { toast } from "sonner"
import { TicketChatMessage } from "@/components/support/ticket-chat-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { createUserSupportTicket, replyToMySupportTicket, useMySupportTicket, useMySupportTickets } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { SUPPORT_TOPICS, supportStatusLabel, supportSubtopicLabel, supportTopicLabel } from "@/lib/support-topics"
import type { SupportTicketStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_FILES = 3
const MAX_FILE_SIZE = 3 * 1024 * 1024

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

type FilePickerStateSetter = Dispatch<SetStateAction<File[]>>

export default function SupportPage() {
  const { tr, locale } = useI18n()
  const createFileInputRef = useRef<HTMLInputElement | null>(null)
  const replyFileInputRef = useRef<HTMLInputElement | null>(null)

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
  const tickets = ticketsQuery.data ?? []

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
    setSubject("")
    setMessage("")
    setFiles([])
    if (createFileInputRef.current) createFileInputRef.current.value = ""
    setSelectedTicketId(response.data.id)
    await ticketsQuery.mutate()
    await detailQuery.mutate()
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
    await ticketsQuery.mutate()
    await detailQuery.mutate()
  }

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-[-4rem] h-64 w-64 rounded-full bg-cyan-400/10 blur-[110px]" />
        <div className="absolute right-[10%] top-[8rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute bottom-[5%] left-[45%] h-64 w-64 rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
        <Card className="rounded-2xl border-white/10 bg-black/30 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
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
                    "FAQ, troubleshooting tips, and support tickets in one place.",
                    "FAQ, подсказки по решению проблем и тикеты поддержки в одном месте.",
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => document.getElementById("support-ticket-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <FilePlus2 className="mr-2 h-4 w-4" />
                {tr("Create ticket", "Создать тикет")}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[46%_54%]">
          <div className="space-y-6">
            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <HelpCircle className="h-4 w-4" />
                  {tr("Quick help", "Быстрая помощь")}
                </CardTitle>
                <CardDescription className="text-white/50">
                  {tr(
                    "Open the FAQ page with answers about login, integrations, feed, routes, and support tickets.",
                    "Откройте страницу FAQ с ответами по входу, интеграциям, ленте, маршрутам и тикетам поддержки.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm leading-relaxed text-white/70">
                    {tr(
                      "FAQ is moved to a separate page so the ticket chat has more room. Start there, then create a ticket if needed.",
                      "FAQ вынесен на отдельную страницу, чтобы освободить место для чата тикетов. Сначала проверьте ответы там, затем создайте тикет при необходимости.",
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" className="rounded-xl">
                      <Link href="/support/faq">
                        {tr("Open FAQ", "Открыть FAQ")}
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                      onClick={() => document.getElementById("support-ticket-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      {tr("Ticket form", "Форма тикета")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card id="support-ticket-form" className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base text-white">{tr("Create a support ticket", "Создать тикет поддержки")}</CardTitle>
                <CardDescription className="text-white/50">
                  {tr(
                    "Select a topic and subtopic, then describe the issue. You can attach up to 3 files (up to 3 MB each).",
                    "Выберите тему и подтему, затем опишите проблему. Можно прикрепить до 3 файлов (до 3 МБ каждый).",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <Label htmlFor="support-subject" className="text-white/80">{tr("Short subject", "Краткая тема обращения")}</Label>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder={tr("Example: Cannot complete login with Telegram 2FA", "Например: Не получается войти через Telegram 2FA")}
                    className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-message" className="text-white/80">{tr("Message", "Обращение")}</Label>
                  <Textarea
                    id="support-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={tr(
                      "Describe what happened, what you expected, and steps to reproduce. You can use line breaks.",
                      "Опишите, что произошло, что ожидали и шаги воспроизведения. Можно использовать переносы строк.",
                    )}
                    className="min-h-[140px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
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
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white">{tr("My tickets", "Мои тикеты")}</CardTitle>
                <CardDescription className="text-white/45">
                  {tr("Open a ticket to continue the conversation in chat mode.", "Откройте тикет, чтобы продолжить переписку в режиме чата.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticketsQuery.isLoading && !ticketsQuery.data ? (
                  Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
                ) : ticketsQuery.error ? (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-3 text-sm text-red-200">
                    {tr("Failed to load tickets", "Не удалось загрузить тикеты")}
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                    {tr("No tickets yet", "Пока нет тикетов")}
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
                          {supportStatusLabel(locale, ticket.status)}
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
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <Ticket className="h-4 w-4" />
                  {tr("Support chat", "Чат поддержки")}
                </CardTitle>
                <CardDescription className="text-white/45">
                  {detail ? detail.subject : tr("Select a ticket from the list", "Выберите тикет из списка")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTicketId && detailQuery.isLoading && !detailQuery.data ? (
                  Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
                ) : !selectedTicketId ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
                    {tr("Choose a ticket to open chat", "Выберите тикет, чтобы открыть чат")}
                  </div>
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
                      <p className="text-sm font-semibold text-white">{detail.subject}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {supportTopicLabel(locale, detail.topic)} · {supportSubtopicLabel(locale, detail.topic, detail.subtopic)}
                      </p>
                    </div>

                    <div className="max-h-[54svh] space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2 pr-1.5">
                      {detail.messages.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-white/50">{tr("No messages yet", "Сообщений пока нет")}</div>
                      ) : (
                        detail.messages.map((msg) => (
                          <TicketChatMessage key={msg.id} scope="user" ticketId={detail.id} message={msg} locale={locale} viewerRole="user" />
                        ))
                      )}
                    </div>

                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <Label htmlFor="support-reply" className="text-white/80">
                        {tr("Reply in chat", "Ответить в чате")}
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
    </div>
  )
}
