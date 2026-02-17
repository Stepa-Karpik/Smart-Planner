"use client"

import { useState, useCallback, useRef } from "react"
import { getAccessToken } from "./api-client"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

interface StreamMessage {
  role: "user" | "assistant"
  content: string
  inputType?: "text" | "voice"
}

export function useSseChat() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (
    text: string,
    sessionId?: string,
    options?: { inputType?: "text" | "voice" }
  ): Promise<string | undefined> => {
    const resolvedSessionId = sessionId ?? activeSessionId

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: text, inputType: options?.inputType || "text" }])

    // Start streaming
    setIsStreaming(true)
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])
    let streamSessionId: string | undefined = resolvedSessionId

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/api/v1/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, session_id: resolvedSessionId }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: "Error: Failed to get response" }
          return updated
        })
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE data
        const lines = chunk.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.session_id && typeof parsed.session_id === "string") {
                streamSessionId = parsed.session_id
              }
              if (parsed.token) {
                accumulated += `${parsed.token} `
              } else if (parsed.content) {
                accumulated += parsed.content
              } else if (typeof parsed === "string") {
                accumulated += parsed
              }
            } catch {
              // Plain text SSE
              accumulated += data
            }
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: "assistant", content: accumulated }
              return updated
            })
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled
      } else {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: "Error: Connection lost" }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      if (streamSessionId) {
        setActiveSessionId(streamSessionId)
      }
    }
    return streamSessionId
  }, [activeSessionId])

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
