"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, Link2, Loader2, Smartphone, Unlink } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { startTelegramLink, unlinkTelegram, useTelegramStatus } from "@/lib/hooks"
import type { TelegramStartPayload } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export function TelegramLinkCard() {
  const { tr } = useI18n()
  const { data: status, isLoading, mutate } = useTelegramStatus()
  const [linkPayload, setLinkPayload] = useState<TelegramStartPayload | null>(null)
  const [linking, setLinking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerateLink() {
    setLinking(true)
    const response = await startTelegramLink()
    setLinking(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to generate link", "Не удалось создать ссылку"))
      return
    }
    setLinkPayload(response.data)
  }

  async function handleUnlink() {
    setUnlinking(true)
    const response = await unlinkTelegram()
    setUnlinking(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    toast.success(tr("Telegram unlinked", "Telegram отвязан"))
    setLinkPayload(null)
    mutate()
  }

  function handleCopy() {
    if (!linkPayload?.deep_link) return
    navigator.clipboard.writeText(linkPayload.deep_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenDesktop() {
    if (!linkPayload?.desktop_link || !linkPayload.deep_link) return

    const fallback = linkPayload.deep_link
    const startedAt = Date.now()
    window.location.href = linkPayload.desktop_link

    setTimeout(() => {
      // If app did not open and tab is still visible, use web fallback.
      if (document.visibilityState === "visible" && Date.now() - startedAt < 4000) {
        window.open(fallback, "_blank", "noopener,noreferrer")
      }
    }, 1200)
  }

  if (isLoading) {
    return <Skeleton className="h-44 rounded-lg" />
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Telegram</CardTitle>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              status?.is_linked ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground",
            )}
          >
            {status?.is_linked ? tr("Connected", "Подключено") : tr("Not connected", "Не подключено")}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {tr("Link Telegram to receive reminders and conflict alerts.", "Привяжите Telegram, чтобы получать напоминания и уведомления о конфликтах.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {status?.is_linked ? (
          <>
            <div className="flex flex-col gap-1 text-sm">
              {status.telegram_username && (
                <p className="text-muted-foreground">
                  {tr("Username", "Имя пользователя")}: <span className="font-medium text-foreground">@{status.telegram_username}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {tr("Confirmation", "Подтверждение")}: {status.is_confirmed ? tr("yes", "да") : tr("pending", "ожидает")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Unlink className="mr-1.5 h-3.5 w-3.5" />}
              {tr("Unlink Telegram", "Отвязать Telegram")}
            </Button>
          </>
        ) : (
          <>
            {linkPayload ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {tr("Open Telegram app and press Start.", "Откройте Telegram и нажмите Start.")}
                </p>

                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <a href={linkPayload.deep_link} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-xs text-accent underline underline-offset-2">
                    {linkPayload.deep_link}
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={handleOpenDesktop}>
                    <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                    {tr("Open in Telegram app", "Открыть в приложении Telegram")}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={linkPayload.deep_link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {tr("Web fallback", "Открыть web-версию")}
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={handleGenerateLink} disabled={linking}>
                {linking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                {tr("Generate link", "Сгенерировать ссылку")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
