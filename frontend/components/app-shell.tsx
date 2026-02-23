"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth-store"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useProfile } from "@/lib/hooks"
import { isAdminRole } from "@/lib/authz"
import {
  Sun,
  List,
  Settings,
  MapPin,
  AlertTriangle,
  MessageSquare,
  Bell,
  LifeBuoy,
  Moon,
  LogOut,
  User,
  Languages,
  Shield,
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const baseNavItems = [
  { title: "Today", href: "/today", icon: Sun },
  { title: "Events", href: "/events", icon: List },
  { title: "AI Chat", href: "/ai", icon: MessageSquare },
  { title: "Feed", href: "/feed", icon: Bell },
  { title: "Routes", href: "/routes", icon: MapPin },
  { title: "Feasibility", href: "/feasibility", icon: AlertTriangle },
  { title: "Profile", href: "/profile", icon: User },
  { title: "Integrations", href: "/settings/integrations", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { locale, setLocale, tr } = useI18n()
  const isDark = (resolvedTheme ?? theme ?? "light") === "dark"
  const isAdmin = isAdminRole(profile?.role ?? user?.role ?? null)
  const navItems = isAdmin ? [...baseNavItems, { title: "Admin", href: "/admin", icon: Shield }] : baseNavItems
  const activeNav = navItems.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))

  return (
    <SidebarProvider className={cn("transition-colors", isDark ? "bg-[#07090f] text-white" : "bg-slate-100 text-slate-900")}>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <Link href="/today" className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_12px_24px_rgba(0,0,0,0.16)] transition-colors",
                isDark ? "border-white/15 bg-white/10" : "border-black/10 bg-white/90",
              )}
            >
              <Image
                src="/auth/smart-planner-logo-white.svg"
                alt="Smart Planner logo"
                width={554}
                height={301}
                className={cn("h-5 w-auto opacity-95", !isDark && "invert")}
                priority
              />
            </div>
            <Image
              src="/auth/smart-planner-text-white.png"
              alt="Smart Planner"
              width={183}
              height={28}
              className={cn("h-4 w-auto opacity-95 group-data-[collapsible=icon]:hidden", !isDark && "invert")}
              priority
            />
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-1 group-data-[collapsible=icon]:px-0.5">
          <SidebarGroup className={cn("rounded-2xl border p-2 backdrop-blur-sm group-data-[collapsible=icon]:p-1.5", isDark ? "border-white/10 bg-white/[0.03]" : "border-black/10 bg-white/70")}>
            <SidebarGroupLabel className={cn(isDark ? "text-white/50" : "text-slate-600")}>{tr("Navigation", "Навигация")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                      tooltip={item.title}
                      className={cn(
                        "rounded-xl transition-colors",
                        isDark
                          ? "text-white/75 hover:bg-white/10 hover:text-white data-[active=true]:bg-white/[0.12] data-[active=true]:text-white"
                          : "text-slate-600 hover:bg-black/5 hover:text-slate-900 data-[active=true]:bg-black/[0.06] data-[active=true]:text-slate-900",
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>
                          {item.title === "Today" && tr("Today", "Сегодня")}
                          {item.title === "Events" && tr("Events", "События")}
                          {item.title === "AI Chat" && tr("AI Chat", "AI чат")}
                          {item.title === "Feed" && tr("Feed", "Лента")}
                          {item.title === "Routes" && tr("Routes", "Маршруты")}
                          {item.title === "Feasibility" && tr("Feasibility", "Успеваемость")}
                          {item.title === "Profile" && tr("Profile", "Профиль")}
                          {item.title === "Integrations" && tr("Integrations", "Интеграции")}
                          {item.title === "Admin" && tr("Admin Panel", "Админ панель")}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="px-1 group-data-[collapsible=icon]:px-0.5">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={tr("Support", "Поддержка")}
                className={cn(
                  "rounded-xl transition-colors",
                  isDark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-black/5 hover:text-slate-900",
                )}
              >
                <Link href="/support">
                  <LifeBuoy className="h-4 w-4" />
                  <span>{tr("Support", "Поддержка")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={tr("Language", "Язык")}
                className={cn(
                  "rounded-xl transition-colors",
                  isDark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-black/5 hover:text-slate-900",
                )}
                onClick={() => setLocale(locale === "en" ? "ru" : "en")}
              >
                <Languages className="h-4 w-4" />
                <span>{locale === "en" ? "EN" : "RU"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={isDark ? tr("Light mode", "Светлая тема") : tr("Dark mode", "Тёмная тема")}
                className={cn(
                  "rounded-xl transition-colors",
                  isDark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-slate-600 hover:bg-black/5 hover:text-slate-900",
                )}
                onClick={() => setTheme(isDark ? "light" : "dark")}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{isDark ? tr("Light mode", "Светлая тема") : tr("Dark mode", "Тёмная тема")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={tr("Account", "Аккаунт")}
                className={cn("pointer-events-none rounded-xl", isDark ? "text-white/65" : "text-slate-500")}
              >
                <User className="h-4 w-4" />
                <span className="truncate text-xs">
                  {profile?.display_name || user?.display_name || profile?.username || user?.username || user?.email || tr("Account", "Аккаунт")}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={tr("Sign out", "Выйти")}
                className={cn(
                  "rounded-xl transition-colors",
                  isDark ? "text-white/75 hover:bg-red-500/10 hover:text-red-100" : "text-slate-700 hover:bg-red-500/10 hover:text-red-700",
                )}
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
                <span>{tr("Sign out", "Выйти")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className={cn("h-svh overflow-hidden transition-colors", isDark ? "bg-[#07090f] text-white" : "bg-slate-50 text-slate-900")}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={cn("absolute left-[8%] top-[-4rem] h-52 w-52 rounded-full blur-[95px]", isDark ? "bg-blue-500/10" : "bg-blue-500/15")} />
          <div className={cn("absolute right-[16%] top-[5rem] h-64 w-64 rounded-full blur-[110px]", isDark ? "bg-cyan-400/[0.08]" : "bg-cyan-400/[0.12]")} />
          <div className={cn("absolute bottom-[6%] left-[35%] h-56 w-56 rounded-full blur-[120px]", isDark ? "bg-violet-500/[0.08]" : "bg-violet-500/[0.12]")} />
        </div>

        <header
          className={cn(
            "z-10 mx-4 mt-4 flex h-14 shrink-0 items-center gap-3 rounded-2xl border px-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm md:mx-6",
            isDark ? "border-white/10 bg-black/35" : "border-black/10 bg-white/70",
          )}
        >
          <SidebarTrigger className={cn("-ml-1", isDark ? "text-white hover:bg-white/10 hover:text-white" : "text-slate-700 hover:bg-black/5 hover:text-slate-900")} />
          <Separator orientation="vertical" className={cn("h-5", isDark ? "bg-white/10" : "bg-black/10")} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", isDark ? "text-white" : "text-slate-900")}>
              {activeNav?.title === "Today" && tr("Today", "Сегодня")}
              {activeNav?.title === "Events" && tr("Events", "События")}
              {activeNav?.title === "AI Chat" && tr("AI Chat", "AI чат")}
              {activeNav?.title === "Feed" && tr("Feed", "Лента")}
              {activeNav?.title === "Routes" && tr("Routes", "Маршруты")}
              {activeNav?.title === "Feasibility" && tr("Feasibility", "Успеваемость")}
              {activeNav?.title === "Profile" && tr("Profile", "Профиль")}
              {activeNav?.title === "Integrations" && tr("Integrations", "Интеграции")}
              {activeNav?.title === "Admin" && tr("Admin Panel", "Админ панель")}
              {!activeNav && (pathname.startsWith("/support") ? tr("Support", "Поддержка") : "Smart Planner")}
            </p>
            <p className={cn("truncate text-xs", isDark ? "text-white/45" : "text-slate-500")}>
              {tr("Focus mode dashboard", "Фокусный режим дашборда")}
            </p>
          </div>
          {isAdmin && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className={cn(
                "hidden rounded-xl sm:inline-flex",
                isDark
                  ? "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  : "border-black/10 bg-white/60 text-slate-900 hover:bg-white hover:text-slate-900",
              )}
            >
              <Link href="/admin">
                <Shield className="mr-1.5 h-4 w-4" />
                {tr("Admin", "Админ")}
              </Link>
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant="outline"
            className={cn(
              "hidden rounded-xl sm:inline-flex",
              isDark
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                : "border-black/10 bg-white/60 text-slate-900 hover:bg-white hover:text-slate-900",
            )}
          >
            <Link href="/feed">
              <Bell className="mr-1.5 h-4 w-4" />
              {tr("Feed", "Лента")}
            </Link>
          </Button>
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto px-0 pb-6 pt-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
