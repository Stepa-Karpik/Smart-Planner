"use client"

import { useCallback, useRef, useState } from "react"

import { apiRequest } from "./api-client"
import type { AiChatResponse, AssistantMode } from "./types"

type MessageRole = "user" | "assistant" | "system"

export interface ChatUiMeta {
  mode?: AssistantMode | null
  chatType?: "planner" | "companion" | null
  intent?: string | null
  fallbackReasonCode?: string | null
  requiresUserInput?: boolean
  clarifyingQuestion?: string | null
  options?: Array<Record<string, unknown>>
  memorySuggestions?: Array<Record<string, unknown>>
  plannerSummary?: Record<string, unknown> | null
}

export interface StreamMessage {
  role: MessageRole
  content: string
  inputType?: "text" | "voice"
  meta?: ChatUiMeta
}

export function useSseChat() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (
      text: string,
      sessionId?: string,
      options?: { inputType?: "text" | "voice"; selectedOptionId?: string; chatType?: "planner" | "companion" },
    ): Promise<string | undefined> => {
      const resolvedSessionId = sessionId ?? activeSessionId
      const payload = text.trim()
      if (!payload) return resolvedSessionId

      setMessages((prev) => [...prev, { role: "user", content: payload, inputType: options?.inputType || "text" }])
      setIsStreaming(true)

      try {
        const controller = new AbortController()
        abortRef.current = controller

        const response = await apiRequest<AiChatResponse>("/api/v1/ai/chat", {
          method: "POST",
          body: JSON.stringify({
              message: payload,
              session_id: resolvedSessionId,
              chat_type: options?.chatType,
              selected_option_id: options?.selectedOptionId,
            }),
          signal: controller.signal,
        })

        if (response.error || !response.data) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: response.error?.message || "Failed to get AI response.",
            },
          ])
          return resolvedSessionId
        }

        const data = response.data
        const nextMessage: StreamMessage = {
          role: "assistant",
          content: data.answer || "",
          meta: {
            mode: data.mode || null,
            chatType: data.chat_type || null,
            intent: data.intent || null,
            fallbackReasonCode: data.fallback_reason_code || null,
            requiresUserInput: !!data.requires_user_input,
            clarifyingQuestion: data.clarifying_question || null,
            options: Array.isArray(data.options) ? data.options : [],
            memorySuggestions: Array.isArray(data.memory_suggestions) ? data.memory_suggestions : [],
            plannerSummary: typeof data.planner_summary === "object" && data.planner_summary ? data.planner_summary : null,
          },
        }

        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (
            last &&
            last.role === "assistant" &&
            last.content === nextMessage.content &&
            last.meta?.fallbackReasonCode &&
            last.meta.fallbackReasonCode === nextMessage.meta?.fallbackReasonCode
          ) {
            return prev
          }
          return [...prev, nextMessage]
        })

        setActiveSessionId(data.session_id || resolvedSessionId)
        return data.session_id || resolvedSessionId
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setMessages((prev) => [...prev, { role: "system", content: "Connection lost. Please retry." }])
        }
        return resolvedSessionId
      } finally {
        abortRef.current = null
        setIsStreaming(false)
      }
    },
    [activeSessionId],
  )

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setActiveSessionId(undefined)
  }, [])

  const loadMessages = useCallback((msgs: StreamMessage[], sessionId?: string) => {
    setMessages(msgs)
    setActiveSessionId(sessionId)
  }, [])

  return { messages, isStreaming, sendMessage, stopStreaming, clearMessages, loadMessages, activeSessionId, setActiveSessionId }
}
