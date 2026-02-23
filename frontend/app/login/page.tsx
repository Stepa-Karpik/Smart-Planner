"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, ShieldCheck, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { completeLoginTwofaTelegram, getLoginTwofaSessionStatus, requestLoginTwofaTelegram, verifyLoginTwofaTotp } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"
import { useI18n } from "@/lib/i18n"
import type { TwoFALoginMethod, TwoFALoginStatus } from "@/lib/types"

type TwofaChallengeState = {
  method: TwoFALoginMethod
  sessionId: string
  expiresAt?: string
  message?: string | null
}

export default function LoginPage() {
  const router = useRouter()
  const { signIn, refreshAuth } = useAuth()
  const { tr } = useI18n()

  const [loginValue, setLoginValue] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const [twofaChallenge, setTwofaChallenge] = useState<TwofaChallengeState | null>(null)
  const [twofaCode, setTwofaCode] = useState("")
  const [twofaSubmitting, setTwofaSubmitting] = useState(false)
  const [telegramRequesting, setTelegramRequesting] = useState(false)
  const [telegramCompleting, setTelegramCompleting] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<TwoFALoginStatus | null>(null)
  const [telegramStatusMessage, setTelegramStatusMessage] = useState<string | null>(null)
  const telegramRequestedRef = useRef(false)
  const telegramCompleteTriggeredRef = useRef(false)

  const expiresInSeconds = useMemo(() => {
    if (!twofaChallenge?.expiresAt) return null
    const expires = new Date(twofaChallenge.expiresAt).getTime()
    if (!Number.isFinite(expires)) return null
    return Math.max(0, Math.floor((expires - Date.now()) / 1000))
  }, [twofaChallenge?.expiresAt])

  const authInputClassName =
    "h-11 rounded-xl border-white/25 bg-white/[0.02] px-3.5 text-white placeholder:text-white/30 ring-offset-black focus-visible:border-white/40 focus-visible:ring-[#3b82f6]/70 focus-visible:ring-offset-0"
  const authLabelClassName = "text-[12px] font-medium tracking-wide text-white/85"
  const authPrimaryButtonClassName =
    "mt-1 h-11 rounded-xl border border-white/80 bg-white text-black shadow-[0_8px_30px_rgba(255,255,255,0.08)] transition hover:bg-white/90 hover:text-black"
  const authSecondaryButtonClassName =
    "h-10 rounded-xl border border-white/20 bg-white/[0.02] text-white hover:bg-white/[0.08] hover:text-white"

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const result = await signIn(loginValue, password)
    setLoading(false)

    if (result.twofaChallenge) {
      setTwofaChallenge(result.twofaChallenge)
      setTwofaCode("")
      setTelegramStatus(null)
      setTelegramStatusMessage(result.twofaChallenge.message ?? null)
      telegramRequestedRef.current = false
      telegramCompleteTriggeredRef.current = false
      return
    }

    if (!result.success) {
      toast.error(result.error || tr("Login failed", "Ошибка входа"))
      return
    }
    router.push("/today")
  }

  async function handleVerifyTotp(event: React.FormEvent) {
    event.preventDefault()
    if (!twofaChallenge) return
    setTwofaSubmitting(true)
    const response = await verifyLoginTwofaTotp(twofaChallenge.sessionId, twofaCode)
    setTwofaSubmitting(false)

    if (response.error || !response.data?.tokens) {
      toast.error(response.error?.message || tr("Invalid code", "Неверный код"))
      return
    }

    await refreshAuth()
    router.push("/today")
  }

  async function requestTelegramConfirmation() {
    if (!twofaChallenge || twofaChallenge.method !== "telegram") return
    setTelegramRequesting(true)
    const response = await requestLoginTwofaTelegram(twofaChallenge.sessionId)
    setTelegramRequesting(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to send request to Telegram", "Не удалось отправить запрос в Telegram"))
      return
    }

    telegramRequestedRef.current = true
    setTelegramStatus(response.data.status)
    setTelegramStatusMessage(
      response.data.status === "pending"
        ? tr("Confirmation request sent to Telegram", "Запрос подтверждения отправлен в Telegram")
        : null,
    )
  }

  async function completeTelegramLogin() {
    if (!twofaChallenge) return
    if (telegramCompleteTriggeredRef.current) return
    telegramCompleteTriggeredRef.current = true
    setTelegramCompleting(true)
    const response = await completeLoginTwofaTelegram(twofaChallenge.sessionId)
    setTelegramCompleting(false)

    if (response.error || !response.data?.tokens) {
      telegramCompleteTriggeredRef.current = false
      toast.error(response.error?.message || tr("Failed to complete login", "Не удалось завершить вход"))
      return
    }

    await refreshAuth()
    router.push("/today")
  }

  useEffect(() => {
    if (!twofaChallenge || twofaChallenge.method !== "telegram") return
    if (!telegramRequestedRef.current) {
      void requestTelegramConfirmation()
    }
  }, [twofaChallenge])

  useEffect(() => {
    if (!twofaChallenge || twofaChallenge.method !== "telegram") return
    let stopped = false

    const tick = async () => {
      const response = await getLoginTwofaSessionStatus(twofaChallenge.sessionId)
      if (stopped) return
      if (response.error || !response.data) {
        return
      }
      setTelegramStatus(response.data.status)
      if (response.data.status === "approved") {
        setTelegramStatusMessage(tr("Approved in Telegram. Finishing login...", "Подтверждено в Telegram. Завершаю вход..."))
        if (!telegramCompleting && !telegramCompleteTriggeredRef.current) {
          void completeTelegramLogin()
        }
        return
      }
      if (response.data.status === "denied") {
        setTelegramStatusMessage(tr("Login request was denied in Telegram", "Запрос входа отклонён в Telegram"))
      }
      if (response.data.status === "expired") {
        setTelegramStatusMessage(tr("2FA session expired", "Сессия 2FA истекла"))
      }
    }

    const interval = window.setInterval(() => {
      void tick()
    }, 2000)
    void tick()

    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [twofaChallenge, telegramCompleting, tr])

  function resetTwofa() {
    setTwofaChallenge(null)
    setTwofaCode("")
    setTelegramStatus(null)
    setTelegramStatusMessage(null)
    telegramRequestedRef.current = false
    telegramCompleteTriggeredRef.current = false
    setTelegramRequesting(false)
    setTelegramCompleting(false)
  }

  return (
    <AuthLayout>
      <div className="mx-auto flex w-full max-w-[360px] flex-col gap-6 md:min-h-[440px]">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {twofaChallenge ? tr("Two-factor authentication", "Двухфакторная аутентификация") : tr("Sign in", "Вход")}
          </h1>
          <p className="mt-1.5 text-sm text-white/40">
            {twofaChallenge
              ? tr("Confirm login before entering the app", "Подтвердите вход перед переходом в приложение")
              : tr("Use your email or username to continue", "Используйте email или username для входа")}
          </p>
        </div>

        {!twofaChallenge ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login" className={authLabelClassName}>
                {tr("Email or username", "Email или username")}
              </Label>
              <Input
                id="login"
                type="text"
                value={loginValue}
                onChange={(event) => setLoginValue(event.target.value)}
                required
                autoComplete="username"
                className={authInputClassName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className={authLabelClassName}>
                {tr("Password", "Пароль")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className={`${authInputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition hover:text-white/85"
                  aria-label={showPassword ? tr("Hide password", "Скрыть пароль") : tr("Show password", "Показать пароль")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className={authPrimaryButtonClassName}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr("Sign in", "Войти")}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              {twofaChallenge.method === "totp" ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 text-white/80" />
              ) : (
                <Smartphone className="mt-0.5 h-4 w-4 text-white/80" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium text-white">
                  {twofaChallenge.method === "totp"
                    ? tr("Enter code from authenticator app", "Введите код из приложения-аутентификатора")
                    : tr("Confirm login in Telegram", "Подтвердите вход в Telegram")}
                </p>
                {telegramStatusMessage || twofaChallenge.message ? (
                  <p className="mt-1 text-xs text-white/45">{telegramStatusMessage || twofaChallenge.message}</p>
                ) : null}
                {expiresInSeconds !== null && (
                  <p className="mt-1 text-xs text-white/45">
                    {tr("Expires in", "Истекает через")}: {expiresInSeconds}s
                  </p>
                )}
              </div>
            </div>

            {twofaChallenge.method === "totp" ? (
              <form onSubmit={handleVerifyTotp} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="twofa-code" className={authLabelClassName}>
                    {tr("6-digit code", "6-значный код")}
                  </Label>
                  <Input
                    id="twofa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twofaCode}
                    onChange={(event) => setTwofaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className={`${authInputClassName} tracking-[0.25em]`}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={twofaSubmitting || twofaCode.length < 6}
                    className="flex-1 h-10 rounded-xl border border-white/80 bg-white text-black hover:bg-white/90"
                  >
                    {twofaSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tr("Verify and sign in", "Подтвердить и войти")}
                  </Button>
                  <Button type="button" variant="outline" className={authSecondaryButtonClassName} onClick={resetTwofa}>
                    {tr("Cancel", "Отмена")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void requestTelegramConfirmation()}
                    disabled={telegramRequesting || telegramCompleting}
                    className="h-10 rounded-xl border border-white/80 bg-white text-black hover:bg-white/90"
                  >
                    {telegramRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tr("Send request to Telegram", "Отправить запрос в Telegram")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={authSecondaryButtonClassName}
                    onClick={resetTwofa}
                    disabled={telegramCompleting}
                  >
                    {tr("Cancel", "Отмена")}
                  </Button>
                </div>

                {telegramStatus && ["denied", "expired"].includes(telegramStatus) && (
                  <p className="text-xs text-red-300/90">
                    {telegramStatus === "denied"
                      ? tr("Login was denied. You can send the request again.", "Вход отклонён. Можно отправить запрос повторно.")
                      : tr("Session expired. Return to login and try again.", "Сессия истекла. Вернитесь к логину и попробуйте снова.")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!twofaChallenge && (
          <p className="text-center text-sm text-white/40">
            {tr("No account yet?", "Нет аккаунта?")}{" "}
            <Link href="/register" className="font-medium text-[#3b82f6] underline-offset-4 transition hover:text-[#60a5fa] hover:underline">
              {tr("Create one", "Создать")}
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  )
}
