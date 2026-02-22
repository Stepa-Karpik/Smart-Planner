export interface ApiEnvelope<T> {
  data: T | null
  meta: {
    server_time?: string
    request_id?: string
    pagination?: {
      total?: number
      limit?: number
      offset?: number
    }
  }
  error: ApiError | null
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type?: string
}

export interface AuthPayload {
  user_id: string
  email: string
  username: string
  display_name?: string | null
  default_route_mode?: RouteMode
  map_provider?: MapProvider
  tokens: AuthTokens
}

export interface User {
  id: string
  email: string
  username: string
}

export type EventStatus = "planned" | "done" | "canceled"
export type EventPriority = 0 | 1 | 2 | 3

export interface Calendar {
  id: string
  title: string
  color: string
  is_default: boolean
}

export interface CalendarCreate {
  title: string
  color?: string
}

export interface CalendarUpdate {
  title?: string
  color?: string
}

export interface CalendarEvent {
  id: string
  calendar_id: string
  title: string
  description?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_source?: string
  start_at: string
  end_at: string
  all_day: boolean
  status: EventStatus
  priority: EventPriority
  deleted_at?: string | null
}

export interface EventCreate {
  calendar_id?: string
  title: string
  description?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_source?: string
  start_at: string
  end_at?: string
  all_day?: boolean
  status?: EventStatus
  priority?: EventPriority
}

export interface EventUpdate {
  title?: string
  description?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_source?: string
  start_at?: string
  end_at?: string
  all_day?: boolean
  status?: EventStatus
  priority?: EventPriority
  calendar_id?: string
}

export interface EventsQuery {
  from: string
  to: string
  calendar_id?: string
  status?: EventStatus
  q?: string
  limit?: number
  offset?: number
}

export type ReminderStatus = "scheduled" | "sent" | "failed" | "canceled"

export interface Reminder {
  id: string
  event_id: string
  offset_minutes: number
  scheduled_at: string
  status: ReminderStatus
  last_error?: string | null
}

export interface ReminderCreate {
  offset_minutes: number
}

export interface TelegramStatus {
  is_linked: boolean
  is_confirmed: boolean
  telegram_chat_id?: number | null
  telegram_username?: string | null
}

export interface TelegramStartPayload {
  deep_link: string
  desktop_link: string
  expires_at: string
  instruction: string
}

export type MapProvider = "leaflet" | "yandex"
export type RouteMode = "walking" | "driving" | "public_transport" | "bicycle"

export interface LocationSuggestion {
  title: string
  subtitle?: string | null
  lat: number
  lon: number
}

export interface RoutePreview {
  mode: RouteMode
  duration_sec: number
  distance_m: number
  from_point: {
    lat: number
    lon: number
  }
  to_point: {
    lat: number
    lon: number
  }
  geometry?: unknown
  geometry_latlon?: unknown
  steps?: Record<string, unknown>[]
}

export interface RouteRecommendation {
  mode: RouteMode
  duration_sec: number
  distance_m: number
  estimated_cost: number
  score: number
  reason: string
}

export interface RoutesConfig {
  api_key: string
  layers: string[]
}

export interface FeasibilityConflict {
  prev_event_id?: string | null
  prev_event_title?: string | null
  next_event_id: string
  next_event_title: string
  current_start_at: string
  suggested_start_at: string
  suggested_end_at: string
  mode: RouteMode
  travel_time_sec: number
  reason: string
  faster_mode?: RouteMode | null
}

export interface FeasibilityResult {
  conflicts: FeasibilityConflict[]
}

export interface AiSession {
  id: string
  chat_type: "planner" | "companion"
  display_index: number
  title?: string
  created_at: string
  last_used_at?: string
}

export interface AiMessage {
  id: string
  session_id?: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  created_at?: string
  provider?: string
  model?: string
}

export interface AiChatResponse {
  session_id: string
  chat_type?: "planner" | "companion" | null
  display_index?: number | null
  answer: string
  mode?: "AUTO" | "PLANNER" | "COMPANION" | null
  intent?: string | null
  fallback_reason_code?: "provider_error" | "timeout" | "rate_limit" | "backend_unavailable" | "unknown" | null
  requires_user_input?: boolean
  clarifying_question?: string | null
  options?: Array<Record<string, unknown>>
  memory_suggestions?: Array<Record<string, unknown>>
  planner_summary?: Record<string, unknown>
  response_meta?: "create" | "update" | "delete" | "info" | null
}

export type AssistantMode = "AUTO" | "PLANNER" | "COMPANION"

export interface AssistantModeState {
  default_mode: AssistantMode
  active_session_id?: string | null
  active_chat_type?: "planner" | "companion" | null
}

export interface Profile {
  user_id: string
  email: string
  username: string
  display_name?: string | null
  default_route_mode: RouteMode
  map_provider: MapProvider
  timezone: string
  home_location_text?: string | null
  home_location_lat?: number | null
  home_location_lon?: number | null
  home_location_source?: string | null
}

export interface ProfileUpdate {
  username?: string
  display_name?: string | null
  default_route_mode?: RouteMode
  map_provider?: MapProvider
  home_location_text?: string | null
  home_location_lat?: number | null
  home_location_lon?: number | null
  home_location_source?: string | null
}
