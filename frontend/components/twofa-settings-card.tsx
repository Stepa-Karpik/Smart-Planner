"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Copy, Loader2, Shield, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmTotpTwofaSetup,
  disableTelegramTwofaRequest,
  disableTotpTwofaByCode,
  enableTelegramTwofaRequest,
  fetchTwofaPendingStatus,
  startTotpTwofaSetup,
  useTwofaSettings,
} from "@/lib/hooks"
import type { TotpSetupPayload, TwoFAStatus, TwoFATelegramPending } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

type PendingState = {
  pendingId: string
  action: "enable" | "disable"
  status: TwoFAStatus
  expiresAt?: string
}

export function TwoFactorSettingsCard() {
  const { tr } = useI18n()
  const { data, isLoading, mutate } = useTwofaSettings()

  const [telegramPending, setTelegramPending] = useState<PendingState | null>(null)
  const [telegramSubmitting, setTelegramSubmitting] = useState(false)

  const [totpSetup, setTotpSetup] = useState<TotpSetupPayload | null>(null)
  const [totpSetupCode, setTotpSetupCode] = useState("")
  const [totpDisableCode, setTotpDisableCode] = useState("")
  const [totpSubmitting, setTotpSubmitting] = useState<"setup" | "verify" | "disable" | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const lastTelegramPendingStatusRef = useRef<string | null>(null)

  const qrUrl = useMemo(() => {
    if (!totpSetup?.otpauth_uri) return null
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpSetup.otpauth_uri)}`
  }, [totpSetup?.otpauth_uri])

  useEffect(() => {
    if (!telegramPending || telegramPending.status !== "pending") return
    let stopped = false

    const poll = async () => {
      const res = await fetchTwofaPendingStatus(telegramPending.pendingId)
      if (stopped || res.error || !res.data) return
      const nextStatus = res.data.status
      setTelegramPending((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              expiresAt: res.data?.expires_at || prev.expiresAt,
            }
          : prev,
      )
      if (nextStatus !== "pending" && lastTelegramPendingStatusRef.current !== nextStatus) {
        lastTelegramPendingStatusRef.current = nextStatus
        if (nextStatus === "approved") {
          toast.success(tr("2FA settings updated", "Настройки 2FA обновлены"))
          mutate()
        } else if (nextStatus === "denied") {
          toast.error(tr("Action denied in Telegram", "Действие отклонено в Telegram"))
        } else if (nextStatus === "expired") {
          toast.error(tr("Telegram confirmation expired", "Подтверждение в Telegram истекло"))
        }
      }
    }

    const interval = window.setInterval(() => {
      void poll()
    }, 2000)
    void poll()

    return () => {
      stopped = true
      window.clearInterval(interval)
    }
  }, [telegramPending?.pendingId, telegramPending?.status, mutate, tr])

  async function requestTelegramToggle(action: "enable" | "disable") {
    setTelegramSubmitting(true)
    const res = action === "enable" ? await enableTelegramTwofaRequest() : await disableTelegramTwofaRequest()
    setTelegramSubmitting(false)

    if (res.error || !res.data) {
      toast.error(res.error?.message || tr("Request failed", "Запрос не выполнен"))
      return
    }

    const pending = res.data as TwoFATelegramPending
    lastTelegramPendingStatusRef.current = null
    setTelegramPending({
      pendingId: pending.pending_id,
      action: pending.action,
      status: pending.status,
      expiresAt: pending.expires_at,
    })
    toast.success(tr("Confirm action in Telegram", "Подтвердите действие в Telegram"))
  }

  async function handleStartTotpSetup() {
    setTotpSubmitting("setup")
    const res = await startTotpTwofaSetup()
    setTotpSubmitting(null)

    if (res.error || !res.data) {
      toast.error(res.error?.message || tr("Failed to start TOTP setup", "Не удалось начать настройку TOTP"))
      return
    }

    setTotpSetup(res.data)
    setTotpSetupCode("")
    setSecretCopied(false)
  }

  async function handleVerifyTotpSetup() {
    if (!totpSetup) return
    setTotpSubmitting("verify")
    const res = await confirmTotpTwofaSetup(totpSetup.pending_id, totpSetupCode)
    setTotpSubmitting(null)

    if (res.error) {
      toast.error(res.error.message)
      return
    }

    toast.success(tr("TOTP 2FA enabled", "TOTP 2FA включена"))
    setTotpSetup(null)
    setTotpSetupCode("")
    mutate()
  }

  async function handleDisableTotp() {
    setTotpSubmitting("disable")
    const res = await disableTotpTwofaByCode(totpDisableCode)
    setTotpSubmitting(null)

    if (res.error) {
      toast.error(res.error.message)
      return
    }

    toast.success(tr("TOTP 2FA disabled", "TOTP 2FA отключена"))
    setTotpDisableCode("")
    mutate()
  }

  async function copySecret() {
    if (!totpSetup?.secret) return
    await navigator.clipboard.writeText(totpSetup.secret)
    setSecretCopied(true)
    window.setTimeout(() => setSecretCopied(false), 1800)
  }

  const telegramEnabled = data?.twofa_method === "telegram"
  const totpEnabled = data?.twofa_method === "totp"

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          {tr("Two-factor authentication", "Двухфакторная аутентификация")}
        </CardTitle>
        <CardDescription>
          {tr(
            "Choose one extra verification method for login. Only one method can be active at a time.",
            "Выберите дополнительный способ подтверждения входа. Одновременно активен только один метод.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className={cn("border-border/60", telegramEnabled && "border-emerald-500/40 bg-emerald-500/5") }>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="h-4 w-4" />
                  Telegram 2FA
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {telegramEnabled ? tr("Enabled", "Включено") : tr("Disabled", "Выключено")}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {tr(
                  "Login is confirmed by tapping a button in Telegram.",
                  "Вход подтверждается кнопкой в Telegram.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {!isLoading && !data?.telegram_linked && (
                <p className="text-xs text-muted-foreground">{tr("First link Telegram account", "Сначала нужно привязать Telegram")}</p>
              )}

              <Button
                type="button"
                size="sm"
                variant={telegramEnabled ? "outline" : "default"}
                className="w-full"
                disabled={isLoading || telegramSubmitting || !data?.telegram_linked}
                onClick={() => void requestTelegramToggle(telegramEnabled ? "disable" : "enable")}
              >
                {telegramSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {telegramEnabled
                  ? tr("Disable via Telegram confirmation", "Отключить Telegram")
                  : tr("Enable via Telegram confirmation", "Подтверждать в Telegram")}
              </Button>

              {telegramPending && (
                <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
                  <p className="font-medium text-foreground">
                    {tr("Telegram confirmation status", "Статус подтверждения в Telegram")}: {telegramPending.status}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {telegramPending.status === "pending"
                      ? tr("Open Telegram and confirm the action.", "Откройте Telegram и подтвердите действие.")
                      : telegramPending.status === "approved"
                        ? tr("Action approved.", "Действие подтверждено.")
                        : telegramPending.status === "denied"
                          ? tr("Action denied.", "Действие отклонено.")
                          : tr("Confirmation expired.", "Подтверждение истекло.")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn("border-border/60", totpEnabled && "border-emerald-500/40 bg-emerald-500/5") }>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">{tr("Yandex Authenticator (TOTP)", "Яндекс Аутентификатор (TOTP)")}</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {totpEnabled ? tr("Enabled", "Включено") : tr("Disabled", "Выключено")}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {tr(
                  "Compatible with Yandex Key and other authenticator apps.",
                  "Совместимо с Яндекс Ключ и другими приложениями-аутентификаторами.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {!totpEnabled && !totpSetup && (
                <Button type="button" size="sm" className="w-full" onClick={() => void handleStartTotpSetup()} disabled={totpSubmitting === "setup"}>
                  {totpSubmitting === "setup" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {tr("Connect TOTP", "Подключить TOTP")}
                </Button>
              )}

              {!totpEnabled && totpSetup && (
                <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    {tr("Scan QR code in authenticator app and enter 6-digit code.", "Сканируйте QR-код в приложении и введите 6-значный код.")}
                  </p>
                  {qrUrl ? (
                    <div className="overflow-hidden rounded-md border bg-white p-2 w-fit">
                      <img src={qrUrl} alt="TOTP QR" width={180} height={180} />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Secret", "Секрет")}</Label>
                    <div className="flex items-center gap-2">
                      <Input value={totpSetup.secret} readOnly className="h-9 font-mono text-xs" />
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => void copySecret()}>
                        {secretCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="totp-setup-code" className="text-xs">{tr("Verification code", "Код подтверждения")}</Label>
                    <Input
                      id="totp-setup-code"
                      value={totpSetupCode}
                      onChange={(e) => setTotpSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="123456"
                      className="h-9 font-mono tracking-[0.2em]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="flex-1" onClick={() => void handleVerifyTotpSetup()} disabled={totpSetupCode.length < 6 || totpSubmitting === "verify"}>
                      {totpSubmitting === "verify" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {tr("Confirm", "Подтвердить")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setTotpSetup(null)}>
                      {tr("Cancel", "Отмена")}
                    </Button>
                  </div>
                </div>
              )}

              {totpEnabled && (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                  <Label htmlFor="totp-disable-code" className="text-xs">{tr("Code to disable", "Код для отключения")}</Label>
                  <Input
                    id="totp-disable-code"
                    value={totpDisableCode}
                    onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="123456"
                    className="h-9 font-mono tracking-[0.2em]"
                  />
                  <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void handleDisableTotp()} disabled={totpDisableCode.length < 6 || totpSubmitting === "disable"}>
                    {totpSubmitting === "disable" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {tr("Disable TOTP", "Отключить TOTP")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}
