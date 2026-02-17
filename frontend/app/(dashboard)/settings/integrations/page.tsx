"use client"

import { Blocks } from "lucide-react"
import { TelegramLinkCard } from "@/components/telegram-link-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

export default function IntegrationsPage() {
  const { tr } = useI18n()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Integrations", "Интеграции")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr("This section is prepared for future external services.", "Раздел подготовлен для будущих внешних интеграций.")}
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Blocks className="h-4 w-4" />
            {tr("Roadmap", "План развития")}
          </CardTitle>
          <CardDescription>
            {tr("For now, Telegram is also available here and in Profile.", "Пока здесь доступна Telegram-привязка (также есть в Профиле).")}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {tr("Upcoming integrations can be managed from this page without changing navigation.", "Будущие интеграции будут добавляться здесь без изменения структуры навигации.")}
        </CardContent>
      </Card>

      <TelegramLinkCard />
    </div>
  )
}
