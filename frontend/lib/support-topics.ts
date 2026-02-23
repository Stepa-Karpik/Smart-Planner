import type { Locale } from "@/lib/i18n"
import type { SupportTicketStatus } from "@/lib/types"

export type SupportSubtopicDef = {
  id: string
  titleEn: string
  titleRu: string
}

export type SupportTopicDef = {
  id: string
  titleEn: string
  titleRu: string
  subtopics: SupportSubtopicDef[]
}

export const SUPPORT_TOPICS: SupportTopicDef[] = [
  {
    id: "account",
    titleEn: "Account & Access",
    titleRu: "Аккаунт и доступ",
    subtopics: [
      { id: "login", titleEn: "Login issues", titleRu: "Проблемы со входом" },
      { id: "twofa", titleEn: "2FA and Telegram", titleRu: "2FA и Telegram" },
      { id: "profile", titleEn: "Profile settings", titleRu: "Настройки профиля" },
      { id: "other", titleEn: "Other", titleRu: "Другое" },
    ],
  },
  {
    id: "calendar",
    titleEn: "Calendar & Events",
    titleRu: "Календарь и события",
    subtopics: [
      { id: "create-edit", titleEn: "Creating/editing events", titleRu: "Создание/редактирование событий" },
      { id: "reminders", titleEn: "Reminders", titleRu: "Напоминания" },
      { id: "sync", titleEn: "Synchronization", titleRu: "Синхронизация" },
      { id: "other", titleEn: "Other", titleRu: "Другое" },
    ],
  },
  {
    id: "routes",
    titleEn: "Routes & Maps",
    titleRu: "Маршруты и карты",
    subtopics: [
      { id: "search", titleEn: "Search / geocoding", titleRu: "Поиск / геокодирование" },
      { id: "preview", titleEn: "Route preview", titleRu: "Предпросмотр маршрута" },
      { id: "provider", titleEn: "Map provider", titleRu: "Провайдер карты" },
      { id: "other", titleEn: "Other", titleRu: "Другое" },
    ],
  },
  {
    id: "billing-product",
    titleEn: "Product Feedback",
    titleRu: "Обратная связь по продукту",
    subtopics: [
      { id: "bug", titleEn: "Bug report", titleRu: "Сообщение об ошибке" },
      { id: "feature", titleEn: "Feature request", titleRu: "Запрос функции" },
      { id: "ui", titleEn: "Interface issue", titleRu: "Проблема интерфейса" },
      { id: "other", titleEn: "Other", titleRu: "Другое" },
    ],
  },
  {
    id: "other",
    titleEn: "Other",
    titleRu: "Другое",
    subtopics: [{ id: "other", titleEn: "Other", titleRu: "Другое" }],
  },
]

export function getLocalizedSupportText(locale: Locale, en: string, ru: string) {
  return locale === "ru" ? ru : en
}

export function findSupportTopic(value: string | null | undefined): SupportTopicDef | null {
  if (!value) return null
  return SUPPORT_TOPICS.find((topic) => topic.id === value) ?? null
}

export function findSupportSubtopic(topicValue: string | null | undefined, subtopicValue: string | null | undefined): SupportSubtopicDef | null {
  const topic = findSupportTopic(topicValue)
  if (!topic || !subtopicValue) return null
  return topic.subtopics.find((subtopic) => subtopic.id === subtopicValue) ?? null
}

export function supportTopicLabel(locale: Locale, value: string | null | undefined) {
  const topic = findSupportTopic(value)
  if (!topic) return value ?? ""
  return getLocalizedSupportText(locale, topic.titleEn, topic.titleRu)
}

export function supportSubtopicLabel(locale: Locale, topicValue: string | null | undefined, subtopicValue: string | null | undefined) {
  const subtopic = findSupportSubtopic(topicValue, subtopicValue)
  if (!subtopic) return subtopicValue ?? ""
  return getLocalizedSupportText(locale, subtopic.titleEn, subtopic.titleRu)
}

export function supportStatusLabel(locale: Locale, status: SupportTicketStatus) {
  if (locale === "ru") {
    if (status === "open") return "Открыт"
    if (status === "answered") return "Есть ответ"
    return "Закрыт"
  }
  if (status === "open") return "Open"
  if (status === "answered") return "Answered"
  return "Closed"
}

