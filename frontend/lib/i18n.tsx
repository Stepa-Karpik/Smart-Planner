"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Locale = "en" | "ru"

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  tr: (en: string, ru: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = "sp_locale"

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en")

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "en" || stored === "ru") {
      setLocaleState(stored)
    } else {
      const guessed = navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en"
      setLocaleState(guessed)
    }
  }, [])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale)
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, nextLocale)
        }
      },
      tr: (en, ru) => (locale === "ru" ? ru : en),
    }),
    [locale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider")
  }
  return context
}
