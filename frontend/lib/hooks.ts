"use client"

import useSWR, { mutate as globalMutate } from "swr"
import {
  adminCreateFeedItem,
  adminDeleteFeedItem,
  adminListFeedItems,
  adminListUsers,
  adminUpdateFeedItem,
  adminUpdateUser,
  apiRequest,
  completeLoginTwofaTelegram,
  getFeedItems,
  disableTotpTwofa,
  getLoginTwofaSessionStatus,
  getTwofaPendingStatus,
  getTwofaSettings,
  requestDisableTelegramTwofa,
  requestEnableTelegramTwofa,
  requestLoginTwofaTelegram,
  setupTotpTwofa,
  verifyLoginTwofaTotp,
  verifyTotpTwofaSetup,
} from "./api-client"
import type {
  AdminFeedItemCreate,
  AdminFeedItemUpdate,
  AdminFeedQuery,
  AdminUser,
  AdminUserUpdate,
  AssistantMode,
  AssistantModeState,
  AiChatResponse,
  AiMessage,
  AiSession,
  Calendar,
  CalendarCreate,
  CalendarEvent,
  CalendarUpdate,
  EventCreate,
  EventsQuery,
  EventUpdate,
  FeedItem,
  FeedItemType,
  FeasibilityResult,
  LocationSuggestion,
  Profile,
  ProfileUpdate,
  Reminder,
  ReminderCreate,
  RoutesConfig,
  RouteMode,
  RoutePreview,
  RouteRecommendation,
  TelegramStartPayload,
  TelegramStatus,
  LoginTwoFASessionStatusPayload,
  TotpSetupPayload,
  TwoFAPendingStatusPayload,
  TwoFASettings,
  TwoFATelegramPending,
} from "./types"

async function fetcher<T>(path: string): Promise<T> {
  const envelope = await apiRequest<T>(path)
  if (envelope.error) {
    throw new Error(envelope.error.message)
  }
  return envelope.data as T
}

function eventsKey(query: EventsQuery) {
  const params = new URLSearchParams()
  params.set("from", query.from)
  params.set("to", query.to)
  if (query.calendar_id) params.set("calendar_id", query.calendar_id)
  if (query.status) params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.offset !== undefined) params.set("offset", String(query.offset))
  return `/api/v1/events?${params.toString()}`
}

function adminUsersKey(params?: { q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams()
  if (params?.q) qs.set("q", params.q)
  if (params?.limit !== undefined) qs.set("limit", String(params.limit))
  if (params?.offset !== undefined) qs.set("offset", String(params.offset))
  return `/api/v1/admin/users${qs.toString() ? `?${qs.toString()}` : ""}`
}

function adminFeedKey(params?: AdminFeedQuery) {
  const qs = new URLSearchParams()
  if (params?.q) qs.set("q", params.q)
  if (params?.limit !== undefined) qs.set("limit", String(params.limit))
  if (params?.offset !== undefined) qs.set("offset", String(params.offset))
  if (params?.target_username !== undefined && params.target_username !== null) {
    qs.set("target_username", params.target_username)
  }
  if (params?.types) {
    for (const type of params.types) qs.append("types", type)
  }
  return `/api/v1/admin/feed${qs.toString() ? `?${qs.toString()}` : ""}`
}

function feedKey(params?: { types?: FeedItemType[]; limit?: number; offset?: number }) {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined) qs.set("limit", String(params.limit))
  if (params?.offset !== undefined) qs.set("offset", String(params.offset))
  if (params?.types) {
    for (const type of params.types) qs.append("types", type)
  }
  return `/api/v1/feed${qs.toString() ? `?${qs.toString()}` : ""}`
}

export function useCalendars() {
  return useSWR<Calendar[]>("/api/v1/calendars", fetcher)
}

export async function createCalendar(data: CalendarCreate) {
  const res = await apiRequest<Calendar>("/api/v1/calendars", {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate("/api/v1/calendars")
  }
  return res
}

export async function updateCalendar(id: string, data: CalendarUpdate) {
  const res = await apiRequest<Calendar>(`/api/v1/calendars/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate("/api/v1/calendars")
  }
  return res
}

export async function deleteCalendar(id: string) {
  const res = await apiRequest(`/api/v1/calendars/${id}`, { method: "DELETE" })
  if (!res.error) {
    globalMutate("/api/v1/calendars")
  }
  return res
}

export function useEvents(query: EventsQuery) {
  return useSWR<CalendarEvent[]>(eventsKey(query), fetcher)
}

export function useEvent(id: string | undefined) {
  return useSWR<CalendarEvent>(id ? `/api/v1/events/${id}` : null, fetcher)
}

export async function createEvent(data: EventCreate) {
  const res = await apiRequest<CalendarEvent>("/api/v1/events", {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/v1/events"), undefined, { revalidate: true })
  }
  return res
}

export async function updateEvent(id: string, data: EventUpdate) {
  const res = await apiRequest<CalendarEvent>(`/api/v1/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/v1/events"), undefined, { revalidate: true })
  }
  return res
}

export async function deleteEvent(id: string) {
  const res = await apiRequest(`/api/v1/events/${id}`, { method: "DELETE" })
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/v1/events"), undefined, { revalidate: true })
  }
  return res
}

