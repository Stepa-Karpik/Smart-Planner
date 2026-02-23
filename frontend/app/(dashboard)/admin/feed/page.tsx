"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Bell, Loader2, PencilLine, Plus, Save, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AdminPageShell } from "@/components/admin/admin-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { createAdminFeedItem, patchAdminFeedItem, removeAdminFeedItem, useAdminFeed } from "@/lib/hooks"
import { useI18n } from "@/lib/i18n"
import type { FeedItem, FeedItemType } from "@/lib/types"
import { cn } from "@/lib/utils"

type FeedEditorState = {
  type: FeedItemType
  title: string
  body: string
  target_username: string
  published_at_local: string
}

const TYPE_META: Record<FeedItemType, { dot: string; labelEn: string; labelRu: string }> = {
  notification: { dot: "bg-sky-400", labelEn: "Notification", labelRu: "Уведомление" },
  update: { dot: "bg-violet-400", labelEn: "Update", labelRu: "Обновление" },
  reminder: { dot: "bg-amber-400", labelEn: "Reminder", labelRu: "Напоминание" },
}

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIsoOrNull(localValue: string): string | null {
  const value = localValue.trim()
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function emptyDraft(): FeedEditorState {
  return {
    type: "update",
    title: "",
    body: "",
    target_username: "",
    published_at_local: "",
  }
}

function draftFromItem(item: FeedItem): FeedEditorState {
  return {
    type: item.type,
    title: item.title,
    body: item.body,
    target_username: item.target_username ?? "",
    published_at_local: toLocalDateTimeInput(item.published_at),
  }
}

function formatFeedDate(value: string, locale: "en" | "ru") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function AdminFeedPage() {
  const { tr, locale } = useI18n()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [typeFilter, setTypeFilter] = useState<"all" | FeedItemType>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<FeedEditorState>(emptyDraft)
  const [mode, setMode] = useState<"create" | "edit">("create")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const feedQuery = useAdminFeed({
    q: deferredQuery || undefined,
    types: typeFilter === "all" ? undefined : [typeFilter],
    limit: 200,
    offset: 0,
  })
  const items = feedQuery.data ?? []

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId])

  useEffect(() => {
    if (mode === "edit" && selectedId && !items.some((item) => item.id === selectedId)) {
      setMode("create")
      setSelectedId(null)
      setDraft(emptyDraft())
    }
  }, [items, mode, selectedId])

  function startCreate() {
    setMode("create")
    setSelectedId(null)
    setDraft(emptyDraft())
  }

  function startEdit(item: FeedItem) {
    setMode("edit")
    setSelectedId(item.id)
    setDraft(draftFromItem(item))
  }

  async function handleSave() {
    const title = draft.title.trim()
    const body = draft.body.trim()

    if (!title || !body) {
      toast.error(tr("Title and message are required", "Нужны заголовок и сообщение"))
      return
    }

    setSaving(true)

    if (mode === "create") {
      const response = await createAdminFeedItem({
        type: draft.type,
        title,
        body,
        target_username: draft.target_username.trim() || null,
        published_at: toIsoOrNull(draft.published_at_local),
      })
      setSaving(false)

      if (response.error || !response.data) {
        toast.error(response.error?.message || tr("Failed to create feed item", "Не удалось создать событие ленты"))
        return
      }

      toast.success(tr("Feed item created", "Событие ленты создано"))
      setMode("edit")
      setSelectedId(response.data.id)
      setDraft(draftFromItem(response.data))
      void feedQuery.mutate()
      return
    }

    if (!selectedItem) {
      setSaving(false)
      toast.error(tr("Select feed item to edit", "Выберите событие ленты для редактирования"))
      return
    }

    const payload: {
      type?: FeedItemType
      title?: string
      body?: string
      target_username?: string | null
      published_at?: string
    } = {
      type: draft.type,
      title,
      body,
      target_username: draft.target_username.trim() || "",
    }
    const publishedAt = toIsoOrNull(draft.published_at_local)
    if (publishedAt) {
      payload.published_at = publishedAt
    }

    const response = await patchAdminFeedItem(selectedItem.id, payload)
    setSaving(false)

    if (response.error || !response.data) {
      toast.error(response.error?.message || tr("Failed to update feed item", "Не удалось обновить событие ленты"))
      return
    }

    toast.success(tr("Feed item updated", "Событие ленты обновлено"))
    setDraft(draftFromItem(response.data))
    void feedQuery.mutate()
  }

  async function handleDelete() {
    if (!selectedItem) return
    setDeleting(true)
    const response = await removeAdminFeedItem(selectedItem.id)
    setDeleting(false)

    if (response.error) {
      toast.error(response.error.message || tr("Failed to delete feed item", "Не удалось удалить событие ленты"))
      return
    }

    toast.success(tr("Feed item deleted", "Событие ленты удалено"))
    startCreate()
    void feedQuery.mutate()
  }

  return (
    <AdminPageShell
      titleEn="Feed Management"
      titleRu="Управление лентой"
      descriptionEn="Create and edit notifications, updates, reminders, and targeted feed events for specific users or all users."
      descriptionRu="Создавайте и редактируйте уведомления, обновления, напоминания и адресные события ленты для конкретных пользователей или всех."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={startCreate}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {tr("New item", "Новое событие")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={() => void feedQuery.mutate()}
            disabled={feedQuery.isLoading}
          >
            <Bell className={cn("mr-1.5 h-4 w-4", feedQuery.isLoading && "animate-pulse")} />
            {tr("Refresh", "Обновить")}
          </Button>
        </>
      }
    >
      <Card className="rounded-2xl border-white/10 bg-black/30 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">{tr("Feed events", "События ленты")}</CardTitle>
          <CardDescription className="text-white/45">
            {tr("Select an item to edit or create a new one", "Выберите событие для редактирования или создайте новое")}
          </CardDescription>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_200px]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Search in title or message", "Поиск по заголовку или сообщению")}
              className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "all" | FeedItemType)}
              className="h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="all" className="bg-[#0b0f17]">
                {tr("All types", "Все типы")}
              </option>
              <option value="notification" className="bg-[#0b0f17]">
                {tr("Notifications", "Уведомления")}
              </option>
              <option value="update" className="bg-[#0b0f17]">
                {tr("Updates", "Обновления")}
              </option>
              <option value="reminder" className="bg-[#0b0f17]">
                {tr("Reminders", "Напоминания")}
              </option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            {feedQuery.isLoading && !feedQuery.data ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
            ) : feedQuery.error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4 text-sm text-red-200">
                {tr("Failed to load feed events", "Не удалось загрузить события ленты")}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                {tr("No feed items found", "События ленты не найдены")}
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => startEdit(item)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    item.id === selectedId
                      ? "border-white/20 bg-white/[0.08]"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", TYPE_META[item.type].dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 text-white/80">
                          {tr(TYPE_META[item.type].labelEn, TYPE_META[item.type].labelRu)}
                        </Badge>
                        <span className="text-xs text-white/45">{formatFeedDate(item.published_at, locale)}</span>
                        <span className="text-xs text-white/35">
                          {item.target_username
                            ? `${tr("to", "для")} @${item.target_username}`
                            : tr("for all users", "для всех пользователей")}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-white/55">{item.body}</p>
                    </div>
                    <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
                  </div>
                </button>
              ))
            )}
          </div>

          <Card className="rounded-2xl border-white/10 bg-white/[0.02]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white">
                {mode === "create" ? tr("Create feed event", "Создать событие ленты") : tr("Edit feed event", "Редактировать событие ленты")}
              </CardTitle>
              <CardDescription className="text-white/45">
                {mode === "create"
                  ? tr("Configure a new event and send it", "Настройте новое событие и отправьте его")
                  : selectedItem
                    ? `${tr("Editing item", "Редактирование события")}: ${selectedItem.id.slice(0, 8)}...`
                    : tr("Select an item from the list", "Выберите событие из списка")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feed-type" className="text-white/80">
                  {tr("Category", "Категория")}
                </Label>
                <select
                  id="feed-type"
                  value={draft.type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value as FeedItemType }))}
                  className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
                >
                  {(Object.keys(TYPE_META) as FeedItemType[]).map((type) => (
                    <option key={type} value={type} className="bg-[#0b0f17]">
                      {tr(TYPE_META[type].labelEn, TYPE_META[type].labelRu)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed-title" className="text-white/80">
                  {tr("Name / title", "Имя / заголовок")}
                </Label>
                <Input
                  id="feed-title"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder={tr("Example: New release 1.2.0", "Например: Новый релиз 1.2.0")}
                  className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed-target" className="text-white/80">
                  {tr("Recipient username (leave empty for all)", "Username получателя (оставьте пустым для всех)")}
                </Label>
                <Input
                  id="feed-target"
                  value={draft.target_username}
                  onChange={(event) => setDraft((prev) => ({ ...prev, target_username: event.target.value }))}
                  placeholder={tr("all users", "все пользователи")}
                  className="h-10 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setDraft((prev) => ({ ...prev, target_username: "" }))}
                  >
                    {tr("Send to all", "Отправить всем")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed-published-at" className="text-white/80">
                  {tr("Time of publication", "Время публикации")}
                </Label>
                <Input
                  id="feed-published-at"
                  type="datetime-local"
                  value={draft.published_at_local}
                  onChange={(event) => setDraft((prev) => ({ ...prev, published_at_local: event.target.value }))}
                  className="h-10 rounded-xl border-white/15 bg-white/5 text-white"
                />
                <p className="text-xs text-white/40">
                  {tr(
                    "Leave empty when creating to use current time. Clearing time on existing items keeps the previous value.",
                    "Оставьте пустым при создании, чтобы использовать текущее время. Если очистить поле у существующего события, будет сохранено прежнее время.",
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed-body" className="text-white/80">
                  {tr("Message text", "Текст сообщения")}
                </Label>
                <Textarea
                  id="feed-body"
                  value={draft.body}
                  onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                  placeholder={tr("Describe the update / notification / reminder", "Опишите обновление / уведомление / напоминание")}
                  className="min-h-[140px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleSave} className="flex-1 rounded-xl" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "create" ? <Send className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                  {mode === "create" ? tr("Create event", "Создать событие") : tr("Save changes", "Сохранить изменения")}
                </Button>
                {mode === "edit" && selectedItem ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-xl border-red-400/25 bg-red-500/5 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                  >
                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    {tr("Delete", "Удалить")}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </AdminPageShell>
  )
}

