"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ChevronRight, Shield, Sparkles, Users, Bell, Bot } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AdminRouteLink = {
  href: string
  icon: typeof Shield
  titleEn: string
  titleRu: string
  descEn: string
  descRu: string
}

const ADMIN_ROUTE_LINKS: AdminRouteLink[] = [
  {
    href: "/admin",
    icon: Shield,
    titleEn: "Overview",
    titleRu: "Обзор",
    descEn: "Entry point and shortcuts",
    descRu: "Точка входа и быстрые переходы",
  },
  {
    href: "/admin/users",
    icon: Users,
    titleEn: "Users",
    titleRu: "Пользователи",
    descEn: "Roles, usernames, passwords",
    descRu: "Роли, юзернеймы, пароли",
  },
  {
    href: "/admin/feed",
    icon: Bell,
    titleEn: "Feed",
    titleRu: "Лента",
    descEn: "Broadcasts and targeted items",
    descRu: "Рассылки и адресные события",
  },
  {
    href: "/admin/assistant",
    icon: Bot,
    titleEn: "Assistant",
    titleRu: "Ассистент",
    descEn: "Admin actions for AI tools",
    descRu: "Админ-действия для AI-инструментов",
  },
]

export function AdminPageShell({
  titleEn,
  titleRu,
  descriptionEn,
  descriptionRu,
  badgeEn = "Administrator workspace",
  badgeRu = "Рабочее пространство администратора",
  actions,
  children,
}: {
  titleEn: string
  titleRu: string
  descriptionEn: string
  descriptionRu: string
  badgeEn?: string
  badgeRu?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const { tr } = useI18n()

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[-4rem] h-64 w-64 rounded-full bg-sky-400/10 blur-[100px]" />
        <div className="absolute right-[10%] top-[8rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute bottom-[5%] left-[45%] h-60 w-60 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-6">
        <Card className="rounded-2xl border-white/10 bg-black/30 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {tr(badgeEn, badgeRu)}
              </Badge>
              <div>
                <CardTitle className="text-2xl tracking-tight text-white">{tr(titleEn, titleRu)}</CardTitle>
                <CardDescription className="mt-1 text-sm text-white/55">{tr(descriptionEn, descriptionRu)}</CardDescription>
              </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">{children}</div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white">{tr("Anchors", "Якоря")}</CardTitle>
                <CardDescription className="text-white/45">
                  {tr("Quick routes for admin tasks", "Быстрые роуты для админ-задач")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ADMIN_ROUTE_LINKS.map((link) => {
                  const active =
                    link.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === link.href || pathname.startsWith(`${link.href}/`)
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
                        active
                          ? "border-white/20 bg-white/[0.08] text-white"
                          : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tr(link.titleEn, link.titleRu)}</p>
                        <p className="truncate text-xs text-white/45">{tr(link.descEn, link.descRu)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-50 transition group-hover:translate-x-0.5" />
                    </Link>
                  )
                })}

                <div className="pt-2">
                  <Link
                    href="/ai"
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <span>{tr("Open AI chat", "Открыть AI чат")}</span>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}
