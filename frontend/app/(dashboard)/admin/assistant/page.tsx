"use client"

import Link from "next/link"
import { Bot, Database, MessageSquare, ShieldCheck, Wrench } from "lucide-react"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

export default function AdminAssistantPage() {
  const { tr } = useI18n()

  return (
    <AdminPageShell
      titleEn="Assistant Administration"
      titleRu="Администрирование ассистента"
      descriptionEn="Shortcuts and operational controls for AI-related administration."
      descriptionRu="Быстрые переходы и операционные инструменты для администрирования AI."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex h-full flex-col rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
          <CardHeader className="flex-1">
            <div className="mb-2 w-fit rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <CardTitle className="text-base text-white">{tr("Open AI Chat", "Открыть AI чат")}</CardTitle>
            <CardDescription className="text-white/55">
              {tr(
                "Go to the existing assistant interface. Admins keep the same AI features plus elevated backend permissions.",
                "Перейти в существующий интерфейс ассистента. У админа остаются все AI-возможности плюс расширенные backend-права.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto pt-0">
            <Button asChild className="w-full rounded-xl">
              <Link href="/ai">{tr("Open /ai", "Открыть /ai")}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
          <CardHeader className="flex-1">
            <div className="mb-2 w-fit rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-base text-white">{tr("Access Model", "Модель доступа")}</CardTitle>
            <CardDescription className="text-white/55">
              {tr(
                "Assistant admin access is protected by backend checks. UI links are hidden for non-admin users and API routes enforce server-side authorization.",
                "Доступ администратора ассистента защищен backend-проверками. Ссылки UI скрыты для не-админов, а API роуты дополнительно защищены на сервере.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-white/65">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <Bot className="h-4 w-4 text-white/75" />
              {tr("AI features run on existing routes and services", "AI функции работают на существующих роутерах и сервисах")}
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
          <CardHeader className="flex-1">
            <div className="mb-2 w-fit rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
              <Wrench className="h-5 w-5" />
            </div>
            <CardTitle className="text-base text-white">{tr("Operations", "Операции")}</CardTitle>
            <CardDescription className="text-white/55">
              {tr(
                "Use this section as a landing page for future assistant moderation and service controls.",
                "Используйте этот раздел как точку входа для будущих инструментов модерации и сервисного управления ассистентом.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/65">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <Database className="h-4 w-4 text-white/70" />
              {tr("Session management (next step)", "Управление сессиями (следующий шаг)")}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <Wrench className="h-4 w-4 text-white/70" />
              {tr("Provider settings (next step)", "Настройки провайдеров (следующий шаг)")}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  )
}
