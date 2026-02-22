"use client"

import { createContext, useContext } from "react"

export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: {
    id: string
    email: string
    username: string
    display_name?: string | null
    default_route_mode?: "walking" | "driving" | "public_transport" | "bicycle"
  } | null
}

export interface AuthContextType extends AuthState {
  signIn: (
    username: string,
    password: string,
  ) => Promise<{
    success: boolean
    error?: string
    twofaChallenge?: {
      method: "telegram" | "totp"
      sessionId: string
      expiresAt?: string
      message?: string | null
    }
  }>
  signUp: (email: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshAuth: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
