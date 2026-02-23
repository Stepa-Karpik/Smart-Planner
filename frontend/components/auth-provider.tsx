"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { AuthContext, type AuthState } from "@/lib/auth-store"
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  setAccessToken,
  hasRefreshToken,
  apiRequest,
  clearTokens,
} from "@/lib/api-client"
import type { AuthPayload } from "@/lib/types"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  })

  const refreshAuth = useCallback(async () => {
    if (!hasRefreshToken()) {
      setState({ isAuthenticated: false, isLoading: false, user: null })
      return
    }

    try {
      const refreshRes = await apiRequest<AuthPayload>("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: localStorage.getItem("sp_refresh_token") }),
      })

      if (refreshRes.data?.tokens && refreshRes.data.user_id && refreshRes.data.email && refreshRes.data.username) {
        setAccessToken(refreshRes.data.tokens.access_token)
        localStorage.setItem("sp_refresh_token", refreshRes.data.tokens.refresh_token)
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: {
            id: refreshRes.data.user_id,
            email: refreshRes.data.email,
            username: refreshRes.data.username,
            display_name: refreshRes.data.display_name ?? null,
            role: refreshRes.data.role,
            default_route_mode: refreshRes.data.default_route_mode,
          },
        })
      } else {
        clearTokens()
        setState({ isAuthenticated: false, isLoading: false, user: null })
      }
    } catch {
      clearTokens()
      setState({ isAuthenticated: false, isLoading: false, user: null })
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password)
    if (res.error || !res.data) {
      return { success: false, error: res.error?.message || "Login failed" }
    }
    if (res.data.requires_twofa && res.data.twofa_method && res.data.twofa_session_id) {
      return {
        success: false,
        twofaChallenge: {
          method: res.data.twofa_method,
          sessionId: res.data.twofa_session_id,
          expiresAt: res.data.expires_at,
          message: res.data.message ?? null,
        },
      }
    }
    if (!res.data.tokens || !res.data.user_id || !res.data.email || !res.data.username) {
      return { success: false, error: "Invalid login response" }
    }

    setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: res.data.user_id,
        email: res.data.email,
        username: res.data.username,
        display_name: res.data.display_name ?? null,
        role: res.data.role,
        default_route_mode: res.data.default_route_mode,
      },
    })
    return { success: true }
  }, [])

  const signUp = useCallback(async (email: string, username: string, password: string) => {
    const res = await apiRegister(email, username, password)
    if (res.error || !res.data?.tokens || !res.data.user_id || !res.data.email || !res.data.username) {
      return { success: false, error: res.error?.message || "Registration failed" }
    }

    setState({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: res.data.user_id,
        email: res.data.email,
        username: res.data.username,
        display_name: res.data.display_name ?? null,
        role: res.data.role,
        default_route_mode: res.data.default_route_mode,
      },
    })
    return { success: true }
  }, [])

  const signOut = useCallback(async () => {
    await apiLogout()
    setState({ isAuthenticated: false, isLoading: false, user: null })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