export function useReminders(eventId: string | undefined) {
  return useSWR<Reminder[]>(eventId ? `/api/v1/events/${eventId}/reminders` : null, fetcher)
}

export async function createReminder(eventId: string, data: ReminderCreate) {
  const res = await apiRequest<Reminder>(`/api/v1/events/${eventId}/reminders`, {
    method: "POST",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate(`/api/v1/events/${eventId}/reminders`)
  }
  return res
}

export async function deleteReminder(reminderId: string, eventId: string) {
  const res = await apiRequest(`/api/v1/reminders/${reminderId}`, { method: "DELETE" })
  if (!res.error) {
    globalMutate(`/api/v1/events/${eventId}/reminders`)
  }
  return res
}

export function useTelegramStatus() {
  return useSWR<TelegramStatus>("/api/v1/integrations/telegram/status", fetcher)
}

export function useTwofaSettings() {
  return useSWR<TwoFASettings>("/api/v1/integrations/twofa", fetcher)
}

export async function startTelegramLink() {
  return apiRequest<TelegramStartPayload>("/api/v1/integrations/telegram/start", { method: "POST" })
}

export async function unlinkTelegram() {
  const res = await apiRequest("/api/v1/integrations/telegram", { method: "DELETE" })
  if (!res.error) {
    globalMutate("/api/v1/integrations/telegram/status")
  }
  return res
}

export async function enableTelegramTwofaRequest() {
  const res = await requestEnableTelegramTwofa()
  if (!res.error) {
    globalMutate("/api/v1/integrations/twofa")
  }
  return res
}

export async function disableTelegramTwofaRequest() {
  const res = await requestDisableTelegramTwofa()
  if (!res.error) {
    globalMutate("/api/v1/integrations/twofa")
  }
  return res
}

export async function fetchTwofaPendingStatus(pendingId: string) {
  return getTwofaPendingStatus(pendingId)
}

export async function startTotpTwofaSetup() {
  return setupTotpTwofa()
}

export async function confirmTotpTwofaSetup(pendingId: string, code: string) {
  const res = await verifyTotpTwofaSetup(pendingId, code)
  if (!res.error) {
    globalMutate("/api/v1/integrations/twofa")
  }
  return res
}

export async function disableTotpTwofaByCode(code: string) {
  const res = await disableTotpTwofa(code)
  if (!res.error) {
    globalMutate("/api/v1/integrations/twofa")
  }
  return res
}

export async function requestLoginTelegramTwofa(twofaSessionId: string) {
  return requestLoginTwofaTelegram(twofaSessionId)
}

export async function fetchLoginTwofaSessionStatus(twofaSessionId: string) {
  return getLoginTwofaSessionStatus(twofaSessionId)
}

export async function completeTelegramTwofaLogin(twofaSessionId: string) {
  return completeLoginTwofaTelegram(twofaSessionId)
}

export async function verifyTotpTwofaLogin(twofaSessionId: string, code: string) {
  return verifyLoginTwofaTotp(twofaSessionId, code)
}

export async function fetchLocationSuggestions(query: string, limit = 8, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return apiRequest<LocationSuggestion[]>(`/api/v1/routes/locations/suggest?${params.toString()}`, { signal })
}

export async function reverseGeocode(lat: number, lon: number) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  return apiRequest<{ label: string | null; lat: number; lon: number }>(`/api/v1/routes/locations/reverse?${params.toString()}`)
}

export async function fetchRoutePreview(from: string, to: string, mode: RouteMode, departureAt?: string) {
  const params = new URLSearchParams({ from, to, mode })
  if (departureAt) {
    params.set("departure_at", departureAt)
  }
  return apiRequest<RoutePreview>(`/api/v1/routes/preview?${params.toString()}`)
}

export async function fetchRouteRecommendations(params: {
  from: string
  to: string
  modes?: RouteMode[]
  mode?: RouteMode
  departure_at?: string
}) {
  const qs = new URLSearchParams({ from: params.from, to: params.to })
  if (params.departure_at) {
    qs.set("departure_at", params.departure_at)
  }

  if (params.modes && params.modes.length > 0) {
    for (const mode of params.modes) {
      qs.append("modes", mode)
    }
  } else if (params.mode) {
    qs.set("mode", params.mode)
  }

  return apiRequest<RouteRecommendation[]>(`/api/v1/routes/recommendations?${qs.toString()}`)
}

export function useRoutesConfig() {
  return useSWR<RoutesConfig>("/api/v1/routes/config", fetcher)
}

export async function fetchFeasibility(from: string, to: string, mode: RouteMode) {
  const params = new URLSearchParams({ from, to, mode })
  return apiRequest<FeasibilityResult>(`/api/v1/schedule/feasibility?${params.toString()}`)
}

