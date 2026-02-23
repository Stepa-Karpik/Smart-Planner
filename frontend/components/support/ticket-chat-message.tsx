"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileImage, Loader2, Paperclip } from "lucide-react"
import { apiRequestBlob } from "@/lib/api-client"
import { type Locale } from "@/lib/i18n"
import type { SupportTicketMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function messageRoleLabel(locale: Locale, role: SupportTicketMessage["author_role"]) {
  if (locale === "ru") {
    if (role === "user") return "Пользователь"
    if (role === "admin") return "Поддержка"
    return "Система"
  }
  if (role === "user") return "User"
  if (role === "admin") return "Support"
  return "System"
}

function localizeSystemBody(locale: Locale, body: string) {
  if (locale === "ru") {
    if (body === "Ticket closed by administrator") return "Тикет закрыт администратором"
  } else {
    if (body === "Тикет закрыт администратором") return "Ticket closed by administrator"
  }
  return body
}

function isImageAttachment(contentType: string) {
  return contentType.toLowerCase().startsWith("image/")
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentApiPath(scope: "user" | "admin", ticketId: string, messageId: string, storedName: string) {
  if (scope === "admin") {
    return `/api/v1/admin/tickets/${ticketId}/messages/${messageId}/attachments/${storedName}`
  }
  return `/api/v1/support/tickets/${ticketId}/messages/${messageId}/attachments/${storedName}`
}

function AttachmentPreview({
  scope,
  ticketId,
  messageId,
  attachment,
  locale,
}: {
  scope: "user" | "admin"
  ticketId: string
  messageId: string
  attachment: SupportTicketMessage["attachments"][number]
  locale: Locale
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isImage = useMemo(() => isImageAttachment(attachment.content_type), [attachment.content_type])
  const path = useMemo(
    () => attachmentApiPath(scope, ticketId, messageId, attachment.stored_name),
    [scope, ticketId, messageId, attachment.stored_name],
  )

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    if (!isImage) return

    setLoading(true)
    setError(null)
    apiRequestBlob(path)
      .then((blob) => {
        if (revoked) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
      })
      .catch(() => {
        if (!revoked) setError(locale === "ru" ? "Не удалось загрузить превью" : "Failed to load preview")
      })
      .finally(() => {
        if (!revoked) setLoading(false)
      })

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, path, locale])

  async function handleDownload() {
    try {
      setLoading(true)
      const blob = await apiRequestBlob(path)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = attachment.original_name || attachment.stored_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(locale === "ru" ? "Не удалось скачать файл" : "Failed to download file")
    } finally {
      setLoading(false)
    }
  }

  if (isImage) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/20">
          {previewUrl ? (
            <img src={previewUrl} alt={attachment.original_name} className="h-full w-full object-cover transition duration-300 hover:scale-[1.015]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/45">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-5 w-5" />}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-white/80">{attachment.original_name}</p>
            <p className="text-[11px] text-white/45">{formatBytes(attachment.size_bytes)}</p>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/80 transition hover:bg-white/10"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {locale === "ru" ? "Файл" : "File"}
          </button>
        </div>
        {error ? <p className="px-3 pb-2 text-[11px] text-red-300">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs text-white/80">{attachment.original_name}</p>
        <p className="text-[11px] text-white/45">{formatBytes(attachment.size_bytes)}</p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/80 transition hover:bg-white/10"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {locale === "ru" ? "Скачать" : "Download"}
      </button>
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
    </div>
  )
}

export function TicketChatMessage({
  scope,
  ticketId,
  message,
  locale,
  viewerRole,
}: {
  scope: "user" | "admin"
  ticketId: string
  message: SupportTicketMessage
  locale: Locale
  viewerRole: "user" | "admin"
}) {
  const isSystem = message.author_role === "system"
  const isOwn = !isSystem && message.author_role === viewerRole

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center text-xs text-white/60">
          {localizeSystemBody(locale, message.body)}
          <span className="ml-2 text-white/35">{formatDateTime(message.created_at, locale)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[94%] rounded-2xl border px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.15)]",
          isOwn ? "border-blue-400/20 bg-blue-500/10" : "border-white/10 bg-white/[0.03]",
        )}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px]", isOwn ? "bg-blue-400/20 text-blue-200" : "bg-white/10 text-white/70")}>
            {messageRoleLabel(locale, message.author_role)}
          </span>
          <span className="text-[11px] text-white/35">{formatDateTime(message.created_at, locale)}</span>
        </div>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-white/80">{message.body}</p>

        {message.attachments.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-white/50">
              <Paperclip className="h-3 w-3" />
              {locale === "ru" ? "Вложения" : "Attachments"}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {message.attachments.map((attachment, index) => (
                <AttachmentPreview
                  key={`${message.id}-${attachment.stored_name}-${index}`}
                  scope={scope}
                  ticketId={ticketId}
                  messageId={message.id}
                  attachment={attachment}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
