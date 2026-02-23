"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Bell, BellRing, Megaphone, Settings2, Sparkles, Ticket, TimerReset } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { isAdminRole } from "@/lib/authz"
import { useFeed, useProfile } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import { supportSubtopicLabel, supportTopicLabel } from "@/lib/support-topics"
import type { FeedItemType } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type FeedFilterMap = Record<FeedItemType, boolean>

const TYPE_META: Record<
  FeedItemType,
  {
    icon: typeof Bell
    dotClassName: string
    badgeClassName: string
    labelEn: string
    labelRu: string
    hintEn: string
    hintRu: string
  }
> = {
  notification: {
    icon: BellRing,
    dotClassName: "bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.7)]",
    badgeClassName: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    labelEn: "Notifications",
    labelRu: "Уведомления",
    hintEn: "System and account notices",
    hintRu: "Системные и аккаунтные сообщения",
  },
  update: {
    icon: Sparkles,
    dotClassName: "bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.7)]",
    badgeClassName: "border-violet-400/30 bg-violet-400/10 text-violet-200",
    labelEn: "Updates",
    labelRu: "Обновления",
    hintEn: "Product changes and releases",
    hintRu: "Изменения продукта и релизы",
  },
  reminder: {
    icon: TimerReset,
    dotClassName: "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.7)]",
    badgeClassName: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    labelEn: "Reminders",
    labelRu: "Напоминания",
    hintEn: "Planning and task reminders",
    hintRu: "Напоминания о планировании и задачах",
  },
  ticket: {
    icon: Ticket,
    dotClassName: "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.7)]",
    badgeClassName: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    labelEn: "Tickets",
    labelRu: "Тикеты",
    hintEn: "Support ticket updates",
    hintRu: "Обновления по тикетам поддержки",
  },
}

