"use client"

import { AdminRouteGuard } from "@/components/admin/admin-route-guard"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminRouteGuard>{children}</AdminRouteGuard>
}

