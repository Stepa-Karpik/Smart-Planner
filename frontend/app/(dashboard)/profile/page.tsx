"use client"

import { useEffect, useMemo, useState } from "react"
import { Bike, Bus, Car, Footprints, Loader2, Save, ShieldCheck, Train, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { LocationInput } from "@/components/location-input"
import { TelegramLinkCard } from "@/components/telegram-link-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePassword, updateProfile, useProfile } from "@/lib/hooks"
import { hasMetroCity } from "@/lib/route-modes"
import type { MapProvider, RouteMode } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LocationSource = "manual_text" | "geocoded" | "map_pick"

const baseRouteModeOptions: Array<{ value: RouteMode; labelEn: string; labelRu: string; icon: LucideIcon }> = [
  { value: "walking", labelEn: "Walking", labelRu: "Пешком", icon: Footprints },
  { value: "public_transport", labelEn: "Transport", labelRu: "Транспорт", icon: Bus },
  { value: "driving", labelEn: "Driving", labelRu: "Авто", icon: Car },
  { value: "bicycle", labelEn: "Bicycle", labelRu: "Вело", icon: Bike },
]

const metroOption = {
  value: "metro" as RouteMode,
  labelEn: "Metro",
  labelRu: "Метро",
  icon: Train,
}

export default function ProfilePage() {
  const { tr } = useI18n()
  const { data: profile, isLoading, mutate } = useProfile()
  const mapProvider: MapProvider = profile?.map_provider || "leaflet"

  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [defaultMode, setDefaultMode] = useState<RouteMode>("public_transport")
  const [savingRouteMode, setSavingRouteMode] = useState<RouteMode | null>(null)
  const [homeLocationText, setHomeLocationText] = useState("")
  const [homeLocationLat, setHomeLocationLat] = useState<number | null>(null)
  const [homeLocationLon, setHomeLocationLon] = useState<number | null>(null)
  const [homeLocationSource, setHomeLocationSource] = useState<LocationSource>("manual_text")
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const routeModeOptions = useMemo(
    () => (hasMetroCity(homeLocationText) ? [...baseRouteModeOptions.slice(0, 2), metroOption, ...baseRouteModeOptions.slice(2)] : baseRouteModeOptions),
    [homeLocationText],
  )
  const metroAvailable = hasMetroCity(homeLocationText)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name || "")
    setUsername(profile.username)
    setDefaultMode(profile.default_route_mode)
    setHomeLocationText(profile.home_location_text || "")
    setHomeLocationLat(typeof profile.home_location_lat === "number" ? profile.home_location_lat : null)
    setHomeLocationLon(typeof profile.home_location_lon === "number" ? profile.home_location_lon : null)
    setHomeLocationSource(((profile.home_location_source as LocationSource | null) || "manual_text"))
  }, [profile])

  useEffect(() => {
    if (!metroAvailable && defaultMode === "metro") {
      setDefaultMode("public_transport")
    }
  }, [defaultMode, metroAvailable])

  async function handleProfileSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const response = await updateProfile({
      display_name: displayName || null,
      username,
      default_route_mode: defaultMode,
      home_location_text: homeLocationText || null,
      home_location_lat: homeLocationLat,
      home_location_lon: homeLocationLon,
      home_location_source: homeLocationSource,
    })
    setSaving(false)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate()
    toast.success(tr("Profile updated", "Профиль обновлён"))
  }

  async function handleRouteModeSelect(nextMode: RouteMode) {
    if (nextMode === defaultMode || savingRouteMode) {
      setDefaultMode(nextMode)
      return
    }

    const previousMode = defaultMode
    setDefaultMode(nextMode)
    setSavingRouteMode(nextMode)
    const response = await updateProfile({
      default_route_mode: nextMode,
      home_location_text: homeLocationText || null,
      home_location_lat: homeLocationLat,
      home_location_lon: homeLocationLon,
      home_location_source: homeLocationSource,
    })
    setSavingRouteMode(null)

    if (response.error) {
      setDefaultMode(previousMode)
      toast.error(response.error.message)
      return
    }
    await mutate()
  }

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault()
    setChangingPassword(true)
    const response = await changePassword(currentPassword, newPassword)
    setChangingPassword(false)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    setCurrentPassword("")
    setNewPassword("")
    toast.success(tr("Password updated", "Пароль обновлён"))
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{tr("Profile", "Профиль")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tr("Manage account, transport defaults and Telegram link.", "Управляйте аккаунтом, режимом передвижения и привязкой Telegram.")}
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{tr("Main settings", "Основные настройки")}</CardTitle>
          <CardDescription>
            {tr("Default transport affects travel-time comparisons in schedule and routes.", "Режим по умолчанию влияет на сравнение времени в пути в расписании и маршрутах.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Loading profile...", "Загрузка профиля...")}
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleProfileSave}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{tr("Display name", "Отображаемое имя")}</Label>
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={tr("Your name", "Ваше имя")} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{tr("Username", "Username")}</Label>
                  <Input value={username} onChange={(event) => setUsername(event.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{tr("Default transport mode", "Режим передвижения по умолчанию")}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                  {routeModeOptions.map((option) => {
                    const Icon = option.icon
                    const active = defaultMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void handleRouteModeSelect(option.value)}
                        disabled={Boolean(savingRouteMode)}
                        className={cn(
                          "group relative flex h-14 items-center gap-2 rounded-xl border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                          active
                            ? "border-slate-950 bg-slate-950 text-white shadow-[0_14px_35px_rgba(15,23,42,0.18)] dark:border-white dark:bg-white dark:text-black dark:shadow-none"
                            : "border-slate-200 bg-white/85 text-slate-600 shadow-sm hover:border-slate-300 hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:shadow-none dark:hover:bg-white/10 dark:hover:text-white",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
                            active
                              ? "border-white/15 bg-white/12 text-white dark:border-black/10 dark:bg-black/5 dark:text-black"
                              : "border-slate-200 bg-slate-50 text-slate-500 group-hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:group-hover:text-white",
                          )}
                        >
                          {savingRouteMode === option.value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <p className="min-w-0 truncate text-sm font-semibold">{tr(option.labelEn, option.labelRu)}</p>
                        {active ? <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500" /> : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{tr("Home location", "Место проживания")}</Label>
                <LocationInput
                  value={homeLocationText}
                  lat={homeLocationLat}
                  lon={homeLocationLon}
                  mapProvider={mapProvider}
                  placeholder={tr("Type address or pick from map", "Введите адрес или выберите на карте")}
                  onChange={(next) => {
                    setHomeLocationText(next.text)
                    setHomeLocationLat(next.lat)
                    setHomeLocationLon(next.lon)
                    setHomeLocationSource(next.source)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {tr(
                    "Used as start point for first route of the day when applicable.",
                    "Используется как стартовая точка для первого маршрута дня, если это уместно.",
                  )}
                </p>
              </div>

              <Button type="submit" className="w-fit" disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                {tr("Save profile", "Сохранить профиль")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{tr("Security", "Безопасность")}</CardTitle>
          <CardDescription>{tr("Update your password.", "Обновите пароль.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handlePasswordChange}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>{tr("Current password", "Текущий пароль")}</Label>
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={8} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{tr("New password", "Новый пароль")}</Label>
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
              </div>
            </div>
            <Button type="submit" variant="outline" className="w-fit" disabled={changingPassword}>
              {changingPassword ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
              {tr("Change password", "Изменить пароль")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <TelegramLinkCard />
    </div>
  )
}
