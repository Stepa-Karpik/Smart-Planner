"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, FileText, Loader2, MessageSquare, Mic, Plus, Send, Square, StopCircle, Upload } from "lucide-react"
import { toast } from "sonner"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useAiMessages, useAiSessions, ingestTask, transcribeVoice } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { useSseChat } from "@/lib/use-sse-chat"
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

export default function AiChatPage() {
  const { tr, locale } = useI18n()
  const { data: sessions, isLoading: sessionsLoading, mutate: mutateSessions } = useAiSessions()
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>()
  const { data: historyMessages } = useAiMessages(selectedSessionId)

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

  const [inputValue, setInputValue] = useState("")
  const [ingestText, setIngestText] = useState("")
  const [ingestLoading, setIngestLoading] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef("")
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!historyMessages) return

    loadMessages(
      historyMessages
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role as "user" | "assistant", content: item.content })),
      selectedSessionId,
    )
  }, [historyMessages, loadMessages, selectedSessionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      recognitionRef.current?.stop()
    }
  }, [])

  function handleNewChat() {
    setSelectedSessionId(undefined)
    setActiveSessionId(undefined)
    clearMessages()
  }

  async function sendUserMessage(text: string, inputType: "text" | "voice" = "text") {
    const payload = text.trim()
    if (!payload || isStreaming) return

    const sessionId = await sendMessage(payload, selectedSessionId || activeSessionId, { inputType })
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
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent/5",
                    selectedSessionId === session.id && "bg-accent/10 text-foreground font-medium",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{session.title || `Session ${session.id.slice(0, 8)}`}</span>
                </button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">{tr("No sessions yet", "Сессий пока нет")}</p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <Bot className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium text-foreground">AI Assistant</h3>
              <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
                {tr(
                  "Ask about your schedule, create tasks, or request optimization suggestions.",
                  "Спрашивайте про расписание, создавайте задачи и запрашивайте предложения по оптимизации.",
                )}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 max-w-2xl mx-auto">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  inputType={msg.inputType}
                  isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
                />
              ))}
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
