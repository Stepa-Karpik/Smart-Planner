"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Save, Shield, UserRound } from "lucide-react"
import { toast } from "sonner"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAdminUsers, updateAdminUser } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import type { AdminUser, AdminUserUpdate, UserRole } from "@/lib/types"
import { cn } from "@/lib/utils"

type UserEditorState = {
  username: string
  display_name: string
  role: UserRole
  is_active: boolean
  new_password: string
}

function makeDraft(user: AdminUser): UserEditorState {
  return {
    username: user.username,
    display_name: user.display_name ?? "",
    role: user.role,
    is_active: user.is_active,
    new_password: "",
  }
}

function roleBadgeClass(role: UserRole) {
  return role === "admin"
    ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
    : "border-white/15 bg-white/5 text-white/70"
}

export default function AdminUsersPage() {
  const { tr } = useI18n()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const usersQuery = useAdminUsers({ q: deferredQuery || undefined, limit: 200, offset: 0 })
  const users = usersQuery.data ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UserEditorState | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedUser = useMemo(
    () => users.find((item) => item.user_id === selectedId) ?? null,
    [selectedId, users],
  )

  useEffect(() => {
    if (!users.length) {
      setSelectedId(null)
      setDraft(null)
      return
    }
    if (!selectedId || !users.some((item) => item.user_id === selectedId)) {
      setSelectedId(users[0].user_id)
      setDraft(makeDraft(users[0]))
    }
  }, [selectedId, users])

  async function handleSave() {
    if (!selectedUser || !draft) return

    const payload: AdminUserUpdate = {}
    if (draft.username.trim().toLowerCase() !== selectedUser.username) payload.username = draft.username.trim().toLowerCase()
    if ((draft.display_name.trim() || null) !== (selectedUser.display_name ?? null)) payload.display_name = draft.display_name.trim() || null
    if (draft.role !== selectedUser.role) payload.role = draft.role
    if (draft.is_active !== selectedUser.is_active) payload.is_active = draft.is_active
    if (draft.new_password.trim()) payload.new_password = draft.new_password.trim()

    if (Object.keys(payload).length === 0) {
      toast.message(tr("No changes to save", "Нет изменений для сохранения"))
      return
    }

    setSaving(true)
    const response = await updateAdminUser(selectedUser.user_id, payload)
    setSaving(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to update user", "Не удалось обновить пользователя"))
      return
    }

    toast.success(tr("User updated", "Пользователь обновлен"))
    await usersQuery.mutate()
    setDraft(makeDraft(response.data))
  }

  return (
    <AdminPageShell
      titleEn="Users"
      titleRu="Пользователи"
      descriptionEn="Manage usernames, roles, passwords, and account availability."
      descriptionRu="Управляйте юзернеймами, ролями, паролями и доступностью аккаунтов."
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          onClick={() => void usersQuery.mutate()}
          disabled={usersQuery.isLoading}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", usersQuery.isLoading && "animate-spin")} />
          {tr("Refresh", "Обновить")}
        </Button>
      }
    >
      <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">{tr("Users list", "Список пользователей")}</CardTitle>
          <CardDescription className="text-white/45">
            {tr("Select a user to edit account settings", "Выберите пользователя для редактирования параметров аккаунта")}
          </CardDescription>
          <div className="pt-1">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Search by email or username", "Поиск по email или username")}
              className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
            />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
            {usersQuery.isLoading && !usersQuery.data ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : usersQuery.error ? (
              <div className="p-4 text-sm text-red-200">
                {tr("Failed to load users.", "Не удалось загрузить пользователей.")}
              </div>
            ) : users.length === 0 ? (
              <div className="p-4 text-sm text-white/60">{tr("No users found", "Пользователи не найдены")}</div>
            ) : (
              <div className="space-y-2 p-2">
                {users.map((user) => {
                  const active = user.user_id === selectedId
                  return (
                    <button
                      key={user.user_id}
                      type="button"
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition",
                        active ? "border-white/20 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                      )}
                      onClick={() => {
                        setSelectedId(user.user_id)
                        setDraft(makeDraft(user))
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                            <p className="break-words text-sm font-medium text-white">{user.display_name || user.username}</p>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                              <Badge variant="outline" className={cn("rounded-full text-[10px]", roleBadgeClass(user.role))}>
                                {user.role === "admin" ? (
                                  <>
                                    <Shield className="mr-1 h-3 w-3" />
                                    {tr("Admin", "РђРґРјРёРЅ")}
                                  </>
                                ) : (
                                  tr("User", "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ")
                                )}
                              </Badge>
                              <span className={cn("text-xs", user.is_active ? "text-emerald-300" : "text-red-300")}>
                                {user.is_active ? tr("Active", "РђРєС‚РёРІРµРЅ") : tr("Disabled", "РћС‚РєР»СЋС‡РµРЅ")}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-white/45">
                            <p className="break-all">@{user.username}</p>
                            <p className="break-all">{user.email}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <Card className="rounded-2xl border-white/10 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">{tr("User editor", "Редактор пользователя")}</CardTitle>
              <CardDescription className="text-white/45">
                {selectedUser
                  ? `${selectedUser.email}`
                  : tr("Select a user from the list", "Выберите пользователя из списка")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedUser || !draft ? (
                <p className="text-sm text-white/50">{tr("No user selected", "Пользователь не выбран")}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="admin-user-username" className="text-white/80">
                      {tr("Username", "Username")}
                    </Label>
                    <Input
                      id="admin-user-username"
                      value={draft.username}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, username: event.target.value } : prev))}
                      className="h-10 rounded-xl border-white/15 bg-white/5 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-user-display" className="text-white/80">
                      {tr("Display name", "Отображаемое имя")}
                    </Label>
                    <Input
                      id="admin-user-display"
                      value={draft.display_name}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, display_name: event.target.value } : prev))}
                      className="h-10 rounded-xl border-white/15 bg-white/5 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-user-role" className="text-white/80">
                      {tr("Role", "Роль")}
                    </Label>
                    <select
                      id="admin-user-role"
                      value={draft.role}
                      onChange={(event) =>
                        setDraft((prev) => (prev ? { ...prev, role: event.target.value as UserRole } : prev))
                      }
                      className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
                    >
                      <option value="user" className="bg-[#0b0f17]">
                        {tr("User", "Пользователь")}
                      </option>
                      <option value="admin" className="bg-[#0b0f17]">
                        {tr("Admin", "Администратор")}
                      </option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-white">{tr("Account active", "Аккаунт активен")}</p>
                      <p className="text-xs text-white/45">
                        {tr("Disable to block sign in", "Отключите, чтобы запретить вход")}
                      </p>
                    </div>
                    <Switch
                      checked={draft.is_active}
                      onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, is_active: !!checked } : prev))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-user-password" className="text-white/80">
                      {tr("New password (optional)", "Новый пароль (необязательно)")}
                    </Label>
                    <Input
                      id="admin-user-password"
                      type="password"
                      value={draft.new_password}
                      onChange={(event) => setDraft((prev) => (prev ? { ...prev, new_password: event.target.value } : prev))}
                      placeholder={tr("Leave empty to keep current password", "Оставьте пустым, чтобы не менять пароль")}
                      className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                    />
                  </div>

                  <Button type="button" onClick={handleSave} className="w-full rounded-xl" disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {tr("Save changes", "Сохранить изменения")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </AdminPageShell>
  )
}
