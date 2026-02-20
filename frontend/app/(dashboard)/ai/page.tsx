"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Bot, FileText, Loader2, MessageSquare, Mic, Plus, Send, Square, StopCircle, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  createAiSession,
  deleteAiSession,
  useAiMessages,
  useAiSessions,
  ingestTask,
  transcribeVoice,
  updateAssistantMode,
  useAssistantMode,
} from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { useSseChat } from "@/lib/use-sse-chat"
import type { AssistantMode } from "@/lib/types"
import { cn } from "@/lib/utils"

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition
    SpeechRecognition?: new () => SpeechRecognition
  }
}

interface SpeechRecognitionResultItem {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionResultItem
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

function pickString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function readOption(option: Record<string, unknown>) {
  const id = pickString(option, "id")
  const label = pickString(option, "label")
  if (!id || !label) return null
  return { id, label }
}

function readMemoryPrompt(item: Record<string, unknown>) {
  const prompt = pickString(item, "prompt_user")
  if (prompt) return prompt
  const key = pickString(item, "key")
  if (!key) return null
  return `Сохранить правило "${key}"?`
}

function readWarnings(plannerSummary: Record<string, unknown> | null | undefined): string[] {
  if (!plannerSummary) return []
  const warnings = plannerSummary["warnings"]
  if (!Array.isArray(warnings)) return []
  return warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function chatTypeLabel(chatType: "planner" | "companion", tr: (en: string, ru: string) => string) {
  return chatType === "planner" ? tr("Planner", "Planner") : tr("Companion", "Companion")
}

export default function AiChatPage() {
  const { tr, locale } = useI18n()
  const { data: sessions, isLoading: sessionsLoading, mutate: mutateSessions } = useAiSessions()
  const { data: assistantModeState, isLoading: assistantModeLoading, mutate: mutateAssistantMode } = useAssistantMode()
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>()

  const {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
    activeSessionId,
    setActiveSessionId,
  } = useSseChat()
  const { data: historyMessages } = useAiMessages(selectedSessionId || activeSessionId)

  const [inputValue, setInputValue] = useState("")
  const [ingestText, setIngestText] = useState("")
  const [ingestLoading, setIngestLoading] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")
  const [selectedMode, setSelectedMode] = useState<AssistantMode>("AUTO")
  const [modeUpdating, setModeUpdating] = useState(false)
  const [showModeHint, setShowModeHint] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef("")
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedSessionId = selectedSessionId || activeSessionId

  const selectedSession = useMemo(() => {
    if (!sessions || !resolvedSessionId) return undefined
    return sessions.find((item) => item.id === resolvedSessionId)
  }, [sessions, resolvedSessionId])

  const selectedChatType = selectedSession?.chat_type || assistantModeState?.active_chat_type || null

  const uiMessages = useMemo(() => {
    return messages.filter((item, index) => {
      const currentReason = item.meta?.fallbackReasonCode
      if (!currentReason) return true
      const prev = messages[index - 1]
      if (!prev || prev.meta?.fallbackReasonCode !== currentReason) return true
      return prev.content !== item.content
    })
  }, [messages])

  useEffect(() => {
    if (!historyMessages) return

    loadMessages(
      historyMessages
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role as "user" | "assistant", content: item.content })),
      resolvedSessionId,
    )
  }, [historyMessages, loadMessages, resolvedSessionId])

  useEffect(() => {
    if (!assistantModeState?.default_mode) return
    setSelectedMode(assistantModeState.default_mode)
  }, [assistantModeState?.default_mode])

  useEffect(() => {
    if (!assistantModeState?.active_session_id) return
    if (!selectedSessionId) {
      setSelectedSessionId(assistantModeState.active_session_id)
    }
    if (!activeSessionId) {
      setActiveSessionId(assistantModeState.active_session_id)
    }
    if (sessions && !sessions.some((item) => item.id === assistantModeState.active_session_id)) {
      void mutateSessions()
    }
  }, [assistantModeState?.active_session_id, selectedSessionId, activeSessionId, sessions, mutateSessions, setActiveSessionId])

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = "sp_assistant_mode_hint_seen"
    const seen = window.localStorage.getItem(key)
    if (!seen) {
      setShowModeHint(true)
      window.localStorage.setItem(key, "1")
    }
  }, [])

  useEffect(() => {
    if (!showModeHint) return
    const timer = setTimeout(() => setShowModeHint(false), 8000)
    return () => clearTimeout(timer)
  }, [showModeHint])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [uiMessages])

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      recognitionRef.current?.stop()
    }
  }, [])

  async function handleNewChat() {
    const preferredType =
      selectedMode === "PLANNER"
        ? "planner"
        : selectedMode === "COMPANION"
          ? "companion"
          : selectedChatType || undefined
    const res = await createAiSession(preferredType)
    if (res.error || !res.data) {
      toast.error(res.error?.message || tr("Failed to create chat", "Не удалось создать чат"))
      return
    }
    await mutateSessions()
    clearMessages()
    setSelectedSessionId(res.data.id)
    setActiveSessionId(res.data.id)
  }

  async function handleDeleteChat(sessionIdToDelete: string) {
    const res = await deleteAiSession(sessionIdToDelete)
    if (res.error) {
      toast.error(res.error.message || tr("Failed to delete chat", "Не удалось удалить чат"))
      return
    }

    const currentId = selectedSessionId || activeSessionId
    const nextSessions = (sessions || []).filter((item) => item.id !== sessionIdToDelete)
    if (currentId === sessionIdToDelete) {
      const fallback = nextSessions[0]
      if (fallback) {
        clearMessages()
        setSelectedSessionId(fallback.id)
        setActiveSessionId(fallback.id)
      } else {
        setSelectedSessionId(undefined)
        setActiveSessionId(undefined)
        clearMessages()
      }
    }

    await mutateSessions()
  }

  async function handleModeChange(nextMode: string) {
    if (!nextMode) return
    const mode = nextMode as AssistantMode
    if (mode === selectedMode) return
    const previousMode = selectedMode
    setSelectedMode(mode)
    setModeUpdating(true)

    const targetChatType =
      mode === "PLANNER" ? "planner" : mode === "COMPANION" ? "companion" : null
    const currentSessionId = selectedSessionId || activeSessionId
    const hasMessages = (historyMessages?.length || 0) > 0
    let createNewChat = false
    let res = await updateAssistantMode({
      defaultMode: mode,
      sessionId: currentSessionId,
      createNewChat: false,
    })

    if (res.error && res.error.code === "conflict" && targetChatType && hasMessages) {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          tr(
            "Current chat is not empty. Create a new chat for this mode?",
            "Текущий чат не пустой. Создать новый чат для этого режима?",
          ),
        )
        if (!confirmed) {
          setSelectedMode(previousMode)
          setModeUpdating(false)
          return
        }
      }
      createNewChat = true
      res = await updateAssistantMode({
        defaultMode: mode,
        sessionId: currentSessionId,
        createNewChat: true,
      })
    }

    setModeUpdating(false)
    if (res.error || !res.data) {
      setSelectedMode(previousMode)
      toast.error(res.error?.message || tr("Failed to update mode", "Не удалось сменить режим"))
      return
    }

    setSelectedMode(res.data.default_mode)
    if (res.data.active_session_id) {
      if (createNewChat) {
        clearMessages()
      }
      setSelectedSessionId(res.data.active_session_id)
      setActiveSessionId(res.data.active_session_id)
    }
    await mutateSessions()
    mutateAssistantMode()
    toast.success(tr("Mode changed", "Режим изменён"))
  }

  async function handleOptionSelect(option: { id: string; label: string }) {
    await sendUserMessage(option.label, "text", option.id)
  }

  async function handleMemoryDecision(accept: boolean) {
    await sendUserMessage(accept ? "yes" : "no")
  }

  async function sendUserMessage(
    text: string,
    inputType: "text" | "voice" = "text",
    selectedOptionId?: string,
  ) {
    const payload = text.trim()
    if (!payload || isStreaming) return

    const chatType =
      selectedSession?.chat_type ||
      (selectedMode === "PLANNER" ? "planner" : selectedMode === "COMPANION" ? "companion" : undefined)

    const sessionId = await sendMessage(payload, selectedSessionId || activeSessionId, {
      inputType,
      selectedOptionId,
      chatType,
    })
    if (sessionId) {
      setSelectedSessionId(sessionId)
      setActiveSessionId(sessionId)
    }
    mutateSessions()
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    const text = inputValue.trim()
    if (!text || isStreaming) return

    setInputValue("")
    await sendUserMessage(text, "text")
  }

  async function handleIngest(event: React.FormEvent) {
    event.preventDefault()
    if (!ingestText.trim()) return

    setIngestLoading(true)
    const res = await ingestTask(ingestText)
    setIngestLoading(false)

    if (res.error) {
      toast.error(res.error.message)
      return
    }

    toast.success(tr("Task sent to AI worker", "Задача отправлена в AI worker"))
    setIngestText("")
    setIngestOpen(false)
  }

  async function handleVoiceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setVoiceLoading(true)
    const res = await transcribeVoice(file)
    setVoiceLoading(false)

    if (res.error) {
      toast.error(res.error.message)
    } else if (res.data?.text) {
      await sendUserMessage(res.data.text, "voice")
    }

    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
    if (typeof window === "undefined") return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  }

  async function stopRealtimeVoice() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    recognitionRef.current?.stop()
  }

  async function startRealtimeVoice() {
    if (isStreaming) return

    const RecognitionCtor = getSpeechRecognitionCtor()
    if (!RecognitionCtor) {
      toast.error(tr("Realtime speech is not supported by your browser", "Ваш браузер не поддерживает realtime-распознавание речи"))
      return
    }

    if (recognitionRef.current) {
      await stopRealtimeVoice()
      return
    }

    finalTranscriptRef.current = ""
    setLiveTranscript("")

    const recognition = new RecognitionCtor()
    recognition.lang = locale === "ru" ? "ru-RU" : "en-US"
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onerror = () => {
      setIsListening(false)
      recognitionRef.current = null
      toast.error(tr("Failed to recognize speech", "Не удалось распознать речь"))
    }

    recognition.onresult = (resultEvent) => {
      let interim = ""
      for (let i = resultEvent.resultIndex; i < resultEvent.results.length; i++) {
        const result = resultEvent.results[i]
        const transcript = result[0]?.transcript || ""
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim()
        } else {
          interim += transcript
        }
      }

      const combined = `${finalTranscriptRef.current} ${interim}`.trim()
      setLiveTranscript(combined)

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
      }
      if (combined) {
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop()
        }, 2300)
      }
    }

    recognition.onend = async () => {
      setIsListening(false)
      recognitionRef.current = null
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      const finalText = finalTranscriptRef.current.trim()
      finalTranscriptRef.current = ""
      setLiveTranscript("")
      if (!finalText) return

      await sendUserMessage(finalText, "voice")
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <div className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="flex items-center justify-between px-3 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Sessions", "Сессии")}</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            <span className="sr-only">{tr("New chat", "Новый чат")}</span>
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {sessionsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)
            ) : sessions && sessions.length > 0 ? (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-accent/5",
                    resolvedSessionId === session.id && "bg-accent/10",
                  )}
                >
                  <button
                    onClick={() => setSelectedSessionId(session.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        #{session.display_index} {chatTypeLabel(session.chat_type, tr)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{session.id.slice(0, 8)}</p>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDeleteChat(session.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">{tr("Delete chat", "Удалить чат")}</span>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">{tr("No sessions yet", "Сессий пока нет")}</p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="border-b bg-card/60 px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Mode", "Режим")}</span>
              <ToggleGroup
                type="single"
                value={selectedMode}
                onValueChange={handleModeChange}
                disabled={modeUpdating || assistantModeLoading}
                className="rounded-xl border bg-background p-1"
              >
                <ToggleGroupItem value="AUTO" className="h-8 rounded-lg px-3 text-xs">
                  Auto
                </ToggleGroupItem>
                <ToggleGroupItem value="PLANNER" className="h-8 rounded-lg px-3 text-xs">
                  Planner
                </ToggleGroupItem>
                <ToggleGroupItem value="COMPANION" className="h-8 rounded-lg px-3 text-xs">
                  Companion
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-2">
              {selectedChatType && (
                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                  {tr("Chat type", "Тип чата")}: {chatTypeLabel(selectedChatType, tr)}
                </span>
              )}
              {selectedMode === "PLANNER" && (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                  {tr("Planning mode active", "Режим планирования активен")}
                </span>
              )}
            </div>
          </div>
          {showModeHint && (
            <div className="mx-auto mt-2 w-full max-w-2xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {tr(
                "Tip: switch mode anytime. AUTO chooses automatically, PLANNER focuses on schedule, COMPANION is universal.",
                "Подсказка: режим можно менять в любой момент. AUTO выбирает сам, PLANNER фокусируется на расписании, COMPANION — универсальный помощник.",
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 p-4">
          {uiMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Bot className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium text-foreground">AI Assistant</h3>
              <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
                {tr(
                  "Ask about your schedule, create tasks, or request optimization suggestions.",
                  "Спрашивайте про расписание, создавайте задачи и запрашивайте предложения по оптимизации.",
                )}
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {uiMessages.map((msg, i) => {
                const options = (msg.meta?.options || [])
                  .map((item) => (typeof item === "object" && item ? readOption(item as Record<string, unknown>) : null))
                  .filter((item): item is { id: string; label: string } => item !== null)
                const memoryPrompts = (msg.meta?.memorySuggestions || [])
                  .map((item) => (typeof item === "object" && item ? readMemoryPrompt(item as Record<string, unknown>) : null))
                  .filter((item): item is string => !!item)
                const warnings = readWarnings(msg.meta?.plannerSummary || null)
                const conflictsCount = Array.isArray(msg.meta?.plannerSummary?.["conflicts"])
                  ? msg.meta?.plannerSummary?.["conflicts"]?.length || 0
                  : 0
                const travelNotes = Array.isArray(msg.meta?.plannerSummary?.["travel_time_notes"])
                  ? (msg.meta?.plannerSummary?.["travel_time_notes"] as unknown[]).filter(
                      (item): item is string => typeof item === "string" && item.trim().length > 0,
                    )
                  : []

                return (
                  <div key={i} className="space-y-2">
                    <MessageBubble
                      role={msg.role}
                      content={msg.content}
                      inputType={msg.inputType}
                      isStreaming={isStreaming && i === uiMessages.length - 1 && msg.role === "assistant"}
                    />

                    {msg.role === "assistant" && msg.meta?.fallbackReasonCode && (
                      <div className="ml-10 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        <div className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {tr("Degraded mode", "Режим деградации")}
                        </div>
                      </div>
                    )}

                    {msg.role === "assistant" && msg.meta?.requiresUserInput && msg.meta?.clarifyingQuestion && (
                      <div className="ml-10 rounded-lg border bg-card px-3 py-2 text-sm">
                        {msg.meta.clarifyingQuestion}
                      </div>
                    )}

                    {msg.role === "assistant" && options.length > 0 && (
                      <div className="ml-10 flex flex-wrap gap-2">
                        {options.map((option) => (
                          <Button key={option.id} type="button" variant="outline" size="sm" onClick={() => handleOptionSelect(option)}>
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {msg.role === "assistant" && memoryPrompts.length > 0 && (
                      <div className="ml-10 rounded-lg border bg-card px-3 py-2">
                        <p className="text-xs text-muted-foreground">{memoryPrompts[0]}</p>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" size="sm" onClick={() => handleMemoryDecision(true)}>
                            {tr("Yes", "Да")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleMemoryDecision(false)}>
                            {tr("No", "Нет")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {msg.role === "assistant" && (warnings.length > 0 || conflictsCount > 0 || travelNotes.length > 0) && (
                      <div className="ml-10 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-900 dark:text-orange-200">
                        <div className="space-y-1">
                          {conflictsCount > 0 && <p>{tr("Conflicts", "Конфликты")}: {conflictsCount}</p>}
                          {travelNotes.length > 0 && <p>{tr("Travel risk notes available", "Есть примечания по маршруту")}</p>}
                          {warnings.length > 0 && <p>{warnings[0]}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="border-t bg-card/80 backdrop-blur-sm p-3">
          <form onSubmit={handleSend} className="flex flex-col gap-2 max-w-2xl mx-auto">
            {isListening && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1.5 text-red-500">
                  <Mic className="h-3.5 w-3.5" />
                  {tr("Listening... pause 2-3 sec to auto-send", "Слушаю... сделайте паузу 2-3 сек, и команда отправится")}
                </div>
                {liveTranscript && <div className="mt-1 text-foreground">{liveTranscript}</div>}
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex gap-1">
                <Dialog open={ingestOpen} onOpenChange={setIngestOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                      <FileText className="h-4 w-4" />
                      <span className="sr-only">{tr("Ingest task", "Импорт задачи")}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>{tr("Ingest task", "Импорт задачи")}</DialogTitle>
                      <DialogDescription className="sr-only">
                        {tr("Paste text to send it to the assistant for processing.", "Вставьте текст, чтобы отправить его ассистенту на обработку.")}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleIngest} className="flex flex-col gap-3">
                      <Textarea
                        value={ingestText}
                        onChange={(e) => setIngestText(e.target.value)}
                        placeholder={tr("Paste text for AI processing...", "Вставьте текст для обработки AI...")}
                        rows={4}
                      />
                      <Button type="submit" size="sm" disabled={ingestLoading}>
                        {ingestLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                        {tr("Send", "Отправить")}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <Button
                  type="button"
                  variant={isListening ? "default" : "ghost"}
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", isListening && "bg-red-600 hover:bg-red-700")}
                  onClick={isListening ? stopRealtimeVoice : startRealtimeVoice}
                >
                  {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span className="sr-only">{tr("Realtime voice", "Realtime голос")}</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={voiceLoading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {voiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="sr-only">{tr("Upload audio file", "Загрузить аудиофайл")}</span>
                </Button>
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
              </div>

              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={tr("Type a message...", "Введите сообщение...")}
                className="flex-1 h-9"
                disabled={isStreaming}
              />

              {isStreaming ? (
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={stopStreaming}>
                  <StopCircle className="h-4 w-4" />
                  <span className="sr-only">{tr("Stop", "Стоп")}</span>
                </Button>
              ) : (
                <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!inputValue.trim()}>
                  <Send className="h-4 w-4" />
                  <span className="sr-only">{tr("Send", "Отправить")}</span>
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
