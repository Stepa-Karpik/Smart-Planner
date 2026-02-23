"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"
import { useAuth } from "@/lib/auth-store"
import { useProfile } from "@/lib/hooks"
import { isAdminRole } from "@/lib/authz"
import { useI18n } from "@/lib/i18n"

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const { tr } = useI18n()

  const effectiveRole = profile?.role ?? user?.role
  const isAdmin = isAdminRole(effectiveRole ?? null)

  useEffect(() => {
    if (!isLoading && effectiveRole && !isAdmin) {
      router.replace("/today")
    }
  }, [effectiveRole, isAdmin, isLoading, router])

  if (isLoading && !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-6 text-white">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-300" />
            <div>
              <h1 className="text-lg font-semibold">{tr("Admin access required", "Требуется доступ администратора")}</h1>
              <p className="mt-2 text-sm text-white/70">
                {tr(
                  "This page is available only for administrators.",
                  "Эта страница доступна только администраторам.",
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