export function useProfile() {
  return useSWR<Profile>("/api/v1/profile", fetcher)
}

export async function updateProfile(data: ProfileUpdate) {
  const res = await apiRequest<Profile>("/api/v1/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
  if (!res.error) {
    globalMutate("/api/v1/profile")
  }
  return res
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ ok: boolean }>("/api/v1/profile/password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}

export function useFeed(params?: { types?: FeedItemType[]; limit?: number; offset?: number }) {
  const key = feedKey(params)
  return useSWR<FeedItem[]>(key, () =>
    getFeedItems({
      types: params?.types,
      limit: params?.limit,
      offset: params?.offset,
    }).then((envelope) => {
      if (envelope.error) throw new Error(envelope.error.message)
      return envelope.data ?? []
    }),
  )
}

export function useAdminUsers(params?: { q?: string; limit?: number; offset?: number }) {
  const key = adminUsersKey(params)
  return useSWR<AdminUser[]>(key, () =>
    adminListUsers(params ?? {}).then((envelope) => {
      if (envelope.error) throw new Error(envelope.error.message)
      return envelope.data ?? []
    }),
  )
}

export async function updateAdminUser(userId: string, data: AdminUserUpdate) {
  const res = await adminUpdateUser(userId, data)
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/v1/admin/users"), undefined, { revalidate: true })
    globalMutate("/api/v1/profile")
  }
  return res
}

export function useAdminFeed(params?: AdminFeedQuery) {
  const key = adminFeedKey(params)
  return useSWR<FeedItem[]>(key, () =>
    adminListFeedItems(params ?? {}).then((envelope) => {
      if (envelope.error) throw new Error(envelope.error.message)
      return envelope.data ?? []
    }),
  )
}

export async function createAdminFeedItem(data: AdminFeedItemCreate) {
  const res = await adminCreateFeedItem(data)
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && (key.startsWith("/api/v1/admin/feed") || key.startsWith("/api/v1/feed")), undefined, {
      revalidate: true,
    })
  }
  return res
}

export async function patchAdminFeedItem(itemId: string, data: AdminFeedItemUpdate) {
  const res = await adminUpdateFeedItem(itemId, data)
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && (key.startsWith("/api/v1/admin/feed") || key.startsWith("/api/v1/feed")), undefined, {
      revalidate: true,
    })
  }
  return res
}

export async function removeAdminFeedItem(itemId: string) {
  const res = await adminDeleteFeedItem(itemId)
  if (!res.error) {
    globalMutate((key: string) => typeof key === "string" && (key.startsWith("/api/v1/admin/feed") || key.startsWith("/api/v1/feed")), undefined, {
      revalidate: true,
    })
  }
  return res
}

export function useAiSessions() {
  return useSWR<AiSession[]>("/api/v1/ai/sessions", fetcher)
}

export function useAiMessages(sessionId: string | undefined) {
  return useSWR<AiMessage[]>(sessionId ? `/api/v1/ai/sessions/${sessionId}/messages` : null, fetcher)
}

export async function sendAiChat(message: string, sessionId?: string, selectedOptionId?: string) {
  return apiRequest<AiChatResponse>("/api/v1/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      session_id: sessionId,
      selected_option_id: selectedOptionId,
    }),
  })
}

export function useAssistantMode() {
  return useSWR<AssistantModeState>("/api/v1/ai/mode", fetcher)
}

export async function updateAssistantMode(params: {
  defaultMode: AssistantMode
  sessionId?: string
  createNewChat?: boolean
}) {
  const res = await apiRequest<AssistantModeState>("/api/v1/ai/mode", {
    method: "PATCH",
    body: JSON.stringify({
      default_mode: params.defaultMode,
      session_id: params.sessionId,
      create_new_chat: !!params.createNewChat,
    }),
  })
  if (!res.error) {
    globalMutate("/api/v1/ai/mode")
  }
  return res
}

export async function createAiSession(chatType?: "planner" | "companion") {
  const res = await apiRequest<AiSession>("/api/v1/ai/sessions", {
    method: "POST",
    body: JSON.stringify({
      chat_type: chatType ?? null,
    }),
  })
  if (!res.error) {
    globalMutate("/api/v1/ai/sessions")
  }
  return res
}

export async function deleteAiSession(sessionId: string) {
  const res = await apiRequest<AiSession>(`/api/v1/ai/sessions/${sessionId}`, {
    method: "DELETE",
  })
  if (!res.error) {
    globalMutate("/api/v1/ai/sessions")
  }
  return res
}

export async function ingestTask(text: string) {
  return apiRequest<{ status: string }>("/api/v1/ai/ingest-task", {
    method: "POST",
    body: JSON.stringify({
      source: "web_text",
      payload_ref: "frontend_manual_input",
      text,
    }),
  })
}

export async function transcribeVoice(file: File) {
  const formData = new FormData()
  formData.append("file", file)
  return apiRequest<{ text: string }>("/api/v1/ai/voice/transcribe", {
    method: "POST",
    body: formData,
  })
}
