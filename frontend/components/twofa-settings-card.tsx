"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Copy, Loader2, Shield, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmTotpTwofaSetup,
  disableTotpTwofaByCode,
  startTotpTwofaSetup,
  switchTwofaMethod,
  useTwofaSettings,
} from "@/lib/hooks"
import type { TotpSetupPayload, TwoFAMethod } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export function TwoFactorSettingsCard() {
  const { tr } = useI18n()
  const { data, isLoading, mutate } = useTwofaSettings()

  const [methodSubmitting, setMethodSubmitting] = useState<TwoFAMethod | null>(null)

  const [totpSetup, setTotpSetup] = useState<TotpSetupPayload | null>(null)
  const [totpSetupCode, setTotpSetupCode] = useState("")
  const [totpDisableCode, setTotpDisableCode] = useState("")
  const [totpSubmitting, setTotpSubmitting] = useState<"setup" | "verify" | "disable" | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  const qrUrl = useMemo(() => {
    if (!totpSetup?.otpauth_uri) return null
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpSetup.otpauth_uri)}`
  }, [totpSetup?.otpauth_uri])

  async function handleSwitchMethod(method: TwoFAMethod) {
    setMethodSubmitting(method)
    const res = await switchTwofaMethod(method)
    setMethodSubmitting(null)
    if (res.error) {
      toast.error(res.error.message)
      return
    }
    toast.success(tr("2FA method updated", "Способ 2FA обновлён"))
    mutate()
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
  const telegramConfigured = Boolean(data?.telegram_linked && data?.telegram_confirmed)
  const totpEnabled = data?.twofa_method === "totp"
  const totpConfigured = Boolean(data?.totp_enabled)

  return (
    <Card className="rounded-2xl border-slate-200/80 bg-white/75 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/25 dark:shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-white">
          <Shield className="h-4 w-4" />
          {tr("Two-factor authentication", "Двухфакторная аутентификация")}
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-white/50">
          {tr(
            "Choose one extra verification method for login. Only one method can be active at a time.",
            "Выберите дополнительный способ подтверждения входа. Одновременно активен только один метод.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card
            className={cn(
              "flex h-full flex-col rounded-2xl border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.02]",
              telegramEnabled && "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/35 dark:bg-emerald-400/5",
            )}
          >
            <CardHeader className="min-h-[106px] pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-white">
                  <Smartphone className="h-4 w-4" />
                  Telegram 2FA
                </CardTitle>
                <Badge variant="outline" className="border-slate-200 bg-white/80 text-[10px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/75">
                  {telegramEnabled ? tr("Enabled", "Включено") : tr("Disabled", "Выключено")}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500 dark:text-white/50">
                {tr(
                  "Login is confirmed by tapping a button in Telegram.",
                  "Вход подтверждается кнопкой в Telegram.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-3 pt-0">
              {!isLoading && !telegramConfigured && (
                <p className="text-xs text-slate-500 dark:text-white/45">{tr("First link Telegram account", "Сначала нужно привязать Telegram")}</p>
              )}

              <Button
                type="button"
                size="sm"
                variant={telegramEnabled ? "outline" : "default"}
                className={cn(
                  "mt-auto w-full rounded-xl",
                  telegramEnabled
                    ? "border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                    : "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90",
                )}
                disabled={isLoading || Boolean(methodSubmitting) || !telegramConfigured}
                onClick={() => void handleSwitchMethod(telegramEnabled ? "none" : "telegram")}
              >
                {(methodSubmitting === "telegram" || (methodSubmitting === "none" && telegramEnabled)) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {telegramEnabled
                  ? tr("Disable 2FA", "Выключить 2FA")
                  : telegramConfigured
                    ? tr("Use Telegram for login", "Использовать Telegram")
                    : tr("Link Telegram first", "Сначала привяжите Telegram")}
              </Button>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "flex h-full flex-col rounded-2xl border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.02]",
              totpEnabled && "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/35 dark:bg-emerald-400/5",
            )}
          >
            <CardHeader className="min-h-[106px] pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-slate-950 dark:text-white">{tr("Yandex Authenticator (TOTP)", "Яндекс Аутентификатор (TOTP)")}</CardTitle>
                <Badge variant="outline" className="border-slate-200 bg-white/80 text-[10px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/75">
                  {totpEnabled ? tr("Enabled", "Включено") : tr("Disabled", "Выключено")}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500 dark:text-white/50">
                {tr(
                  "Compatible with Yandex Key and other authenticator apps.",
                  "Совместимо с Яндекс Ключ и другими приложениями-аутентификаторами.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-3 pt-0">
              {!totpConfigured && !totpSetup && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-auto w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  onClick={() => void handleStartTotpSetup()}
                  disabled={totpSubmitting === "setup"}
                >
                  {totpSubmitting === "setup" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {tr("Connect TOTP", "Подключить TOTP")}
                </Button>
              )}

              {!totpConfigured && totpSetup && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-xs text-slate-500 dark:text-white/45">
                    {tr("Scan QR code in authenticator app and enter 6-digit code.", "Сканируйте QR-код в приложении и введите 6-значный код.")}
                  </p>
                  {qrUrl ? (
                    <div className="w-fit overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-white/15">
                      <img src={qrUrl} alt="TOTP QR" width={180} height={180} />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 dark:text-white/75">{tr("Secret", "Секрет")}</Label>
                    <div className="flex items-center gap-2">
                      <Input value={totpSetup.secret} readOnly className="h-9 border-slate-200 bg-white/80 font-mono text-xs text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-white" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                        onClick={() => void copySecret()}
                      >
                        {secretCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="totp-setup-code" className="text-xs text-slate-600 dark:text-white/75">{tr("Verification code", "Код подтверждения")}</Label>
                    <Input
                      id="totp-setup-code"
                      value={totpSetupCode}
                      onChange={(e) => setTotpSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="123456"
                      className="h-9 border-slate-200 bg-white/80 font-mono tracking-[0.2em] text-slate-800 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/25"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 rounded-xl bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
                      onClick={() => void handleVerifyTotpSetup()}
                      disabled={totpSetupCode.length < 6 || totpSubmitting === "verify"}
                    >
                      {totpSubmitting === "verify" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {tr("Confirm", "Подтвердить")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={() => setTotpSetup(null)}
                    >
                      {tr("Cancel", "Отмена")}
                    </Button>
                  </div>
                </div>
              )}

              {totpConfigured && !totpSetup && (
                <Button
                  type="button"
                  size="sm"
                  variant={totpEnabled ? "outline" : "default"}
                  className={cn(
                    "mt-auto w-full rounded-xl",
                    totpEnabled
                      ? "border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                      : "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-white/90",
                  )}
                  onClick={() => void handleSwitchMethod(totpEnabled ? "none" : "totp")}
                  disabled={isLoading || Boolean(methodSubmitting)}
                >
                  {(methodSubmitting === "totp" || (methodSubmitting === "none" && totpEnabled)) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {totpEnabled ? tr("Disable 2FA", "Выключить 2FA") : tr("Use TOTP for login", "Использовать TOTP")}
                </Button>
              )}

              {totpConfigured && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <Label htmlFor="totp-disable-code" className="text-xs text-slate-600 dark:text-white/75">{tr("Code to unlink TOTP", "Код для отвязки TOTP")}</Label>
                  <Input
                    id="totp-disable-code"
                    value={totpDisableCode}
                    onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="123456"
                    className="h-9 border-slate-200 bg-white/80 font-mono tracking-[0.2em] text-slate-800 placeholder:text-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/25"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={() => void handleDisableTotp()}
                    disabled={totpDisableCode.length < 6 || totpSubmitting === "disable"}
                  >
                    {totpSubmitting === "disable" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {tr("Unlink TOTP", "Отвязать TOTP")}
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
