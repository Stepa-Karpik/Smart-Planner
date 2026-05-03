"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { LocationInput } from "@/components/location-input"
import { TelegramLinkCard } from "@/components/telegram-link-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { changePassword, updateProfile, useProfile } from "@/lib/hooks"
import type { MapProvider, RouteMode } from "@/lib/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LocationSource = "manual_text" | "geocoded" | "map_pick"

const routeModeOptions: Array<{ value: RouteMode; labelEn: string; labelRu: string }> = [
  { value: "walking", labelEn: "Walking", labelRu: "Пешком" },
  { value: "public_transport", labelEn: "Public transport", labelRu: "Общественный транспорт" },
  { value: "driving", labelEn: "Driving", labelRu: "Авто" },
  { value: "bicycle", labelEn: "Bicycle / scooter", labelRu: "Велосипед / самокат" },
]

export default function ProfilePage() {
  const { tr } = useI18n()
  const { data: profile, isLoading, mutate } = useProfile()
  const mapProvider: MapProvider = profile?.map_provider || "leaflet"

  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [defaultMode, setDefaultMode] = useState<RouteMode>("public_transport")
  const [homeLocationText, setHomeLocationText] = useState("")
  const [homeLocationLat, setHomeLocationLat] = useState<number | null>(null)
  const [homeLocationLon, setHomeLocationLon] = useState<number | null>(null)
  const [homeLocationSource, setHomeLocationSource] = useState<LocationSource>("manual_text")
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const selectedRouteMode = routeModeOptions.find((option) => option.value === defaultMode) ?? routeModeOptions[1]

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
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {routeModeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDefaultMode(option.value)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm transition",
                        defaultMode === option.value
                          ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white",
                      )}
                    >
                      {tr(option.labelEn, option.labelRu)}
                    </button>
                  ))}
                </div>
                <Select value={defaultMode} onValueChange={(value) => setDefaultMode(value as RouteMode)}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder={tr(selectedRouteMode.labelEn, selectedRouteMode.labelRu)} />
                  </SelectTrigger>
                  <SelectContent>
                    {routeModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {tr(option.labelEn, option.labelRu)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
