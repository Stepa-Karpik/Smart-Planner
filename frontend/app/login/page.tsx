"use client"

import { useEffect, useState } from "react"
import LegacyLoginPage from "@/components/legacy-login-page"

export default function LoginPage() {
  const [legacy, setLegacy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isLegacy = new URLSearchParams(window.location.search).get("legacy") === "1"
    setLegacy(isLegacy)
    setReady(true)
    if (!isLegacy) {
      const returnTo = encodeURIComponent(`${window.location.origin}/today`)
      window.location.replace(`https://auth.nerior.ru/login?return_to=${returnTo}`)
    }
  }, [])

  if (legacy) return <LegacyLoginPage />
  return <main className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">{ready ? "Переходим к общему входу…" : "Загрузка…"}</main>
}
