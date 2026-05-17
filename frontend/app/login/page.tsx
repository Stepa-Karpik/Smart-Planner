"use client"

import { useEffect } from "react"

export default function LoginRedirectPage() {
  useEffect(() => {
    const returnTo = encodeURIComponent(`${window.location.origin}/today`)
    window.location.replace(`https://auth.nerior.ru/login?return_to=${returnTo}`)
  }, [])

  return <main className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Переходим к общему входу…</main>
}
