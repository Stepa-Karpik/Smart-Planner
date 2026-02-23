"use client"

import Image from "next/image"
import Link from "next/link"
import { useI18n } from "@/lib/i18n"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { locale, setLocale, tr } = useI18n()

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#07090f] px-4 py-6 md:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[110px]" />
        <div className="absolute bottom-[-10rem] right-[-8rem] h-[20rem] w-[20rem] rounded-full bg-cyan-400/10 blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(#ffffff 0.7px, transparent 0.7px)",
            backgroundSize: "18px 18px",
          }}
        />
      </div>

      <div className="relative flex w-full max-w-[980px] overflow-hidden rounded-[20px] border border-white/25 bg-black/70 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-sm md:h-[610px]">
        <div className="relative hidden w-[42%] shrink-0 md:block">
          <Image
            src="/auth/cafe-planner-scene.png"
            alt="Workspace scene"
            fill
            priority
            sizes="(max-width: 1024px) 0px, 420px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/35" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[11px] font-medium tracking-[0.18em] text-white/85 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
            onClick={() => setLocale(locale === "en" ? "ru" : "en")}
          >
            {locale.toUpperCase()}
          </button>
        </div>

        <div className="relative flex flex-1 flex-col bg-black px-6 py-7 text-white sm:px-8 sm:py-8 md:px-9 md:py-9">
          <div className="mb-6 flex items-center justify-center">
            <div className="flex items-center gap-2 md:hidden">
              <Image
                src="/auth/smart-planner-logo-white.svg"
                alt="Smart Planner logo"
                width={554}
                height={301}
                className="h-5 w-auto opacity-95"
              />
              <Image
                src="/auth/smart-planner-text-white.png"
                alt="Smart Planner"
                width={183}
                height={28}
                className="h-4 w-auto opacity-95"
              />
            </div>

            <Image
              src="/auth/smart-planner-text-white.png"
              alt="Smart Planner"
              width={183}
              height={28}
              priority
              className="hidden h-6 w-auto opacity-95 md:block"
            />
          </div>

          <div className="relative mb-6 h-28 overflow-hidden rounded-xl border border-white/10 md:hidden">
            <Image
              src="/auth/cafe-planner-scene.png"
              alt="Workspace scene"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-black/40" />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[11px] font-medium tracking-[0.18em] text-white/85 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
              onClick={() => setLocale(locale === "en" ? "ru" : "en")}
            >
              {locale.toUpperCase()}
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center">{children}</div>

          <p className="mt-7 text-center text-[10px] leading-relaxed text-white/35 sm:text-[11px]">
            {tr("By continuing, you agree to the", "Продолжая, вы соглашаетесь с")}{" "}
            <Link href="#" className="text-[#3b82f6]/85 underline underline-offset-2 transition hover:text-[#60a5fa]">
              {tr("Terms of Service", "Условиями использования")}
            </Link>{" "}
            {tr("and", "и")}{" "}
            <Link href="#" className="text-[#3b82f6]/85 underline underline-offset-2 transition hover:text-[#60a5fa]">
              {tr("Privacy Policy", "Политикой конфиденциальности")}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
