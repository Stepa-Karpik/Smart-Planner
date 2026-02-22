import type {
  ApiEnvelope,
  AuthPayload,
  LoginTwoFASessionStatusPayload,
  TotpSetupPayload,
  TwoFAPendingStatusPayload,
  TwoFASettings,
  TwoFATelegramPending,
} from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("sp_refresh_token")
}

function setRefreshToken(token: string | null) {
  if (typeof window === "undefined") return
  if (token) {
    localStorage.setItem("sp_refresh_token", token)
  } else {
    localStorage.removeItem("sp_refresh_token")
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false

    const envelope: ApiEnvelope<AuthPayload> = await res.json()
    if (envelope.error || !envelope.data?.tokens) return false

    setAccessToken(envelope.data.tokens.access_token)
    setRefreshToken(envelope.data.tokens.refresh_token)
    return true
  } catch {
    return false
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const url = `${API_BASE}${path}`
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  let res = await fetch(url, { ...options, headers })

  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`
      res = await fetch(url, { ...options, headers })
    }
  }

  if (!res.ok) {
    try {
      const body = await res.json()
      if (body.error) return body as ApiEnvelope<T>
    } catch {
      // ignore parsing errors
    }

    return {
      data: null,
      meta: {},
      error: {
        code: "HTTP_ERROR",
        message: `Request failed with status ${res.status}`,
      },
    }
  }

  return res.json()
}

export async function login(loginValue: string, password: string) {
  const envelope = await apiRequest<AuthPayload>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginValue, password }),
  })

  if (envelope.data?.tokens) {
    setAccessToken(envelope.data.tokens.access_token)
    setRefreshToken(envelope.data.tokens.refresh_token)
  }

  return envelope
}

export async function register(email: string, username: string, password: string) {
  const envelope = await apiRequest<AuthPayload>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  })

  if (envelope.data?.tokens) {
    setAccessToken(envelope.data.tokens.access_token)
    setRefreshToken(envelope.data.tokens.refresh_token)
  }

  return envelope
}

export async function logout() {
  const refresh = getRefreshToken()
  if (refresh) {
    await apiRequest("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    })
  }

  setAccessToken(null)
  setRefreshToken(null)
}

export function clearTokens() {
  setAccessToken(null)
  setRefreshToken(null)
}

export function hasRefreshToken(): boolean {
  return !!getRefreshToken()
}

export { setRefreshToken as storeRefreshToken }

export async function verifyLoginTwofaTotp(twofaSessionId: string, code: string) {
  const envelope = await apiRequest<AuthPayload>("/api/v1/auth/twofa/totp/verify", {
    method: "POST",
    body: JSON.stringify({ twofa_session_id: twofaSessionId, code }),
  })

  if (envelope.data?.tokens) {
    setAccessToken(envelope.data.tokens.access_token)
    setRefreshToken(envelope.data.tokens.refresh_token)
  }

  return envelope
}

export async function requestLoginTwofaTelegram(twofaSessionId: string) {
  return apiRequest<LoginTwoFASessionStatusPayload>("/api/v1/auth/twofa/telegram/request", {
    method: "POST",
    body: JSON.stringify({ twofa_session_id: twofaSessionId }),
  })
}

export async function getLoginTwofaSessionStatus(twofaSessionId: string) {
  return apiRequest<LoginTwoFASessionStatusPayload>(`/api/v1/auth/twofa/session/${twofaSessionId}`)
}

export async function completeLoginTwofaTelegram(twofaSessionId: string) {
  const envelope = await apiRequest<AuthPayload>("/api/v1/auth/twofa/telegram/complete", {
    method: "POST",
    body: JSON.stringify({ twofa_session_id: twofaSessionId }),
  })

  if (envelope.data?.tokens) {
    setAccessToken(envelope.data.tokens.access_token)
    setRefreshToken(envelope.data.tokens.refresh_token)
  }

  return envelope
}

export async function getTwofaSettings() {
  return apiRequest<TwoFASettings>("/api/v1/integrations/twofa")
}

export async function requestEnableTelegramTwofa() {
  return apiRequest<TwoFATelegramPending>("/api/v1/integrations/twofa/telegram/enable-request", { method: "POST" })
}

export async function requestDisableTelegramTwofa() {
  return apiRequest<TwoFATelegramPending>("/api/v1/integrations/twofa/telegram/disable-request", { method: "POST" })
}

export async function getTwofaPendingStatus(pendingId: string) {
  return apiRequest<TwoFAPendingStatusPayload>(`/api/v1/integrations/twofa/pending/${pendingId}`)
}

export async function setupTotpTwofa() {
  return apiRequest<TotpSetupPayload>("/api/v1/integrations/twofa/totp/setup", { method: "POST" })
}

export async function verifyTotpTwofaSetup(pendingId: string, code: string) {
  return apiRequest<{ ok: boolean }>("/api/v1/integrations/twofa/totp/verify-setup", {
    method: "POST",
    body: JSON.stringify({ pending_id: pendingId, code }),
  })
}

export async function disableTotpTwofa(code: string) {
  return apiRequest<{ ok: boolean }>("/api/v1/integrations/twofa/totp/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  })
}
