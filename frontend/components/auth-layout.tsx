"use client"

import Link from "next/link"
import { CalendarDays } from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { locale, setLocale, tr } = useI18n()

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4 md:p-8">
      <div className="flex w-full max-w-[960px] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="relative hidden w-[400px] shrink-0 bg-muted/60 md:flex md:flex-col">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
              <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setLocale(locale === "en" ? "ru" : "en")}
            >
              {locale.toUpperCase()}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-8 pb-8">
            <div className="relative h-[340px] w-[340px] overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-slate-100 via-white to-amber-100">
              <div className="absolute -left-10 -top-8 h-48 w-48 rounded-full bg-amber-300/35 blur-2xl" />
              <div className="absolute -bottom-10 -right-8 h-48 w-48 rounded-full bg-sky-300/30 blur-2xl" />
              <div className="absolute inset-0 grid place-items-center text-sm font-medium text-slate-600">
                Smart Planner
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col px-6 py-8 sm:px-12 sm:py-10">
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <CalendarDays className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">Smart Planner</span>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setLocale(locale === "en" ? "ru" : "en")}
            >
              {locale.toUpperCase()}
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center">{children}</div>

          <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
            {tr(
              "By continuing, you agree to the",
              "Продолжая, вы соглашаетесь с",
            )}{" "}
            <Link href="#" className="text-accent underline underline-offset-2 hover:text-accent/80">
              {tr("Terms of Service", "Условиями использования")}
            </Link>{" "}
            {tr("and", "и")}{" "}
            <Link href="#" className="text-accent underline underline-offset-2 hover:text-accent/80">
              {tr("Privacy Policy", "Политикой конфиденциальности")}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
