"use client"

import Link from "next/link"
import { ArrowLeft, HelpCircle, Search } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { SUPPORT_FAQ_CATEGORIES } from "@/lib/support-faq"

export default function SupportFaqPage() {
  const { tr } = useI18n()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
        <Card className="rounded-2xl border-border/70 bg-card/85 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
                <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                FAQ
              </Badge>
              <div>
                <CardTitle className="text-2xl tracking-tight text-foreground">{tr("Frequently asked questions", "Часто задаваемые вопросы")}</CardTitle>
                <CardDescription className="mt-1 text-sm text-muted-foreground">
                  {tr(
                    "Structured answers for assistant, tickets, integrations, events, Gantt charts and login.",
                    "Структурированные ответы по ассистенту, тикетам, интеграциям, событиям, диаграммам Ганта и входу.",
                  )}
                </CardDescription>
              </div>
            </div>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/support">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tr("Back to support", "Назад в поддержку")}
              </Link>
            </Button>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <Accordion type="single" collapsible defaultValue={SUPPORT_FAQ_CATEGORIES[0]?.id} className="space-y-3">
              {SUPPORT_FAQ_CATEGORIES.map((category) => (
                <AccordionItem key={category.id} value={category.id} className="rounded-2xl border border-border/70 bg-card/85 px-4 shadow-sm">
                  <AccordionTrigger className="py-4 text-left hover:no-underline">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{tr(category.titleEn, category.titleRu)}</div>
                      <div className="mt-1 text-xs font-normal text-muted-foreground">{tr(category.descriptionEn, category.descriptionRu)}</div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <Accordion type="single" collapsible className="space-y-2">
                      {category.items.map((item) => (
                        <AccordionItem key={item.id} value={item.id} className="rounded-xl border border-border/70 bg-background px-3">
                          <AccordionTrigger className="py-3 text-left text-sm font-medium hover:no-underline">
                            {tr(item.questionEn, item.questionRu)}
                          </AccordionTrigger>
                          <AccordionContent className="pb-3 text-sm leading-relaxed text-muted-foreground">
                            {tr(item.answerEn, item.answerRu)}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
            <Card className="rounded-2xl border-border/70 bg-card/85 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                  <Search className="h-4 w-4" />
                  {tr("Didn't find an answer?", "Не нашли ответ?")}
                </CardTitle>
                <CardDescription>
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
  )
}
