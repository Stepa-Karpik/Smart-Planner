"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileImage, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adminScope = scope === "admin"

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

  useEffect(() => {
    if (previewOpen) setZoom(1)
  }, [previewOpen])

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
      <>
        <button
          type="button"
          className="block w-fit max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left dark:border-white/10 dark:bg-black/20"
          onClick={() => previewUrl && setPreviewOpen(true)}
        >
          <div className="relative max-h-[24rem] max-w-[min(30rem,72vw)] overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt={attachment.original_name} className="block max-h-[24rem] max-w-[min(30rem,72vw)] object-contain transition duration-300 hover:scale-[1.01]" />
            ) : (
              <div className="flex h-40 w-64 max-w-full items-center justify-center text-slate-400 dark:text-white/45">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-5 w-5" />}
              </div>
            )}
          </div>
        </button>
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="grid h-[min(88svh,760px)] w-[min(96vw,1120px)] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border-slate-200 bg-white p-3 text-slate-950 dark:border-white/10 dark:bg-[#0b0f17] dark:text-white">
            <div className="flex items-center justify-end gap-1.5 pr-9">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-black/60 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                title={locale === "ru" ? "Уменьшить" : "Zoom out"}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-black/60 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                title={locale === "ru" ? "Сбросить масштаб" : "Reset zoom"}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-black/60 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                title={locale === "ru" ? "Увеличить" : "Zoom in"}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-black/60 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white"
                title={locale === "ru" ? "Скачать" : "Download"}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </button>
            </div>
            <div className="min-h-0 overflow-auto rounded-xl bg-slate-100 dark:bg-black/30">
              <div className="flex min-h-full min-w-full items-center justify-center p-4">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={attachment.original_name}
                    className="block object-contain transition-[width] duration-150"
                    style={{
                      width: `${zoom * 100}%`,
                      maxWidth: zoom === 1 ? "100%" : "none",
                      maxHeight: zoom === 1 ? "100%" : "none",
                    }}
                  />
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {error ? <p className="px-1 pt-1 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
      </>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-700 dark:text-white/80">{attachment.original_name}</p>
        <p className="text-[11px] text-slate-400 dark:text-white/45">{formatBytes(attachment.size_bytes)}</p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10"
        title={locale === "ru" ? "Скачать" : "Download"}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
      {error ? <p className="text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
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
  const adminScope = scope === "admin"

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div
          className={cn(
            "max-w-[90%] rounded-full border px-3 py-1.5 text-center text-xs",
            adminScope
              ? "border-slate-200 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60"
              : "border-white/10 bg-white/[0.03] text-white/60",
          )}
        >
          {localizeSystemBody(locale, message.body)}
          <span className={cn("ml-2", adminScope ? "text-slate-400 dark:text-white/35" : "text-white/35")}>
            {formatDateTime(message.created_at, locale)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "w-fit max-w-[min(42rem,94%)] rounded-2xl border px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.15)]",
          isOwn
            ? "border-sky-200 bg-sky-50 text-slate-950 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-white"
            : "border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-white",
        )}
      >
        {message.body.trim() ? <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-800 dark:text-white/80">{message.body}</p> : null}

        {message.attachments.length > 0 ? (
          <div className={cn("space-y-2", message.body.trim() && "mt-2.5")}>
            <div className="flex max-w-full flex-wrap gap-2">
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
        <div className="mt-1.5 flex justify-end">
          <span className="text-[11px] text-slate-400 dark:text-white/35">{formatDateTime(message.created_at, locale)}</span>
        </div>
      </div>
    </div>
  )
}
