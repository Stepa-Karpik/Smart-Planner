"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, MapPinned } from "lucide-react"
import { toast } from "sonner"
import { TelegramLinkCard } from "@/components/telegram-link-card"
import { TwoFactorSettingsCard } from "@/components/twofa-settings-card"
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
  const [crmRoutesEnabled, setCrmRoutesEnabled] = useState(true)
  const [crmDeadlineNotificationsEnabled, setCrmDeadlineNotificationsEnabled] = useState(true)
  const [crmNoticeHours, setCrmNoticeHours] = useState(24)
  const [savingCrm, setSavingCrm] = useState(false)

  const selectedProvider: MapProvider = profile?.map_provider || "leaflet"
  const hasYandexApiKey = Boolean(routesConfig?.api_key?.trim())
  const crmApiBase = process.env.NEXT_PUBLIC_CRM_API_URL || "https://crm.nerior.ru/api/v1"

  useEffect(() => {
    let cancelled = false
    async function loadCrmSettings() {
      try {
        const response = await fetch(`${crmApiBase}/integrations/planner/settings`, { credentials: "include" })
        if (!response.ok) return
        const payload = await response.json()
        if (cancelled) return
        setCrmRoutesEnabled(Boolean(payload.crm_routes_enabled))
        setCrmDeadlineNotificationsEnabled(Boolean(payload.crm_deadline_notifications_enabled))
        setCrmNoticeHours(Number(payload.crm_deadline_notice_hours || 24))
      } catch {
        // CRM can be disabled locally; planner should remain usable.
      }
    }
    loadCrmSettings()
    return () => { cancelled = true }
  }, [crmApiBase])

  async function saveCrmSettings() {
    setSavingCrm(true)
    try {
      const response = await fetch(`${crmApiBase}/integrations/planner/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crm_routes_enabled: crmRoutesEnabled,
          crm_deadline_notifications_enabled: crmDeadlineNotificationsEnabled,
          crm_deadline_notice_hours: crmNoticeHours,
        }),
      })
      if (!response.ok) throw new Error("CRM settings failed")
      toast.success(tr("CRM settings updated", "Настройки CRM обновлены"))
    } catch {
      toast.error(tr("Could not save CRM settings", "Не удалось сохранить настройки CRM"))
    } finally {
      setSavingCrm(false)
    }
  }

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
    <div className="relative mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-10 h-44 w-44 rounded-full bg-blue-300/[0.16] blur-[90px] dark:bg-blue-500/10" />
        <div className="absolute right-[10%] top-24 h-52 w-52 rounded-full bg-cyan-300/[0.18] blur-[100px] dark:bg-cyan-400/10" />
      </div>

      <div className="relative rounded-2xl border border-slate-200/80 bg-white/80 p-5 text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:text-white dark:shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr("Integrations", "Интеграции")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/55">
          {tr(
            "Choose which map engine is used in pickers and route preview.",
            "Выберите картографический движок для выбора точек и предпросмотра маршрутов.",
          )}
        </p>
      </div>

      <Card className="relative rounded-2xl border-slate-200/80 bg-white/75 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/25 dark:shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-white">
            <MapPinned className="h-4 w-4" />
            {tr("Map integrations", "Интеграции карт")}
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-white/50">
            {tr(
              "The selected provider is stored in your account and applied automatically.",
              "Выбранный провайдер сохраняется в вашем аккаунте и применяется автоматически.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-52 rounded-xl bg-slate-200/70 dark:bg-white/10" />
              <Skeleton className="h-52 rounded-xl bg-slate-200/70 dark:bg-white/10" />
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
                      "flex h-full flex-col rounded-2xl border-slate-200/80 bg-white/70 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-[0_10px_30px_rgba(0,0,0,0.15)]",
                      isSelected && "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/35 dark:bg-emerald-400/5",
                      isUnavailable && "opacity-70",
                    )}
                  >
                    <CardHeader className="min-h-[118px] pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-medium text-slate-950 dark:text-white">{tr(item.title, item.titleRu)}</CardTitle>
                        <Badge variant="outline" className="border-slate-200 bg-white/80 text-[10px] text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/75">
                          {tr(item.badge, item.badgeRu)}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-slate-500 dark:text-white/50">{tr(item.description, item.descriptionRu)}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto pt-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        className={cn(
                          "w-full rounded-xl",
                          isSelected
                            ? "bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-950 disabled:text-white disabled:opacity-100 dark:bg-white dark:text-black dark:hover:bg-white/90 dark:disabled:bg-white dark:disabled:text-black"
                            : "border-slate-200 bg-white/75 text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/10 dark:hover:text-white",
                        )}
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

                      <p className="mt-2 min-h-[32px] text-xs text-slate-500 dark:text-white/45">
                        {isUnavailable
                          ? tr("Yandex API key is missing in backend config.", "В backend-конфиге отсутствует API ключ Яндекс.Карт.")
                          : "\u00A0"}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>



      <Card className="relative rounded-2xl border-slate-200/80 bg-white/75 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/25 dark:shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-950 dark:text-white">
            <CheckCircle2 className="h-4 w-4" />
            Nerior CRM
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-white/50">
            {tr("Deadline events and routes for CRM tasks.", "Дедлайны и маршруты для задач CRM.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCrmRoutesEnabled(true)}
              className={cn("rounded-xl border p-4 text-left text-sm transition", crmRoutesEnabled ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black" : "border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70")}
            >
              {tr("Show routes to CRM tasks", "Отображать маршруты к CRM задачам")}
            </button>
            <button
              type="button"
              onClick={() => setCrmRoutesEnabled(false)}
              className={cn("rounded-xl border p-4 text-left text-sm transition", !crmRoutesEnabled ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black" : "border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70")}
            >
              {tr("Do not show routes", "Не отображать маршруты")}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCrmDeadlineNotificationsEnabled(true)}
              className={cn("rounded-xl border p-4 text-left text-sm transition", crmDeadlineNotificationsEnabled ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black" : "border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70")}
            >
              {tr("Notify before CRM deadlines", "Уведомлять о CRM дедлайнах")}
            </button>
            <button
              type="button"
              onClick={() => setCrmDeadlineNotificationsEnabled(false)}
              className={cn("rounded-xl border p-4 text-left text-sm transition", !crmDeadlineNotificationsEnabled ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black" : "border-slate-200 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70")}
            >
              {tr("Do not notify", "Не уведомлять")}
            </button>
          </div>
          {crmDeadlineNotificationsEnabled ? (
            <label className="block text-sm text-slate-700 dark:text-white/70">
              {tr("Notify before deadline, hours", "За сколько часов до дедлайна")}
              <input
                type="number"
                min={1}
                max={720}
                value={crmNoticeHours}
                onChange={(event) => setCrmNoticeHours(Number(event.target.value))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-950 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </label>
          ) : null}
          <Button type="button" onClick={saveCrmSettings} disabled={savingCrm} className="rounded-xl">
            {savingCrm ? tr("Saving...", "Сохраняю...") : tr("Save CRM settings", "Сохранить CRM настройки")}
          </Button>
        </CardContent>
      </Card>

      <TwoFactorSettingsCard />
      <TelegramLinkCard />
    </div>
  )
}
