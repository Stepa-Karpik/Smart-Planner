import type { UserRole } from "./types"

export function isAdminRole(role?: UserRole | null): boolean {
  return role === "admin"
}

