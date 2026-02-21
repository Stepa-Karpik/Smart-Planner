"use client"

import { Bot, Mic, User } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type ActionMeta = "create" | "update" | "delete" | "info" | null

interface MessageBubbleProps {
  role: "user" | "assistant" | "system"
  content: string
  isStreaming?: boolean
  inputType?: "text" | "voice"
  actionMeta?: ActionMeta
}

function parseAssistantContent(content: string): { cleaned: string; meta: ActionMeta } {
  const match = content.match(/^\[\[meta:(create|update|delete|info)]]\s*/i)
  if (!match) {
    return { cleaned: content, meta: null }
  }
  return {
    cleaned: content.replace(match[0], "").trim(),
    meta: match[1].toLowerCase() as ActionMeta,
  }
}

function actionMetaView(meta: ActionMeta, tr: (en: string, ru: string) => string) {
  if (meta === "create") return { label: tr("Event created", "Событие создано"), dot: "bg-emerald-500" }
  if (meta === "update") return { label: tr("Event updated", "Событие изменено"), dot: "bg-amber-500" }
  if (meta === "delete") return { label: tr("Event deleted", "Событие удалено"), dot: "bg-red-500" }
  return null
}

export function MessageBubble({ role, content, isStreaming, inputType = "text", actionMeta = null }: MessageBubbleProps) {
  const { tr } = useI18n()
  const isUser = role === "user"
  const isSystem = role === "system"
  const parsed = isUser ? { cleaned: content, meta: null as ActionMeta } : parseAssistantContent(content)
  const cleaned = parsed.cleaned
  const resolvedMeta = actionMeta || parsed.meta
  const metaView = actionMetaView(resolvedMeta, tr)

  if (isSystem) {
    return (
      <div className="mx-auto max-w-[80%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        <p className="whitespace-pre-wrap break-words">{cleaned}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary" : "bg-muted",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {isUser && inputType === "voice" && (
            <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px]">
              <Mic className="h-2.5 w-2.5" />
              {tr("Voice command", "Голосовая команда")}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">{cleaned}</p>
          {isStreaming && !cleaned && (
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:0.4s]" />
            </span>
          )}
        </div>
        {metaView && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", metaView.dot)} />
            <span>{metaView.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