function formatDateTime(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function FeedPage() {
  const { tr, locale } = useI18n()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const [filters, setFilters] = useState<FeedFilterMap>({
    notification: true,
    update: true,
    reminder: true,
    ticket: true,
  })

  const feedQuery = useFeed({ limit: 200, offset: 0 })
  const items = feedQuery.data ?? []

  const isAdmin = isAdminRole(profile?.role ?? user?.role ?? null)
  const visibleTypes = useMemo<FeedItemType[]>(
    () => (isAdmin ? ["notification", "update", "reminder", "ticket"] : ["notification", "update", "reminder"]),
    [isAdmin],
  )

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.type] += 1
        acc.all += 1
        return acc
      },
      { all: 0, notification: 0, update: 0, reminder: 0, ticket: 0 } as Record<"all" | FeedItemType, number>,
    )
  }, [items])

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.type === "ticket" && !isAdmin) {
          return filters.notification
        }
        return filters[item.type]
      }),
    [filters, isAdmin, items],
  )
  const activeFilterCount = visibleTypes.filter((type) => filters[type]).length

  function toggleFilter(type: FeedItemType) {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  function setAllFilters(enabled: boolean) {
    setFilters({
      notification: enabled,
      update: enabled,
      reminder: enabled,
      ticket: enabled,
    })
  }

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[18%] top-[-5rem] h-56 w-56 rounded-full bg-cyan-400/10 blur-[90px]" />
        <div className="absolute right-[10%] top-[12rem] h-64 w-64 rounded-full bg-blue-500/10 blur-[110px]" />
        <div className="absolute bottom-[-3rem] left-[45%] h-52 w-52 rounded-full bg-violet-500/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <Megaphone className="h-3.5 w-3.5" />
                {tr("Unified feed center", "Единая лента")}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">{tr("Feed", "Лента")}</h1>
              <p className="mt-1 text-sm text-white/55">
                {tr(
                  "Notifications, product updates, and reminders in one place.",
                  "Уведомления, обновления продукта и напоминания в одном месте.",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/80">
                {tr("Visible", "Показано")}: {visibleItems.length}
              </Badge>
              <Badge className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/80">
                {tr("Filters", "Фильтры")}: {activeFilterCount}/{visibleTypes.length}
              </Badge>
              {isAdmin && (
                <>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/admin/feed">
                      <Settings2 className="mr-1.5 h-4 w-4" />
                      {tr("Manage feed", "Управлять лентой")}
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="rounded-xl">
                    <Link href="/admin/feed">{tr("Add event", "Добавить событие")}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
          <section className="space-y-3">
            {feedQuery.isLoading && !feedQuery.data ? (
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)
            ) : feedQuery.error ? (
              <Card className="rounded-2xl border-red-400/20 bg-red-500/5 backdrop-blur-sm">
                <CardContent className="p-5 text-sm text-red-200">
                  {tr("Failed to load feed items.", "Не удалось загрузить ленту.")}
                </CardContent>
              </Card>
            ) : visibleItems.length === 0 ? (
              <Card className="rounded-2xl border-white/10 bg-black/25 backdrop-blur-sm">
                <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                  <div className="rounded-full border border-white/10 bg-white/5 p-3">
                    <Bell className="h-5 w-5 text-white/70" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{tr("No items for current filters", "Нет элементов для текущих фильтров")}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {tr("Enable more types on the right panel.", "Включите больше типов в правой панели.")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              visibleItems.map((item) => {
                const displayType = !isAdmin && item.type === "ticket" ? "notification" : item.type
                const meta = TYPE_META[displayType]
                const Icon = meta.icon
                const updatePoints = item.type === "update" && Array.isArray(item.meta?.update_points)
                  ? item.meta.update_points.filter((point): point is string => typeof point === "string" && point.trim().length > 0)
                  : []
                const ticketEventKind = item.type === "ticket" ? item.meta?.ticket_event_kind : undefined
                const ticketNumber = item.type === "ticket" ? item.meta?.ticket_public_number : undefined
                const showTicketDetails = isAdmin && item.type === "ticket"
                const ticketDisplayTitle =
                  item.type === "ticket"
                    ? ticketEventKind
                      ? isAdmin
                        ? ticketEventKind === "closed"
                          ? tr(`Ticket ${ticketNumber ?? ""} closed`.trim(), `Тикет ${ticketNumber ?? ""} закрыт`.trim())
                          : tr(`Ticket ${ticketNumber ?? ""} updated`.trim(), `Тикет ${ticketNumber ?? ""} обновлен`.trim())
                        : tr("Support update", "Обновление поддержки")
                      : isAdmin
                        ? item.title
                        : tr("Support update", "Обновление поддержки")
                    : item.title
                const ticketDisplayBody =
                  item.type === "ticket"
                    ? ticketEventKind
                      ? ticketEventKind === "created"
                        ? tr(
                            isAdmin ? "Ticket was created and accepted by support" : "Your request has been accepted by support",
                            isAdmin ? "Тикет создан и принят в поддержку" : "Ваше обращение принято поддержкой",
                          )
                        : ticketEventKind === "replied"
                          ? tr("A reply from support has been received", "Поступил ответ от поддержки")
                          : tr(
                              isAdmin ? "Ticket status changed: closed" : "Request status changed: closed",
                              isAdmin ? "Тикет был закрыт поддержкой" : "Обращение было закрыто поддержкой",
                            )
                      : isAdmin
                        ? item.body
                        : tr("Support request status has been updated", "Статус обращения в поддержку обновлён")
                    : item.body
                return (
                  <Card
                    key={item.id}
                    className="rounded-2xl border-white/10 bg-black/30 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:border-white/20 hover:bg-black/35"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex gap-4">
                        <div className="mt-0.5 flex items-start">
                          <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", meta.dotClassName)} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("rounded-full text-[10px]", meta.badgeClassName)}>
                              <Icon className="mr-1 h-3 w-3" />
                              {tr(meta.labelEn, meta.labelRu)}
                            </Badge>
                            <span className="text-xs text-white/45">{formatDateTime(item.published_at, locale)}</span>
                            {isAdmin ? (
                              <span className="text-[11px] text-white/35">
                                {item.target_username
                                  ? `${tr("for user", "для пользователя")} @${item.target_username}`
                                  : tr("for all users", "для всех пользователей")}
                              </span>
                            ) : null}
                          </div>

                          <h3 className="text-sm font-semibold text-white sm:text-base">{ticketDisplayTitle}</h3>
                          <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-white/60">{ticketDisplayBody}</p>
                          {showTicketDetails && (item.meta?.ticket_id || item.meta?.ticket_topic || ticketEventKind) ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {ticketEventKind ? (
                                <Badge variant="outline" className="rounded-full border-emerald-400/20 bg-emerald-400/5 text-emerald-200">
                                  {ticketEventKind === "created" && tr("Created", "Создан")}
                                  {ticketEventKind === "replied" && tr("Replied", "Ответ")}
                                  {ticketEventKind === "closed" && tr("Closed", "Закрыт")}
                                </Badge>
                              ) : null}
                              {item.meta?.ticket_id ? (
                                <span className="text-white/45">ID: {item.meta.ticket_id.slice(0, 8)}...</span>
                              ) : null}
                              {item.meta?.ticket_topic ? (
                                <span className="text-white/45">
                                  {supportTopicLabel(locale, item.meta.ticket_topic)}
                                  {item.meta.ticket_subtopic
                                    ? ` · ${supportSubtopicLabel(locale, item.meta.ticket_topic, item.meta.ticket_subtopic)}`
                                    : ""}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {updatePoints.length > 0 ? (
                            <ul className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                              {updatePoints.map((point, index) => (
                                <li key={`${item.id}-${index}`} className="flex items-start gap-2 text-sm text-white/70">
                                  <span className="mt-[0.38rem] h-1.5 w-1.5 rounded-full bg-violet-300/90" />
                                  <span className="whitespace-pre-line break-words">{point}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white">{tr("Feed types", "Типы ленты")}</CardTitle>
                <CardDescription className="text-white/45">
                  {tr("Turn categories on or off", "Включайте и выключайте категории")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                      activeFilterCount === visibleTypes.length && "border-white/30 bg-white/10",
                    )}
                    onClick={() => setAllFilters(true)}
                  >
                    {tr("All on", "Все вкл")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setAllFilters(false)}
                  >
                    {tr("All off", "Все выкл")}
                  </Button>
                </div>

                <div className="space-y-2">
                  {visibleTypes.map((type) => {
                    const meta = TYPE_META[type]
                    const Icon = meta.icon
                    const active = filters[type]
                    const displayCount = !isAdmin && type === "notification" ? counts.notification + counts.ticket : counts[type]
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleFilter(type)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                          active
                            ? "border-white/20 bg-white/[0.08] text-white"
                            : "border-white/10 bg-white/[0.02] text-white/55 hover:bg-white/[0.05]",
                        )}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full", meta.dotClassName)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{tr(meta.labelEn, meta.labelRu)}</p>
                          <p className="truncate text-xs text-white/45">{tr(meta.hintEn, meta.hintRu)}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-white/10 bg-white/5 text-white/80">
                          {displayCount}
                        </Badge>
                        <Icon className="h-4 w-4 opacity-70" />
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card className="rounded-2xl border-white/10 bg-black/35 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white">{tr("Admin tools", "Инструменты админа")}</CardTitle>
                  <CardDescription className="text-white/45">
                    {tr(
                      "Use the admin feed editor for creating and updating broadcasts or targeted events.",
                      "Используйте редактор админ-ленты для создания и редактирования рассылок и адресных событий.",
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button asChild className="w-full rounded-xl">
                    <Link href="/admin/feed">{tr("Open feed management", "Открыть управление лентой")}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/admin">{tr("Open admin panel", "Открыть админ панель")}</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
