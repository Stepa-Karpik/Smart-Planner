"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { Shield, Users, Bell, Bot, Ticket, MessageSquare } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type AdminRouteLink = {
  href: string
  icon: typeof Shield
  titleEn: string
  titleRu: string
}

const ADMIN_ROUTE_LINKS: AdminRouteLink[] = [
  {
    href: "/admin",
    icon: Shield,
    titleEn: "Overview",
    titleRu: "Обзор",
  },
  {
    href: "/admin/users",
    icon: Users,
    titleEn: "Users",
    titleRu: "Пользователи",
  },
  {
    href: "/admin/feed",
    icon: Bell,
    titleEn: "Feed",
    titleRu: "Лента",
  },
  {
    href: "/admin/tickets",
    icon: Ticket,
    titleEn: "Tickets",
    titleRu: "Тикеты",
  },
  {
    href: "/admin/assistant",
    icon: Bot,
    titleEn: "Assistant",
    titleRu: "Ассистент",
  },
  {
    href: "/ai",
    icon: MessageSquare,
    titleEn: "AI chat",
    titleRu: "AI чат",
  },
]

export function AdminPageShell({
  actions,
  children,
}: {
  titleEn?: string
  titleRu?: string
  descriptionEn?: string
  descriptionRu?: string
  badgeEn?: string
  badgeRu?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const { tr } = useI18n()

  return (
    <div className="relative min-h-full">
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/75 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/30 dark:shadow-[0_12px_36px_rgba(0,0,0,0.2)] lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-2">
            {ADMIN_ROUTE_LINKS.map((link) => {
              const active = link.href === "/admin" ? pathname === "/admin" : pathname === link.href || pathname.startsWith(`${link.href}/`)
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition",
                    active
                      ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tr(link.titleEn, link.titleRu)}
                </Link>
              )
            })}
          </nav>
          {actions ? <div className="flex flex-wrap items-center gap-2 px-1">{actions}</div> : null}
        </div>

        <div className="space-y-6">{children}</div>
      </div>
    </div>
  )
}
