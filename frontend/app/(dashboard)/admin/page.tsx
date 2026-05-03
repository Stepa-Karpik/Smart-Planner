"use client"

import Link from "next/link"
import { Bell, Bot, Ticket, Users } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

const BLOCKS = [
  {
    href: "/admin/users",
    icon: Users,
    titleEn: "Users",
    titleRu: "Пользователи",
    descEn: "Edit usernames, passwords, roles, and account status.",
    descRu: "Редактирование юзернеймов, паролей, ролей и статуса аккаунтов.",
    accent: "from-sky-500/20 to-blue-500/5",
  },
  {
    href: "/admin/feed",
    icon: Bell,
    titleEn: "Feed",
    titleRu: "Лента",
    descEn: "Create and edit notifications, updates, reminders, and targeted broadcasts.",
    descRu: "Создание и редактирование уведомлений, обновлений, напоминаний и адресных рассылок.",
    accent: "from-violet-500/20 to-fuchsia-500/5",
  },
  {
    href: "/admin/assistant",
    icon: Bot,
    titleEn: "Assistant",
    titleRu: "Ассистент",
    descEn: "Administrative access to AI tools and service actions.",
    descRu: "Административный доступ к AI-инструментам и сервисным действиям.",
    accent: "from-cyan-500/20 to-emerald-500/5",
  },
  {
    href: "/admin/tickets",
    icon: Ticket,
    titleEn: "Tickets",
    titleRu: "Тикеты",
    descEn: "View tickets, reply to users, and close requests.",
    descRu: "Просмотр тикетов, ответы пользователям и закрытие обращений.",
    accent: "from-emerald-500/20 to-teal-500/5",
  },
]

export default function AdminOverviewPage() {
  const { tr } = useI18n()

  return (
    <AdminPageShell>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BLOCKS.map((block) => {
          const Icon = block.icon
          return (
            <Card
              key={block.href}
              className={`group flex h-full min-h-[240px] flex-col rounded-2xl border-slate-200/80 bg-gradient-to-br ${block.accent} bg-white/75 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:border-slate-300 hover:bg-white/90 dark:border-white/10 dark:bg-black/25 dark:shadow-[0_14px_40px_rgba(0,0,0,0.22)] dark:hover:border-white/20 dark:hover:bg-black/30`}
            >
              <CardHeader className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-slate-700 transition group-hover:scale-[1.02] dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-950 dark:text-white">{tr(block.titleEn, block.titleRu)}</CardTitle>
                  <CardDescription className="mt-1 text-slate-500 dark:text-white/55">{tr(block.descEn, block.descRu)}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button asChild className="w-full rounded-xl">
                  <Link href={block.href}>{tr("Open section", "Открыть раздел")}</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </AdminPageShell>
  )
}
