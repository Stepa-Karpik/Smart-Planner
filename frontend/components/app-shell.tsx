"use client"

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
import {
  CalendarDays,
  Sun,
  List,
  Settings,
  MapPin,
  AlertTriangle,
  MessageSquare,
  Moon,
  LogOut,
  User,
  Languages,
} from "lucide-react"
import { useI18n } from "@/lib/i18n"

const navItems = [
  { title: "Today", href: "/today", icon: Sun },
  { title: "Events", href: "/events", icon: List },
  { title: "AI Chat", href: "/ai", icon: MessageSquare },
  { title: "Routes", href: "/routes", icon: MapPin },
  { title: "Feasibility", href: "/feasibility", icon: AlertTriangle },
  { title: "Profile", href: "/profile", icon: User },
  { title: "Integrations", href: "/settings/integrations", icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { locale, setLocale, tr } = useI18n()

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <Link href="/today" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarDays className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground truncate group-data-[collapsible=icon]:hidden">
              Smart Planner
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{tr("Navigation", "Навигация")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>
                          {item.title === "Today" && tr("Today", "Сегодня")}
                          {item.title === "Events" && tr("Events", "События")}
                          {item.title === "AI Chat" && tr("AI Chat", "AI чат")}
                          {item.title === "Routes" && tr("Routes", "Маршруты")}
                          {item.title === "Feasibility" && tr("Feasibility", "Успеваемость")}
                          {item.title === "Profile" && tr("Profile", "Профиль")}
                          {item.title === "Integrations" && tr("Integrations", "Интеграции")}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={tr("Language", "Язык")} onClick={() => setLocale(locale === "en" ? "ru" : "en")}>
                <Languages className="h-4 w-4" />
                <span>{locale === "en" ? "EN" : "RU"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={theme === "dark" ? tr("Light mode", "Светлая тема") : tr("Dark mode", "Тёмная тема")}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{theme === "dark" ? tr("Light mode", "Светлая тема") : tr("Dark mode", "Тёмная тема")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={tr("Account", "Аккаунт")} className="pointer-events-none">
                <User className="h-4 w-4" />
                <span className="truncate text-xs">
                  {profile?.display_name || user?.display_name || profile?.username || user?.username || user?.email || tr("Account", "Аккаунт")}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={tr("Sign out", "Выйти")} onClick={signOut}>
                <LogOut className="h-4 w-4" />
                <span>{tr("Sign out", "Выйти")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur-sm px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1" />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
