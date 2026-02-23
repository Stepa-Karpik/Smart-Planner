"use client"

import Link from "next/link"
import { Bell, Bot, Shield, Ticket, Users } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
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
    <AdminPageShell
      titleEn="Admin Panel"
      titleRu="Админ панель"
      descriptionEn="Protected workspace for user management, feed broadcasts, and assistant administration."
      descriptionRu="Защищенное пространство для управления пользователями, рассылками ленты и администрирования ассистента."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {BLOCKS.map((block) => {
          const Icon = block.icon
          return (
            <Card
              key={block.href}
              className={`group flex h-full min-h-[240px] flex-col rounded-2xl border-white/10 bg-gradient-to-br ${block.accent} bg-black/25 shadow-[0_14px_40px_rgba(0,0,0,0.22)] backdrop-blur-sm transition hover:border-white/20 hover:bg-black/30`}
            >
              <CardHeader className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white transition group-hover:scale-[1.02]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge className="rounded-full border-white/15 bg-white/5 text-white/75">
                    <Shield className="mr-1 h-3 w-3" />
                    {tr("Admin", "Админ")}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-lg text-white">{tr(block.titleEn, block.titleRu)}</CardTitle>
                  <CardDescription className="mt-1 text-white/55">{tr(block.descEn, block.descRu)}</CardDescription>
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

      <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base text-white">{tr("Security", "Безопасность")}</CardTitle>
          <CardDescription className="text-white/55">
            {tr(
              "All admin API routes are protected on the backend. Non-admin users cannot access users/feed admin endpoints even if they know the route.",
              "Все admin API роуты защищены на backend. Не-админы не смогут использовать admin endpoints пользователей/ленты, даже если знают путь.",
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    </AdminPageShell>
  )
}
