"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, MapPinned } from "lucide-react"
import { toast } from "sonner"
import { TelegramLinkCard } from "@/components/telegram-link-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { updateProfile, useProfile, useRoutesConfig } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import type { MapProvider } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ProviderCardMeta {
  provider: MapProvider
  title: string
  titleRu: string
  description: string
  descriptionRu: string
  badge: string
  badgeRu: string
}

const PROVIDER_CARDS: ProviderCardMeta[] = [
  {
    provider: "leaflet",
    title: "Leaflet",
    titleRu: "Leaflet",
    description: "OpenStreetMap tiles via Leaflet. No paid key required.",
    descriptionRu: "Тайлы OpenStreetMap через Leaflet. Платный ключ не требуется.",
    badge: "Open source",
    badgeRu: "Open source",
  },
  {
    provider: "yandex",
    title: "Yandex Maps",
    titleRu: "Yandex Maps",
    description: "Native Yandex map SDK rendered in browser.",
    descriptionRu: "Нативный SDK Яндекс.Карт в браузере.",
    badge: "API key",
    badgeRu: "API ключ",
  },
]

export default function IntegrationsPage() {
  const { tr } = useI18n()
  const { data: profile, isLoading } = useProfile()
  const { data: routesConfig } = useRoutesConfig()
  const [savingProvider, setSavingProvider] = useState<MapProvider | null>(null)

  const selectedProvider: MapProvider = profile?.map_provider || "leaflet"
  const hasYandexApiKey = Boolean(routesConfig?.api_key?.trim())

  async function selectProvider(provider: MapProvider) {
    if (provider === selectedProvider) return

    if (provider === "yandex" && !hasYandexApiKey) {
      toast.error(tr("Yandex API key is not configured", "API ключ Яндекс.Карт не настроен"))
      return
    }

    setSavingProvider(provider)
    const response = await updateProfile({ map_provider: provider })
    setSavingProvider(null)

    if (response.error) {
      toast.error(response.error.message)
      return
    }

    toast.success(tr("Map provider updated", "Провайдер карты обновлён"))
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Integrations", "Интеграции")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr(
            "Choose which map engine is used in pickers and route preview.",
            "Выберите картографический движок для выбора точек и предпросмотра маршрутов.",
          )}
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4" />
            {tr("Map integrations", "Интеграции карт")}
          </CardTitle>
          <CardDescription>
            {tr(
              "The selected provider is stored in your account and applied automatically.",
              "Выбранный провайдер хранится в вашем аккаунте и применяется автоматически.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-44 rounded-lg" />
              <Skeleton className="h-44 rounded-lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PROVIDER_CARDS.map((item) => {
                const isSelected = selectedProvider === item.provider
                const isUnavailable = item.provider === "yandex" && !hasYandexApiKey
                const isSaving = savingProvider === item.provider

                return (
                  <Card
                    key={item.provider}
                    className={cn(
                      "border-border/60",
                      isSelected && "border-emerald-500/40 bg-emerald-500/5",
                      isUnavailable && "opacity-70",
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-medium">{tr(item.title, item.titleRu)}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">
                          {tr(item.badge, item.badgeRu)}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">{tr(item.description, item.descriptionRu)}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        className="w-full"
                        disabled={isSelected || isSaving || isUnavailable}
                        onClick={() => selectProvider(item.provider)}
                      >
                        {isSaving ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : isSelected ? (
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        ) : null}
                        {isSelected
                          ? tr("Selected", "Выбрано")
                          : isSaving
                            ? tr("Saving...", "Сохраняю...")
                            : tr("Use this provider", "Использовать этот провайдер")}
                      </Button>

                      {isUnavailable && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {tr("Yandex API key is missing in backend config.", "В backend-конфиге отсутствует API ключ Яндекс.Карт.")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TelegramLinkCard />
    </div>
  )
}

