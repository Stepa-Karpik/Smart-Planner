"use client"

import Link from "next/link"
import { ArrowLeft, HelpCircle, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { SUPPORT_FAQ_ITEMS } from "@/lib/support-faq"

export default function SupportFaqPage() {
  const { tr } = useI18n()

  return (
    <div className="relative min-h-full">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-[-4rem] h-64 w-64 rounded-full bg-cyan-400/10 blur-[110px]" />
        <div className="absolute right-[12%] top-[7rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
        <Card className="rounded-2xl border-white/10 bg-black/30 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="w-fit rounded-full border-white/15 bg-white/5 px-3 py-1 text-white/75">
                <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                FAQ
              </Badge>
              <div>
                <CardTitle className="text-2xl tracking-tight text-white">{tr("Frequently asked questions", "Часто задаваемые вопросы")}</CardTitle>
                <CardDescription className="mt-1 text-sm text-white/55">
                  {tr(
                    "Quick answers for login, integrations, routes, AI assistant and support tickets.",
                    "Быстрые ответы по входу, интеграциям, маршрутам, AI-ассистенту и тикетам поддержки.",
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/support">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tr("Back to support", "Назад в поддержку")}
              </Link>
            </Button>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="space-y-3">
            {SUPPORT_FAQ_ITEMS.map((item) => (
              <details
                key={item.id}
                className="group rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm open:bg-black/35"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-white sm:text-base">
                  <span>{tr(item.questionEn, item.questionRu)}</span>
                  <span className="text-white/45 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/70">
                  {tr(item.answerEn, item.answerRu)}
                </p>
              </details>
            ))}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
            <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <Search className="h-4 w-4" />
                  {tr("Didn't find an answer?", "Не нашли ответ?")}
                </CardTitle>
                <CardDescription className="text-white/50">
                  {tr(
                    "Open the support page and create a ticket with screenshots, steps and expected result.",
                    "Откройте страницу поддержки и создайте тикет со скриншотами, шагами и ожидаемым результатом.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full rounded-xl">
                  <Link href="/support">{tr("Create support ticket", "Создать тикет поддержки")}</Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}
