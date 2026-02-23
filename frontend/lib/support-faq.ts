export type SupportFaqItem = {
  id: string
  questionEn: string
  questionRu: string
  answerEn: string
  answerRu: string
}

export const SUPPORT_FAQ_ITEMS: SupportFaqItem[] = [
  {
    id: "feed-filters",
    questionEn: "Why don't I see notifications in the feed?",
    questionRu: "Почему я не вижу уведомления в ленте?",
    answerEn:
      "Open the Feed page and check the filter buttons on the right. Notifications, updates and reminders can be toggled independently.",
    answerRu:
      "Откройте страницу «Лента» и проверьте кнопки фильтров справа. Уведомления, обновления и напоминания можно включать и выключать независимо.",
  },
  {
    id: "browser-translate",
    questionEn: "Why can the page break when browser auto-translation is enabled?",
    questionRu: "Почему страница может ломаться при включённом автопереводе браузера?",
    answerEn:
      "Some browsers modify page markup during auto-translation, which may break React rendering. Disable auto-translation for this site and reload.",
    answerRu:
      "Некоторые браузеры изменяют разметку страницы при автопереводе, из-за чего может ломаться рендер React. Отключите автоперевод для сайта и перезагрузите страницу.",
  },
  {
    id: "telegram-2fa",
    questionEn: "How do I fix Telegram / 2FA issues?",
    questionRu: "Как исправить проблемы с Telegram / 2FA?",
    answerEn:
      "Open Integrations, verify Telegram connection status, then disable and re-enable Telegram 2FA if needed. If the flow is stuck, create a ticket with screenshots.",
    answerRu:
      "Откройте «Интеграции», проверьте статус подключения Telegram, затем при необходимости отключите и включите Telegram 2FA заново. Если процесс завис — создайте тикет со скриншотами.",
  },
  {
    id: "route-preview",
    questionEn: "Route preview is empty or incorrect. What should I check?",
    questionRu: "Предпросмотр маршрута пустой или неверный. Что проверить?",
    answerEn:
      "Check the event address, date/time and map provider settings in Integrations. Also confirm that the route endpoints are entered correctly.",
    answerRu:
      "Проверьте адрес события, дату/время и настройки карт в «Интеграциях». Также убедитесь, что точки маршрута указаны корректно.",
  },
  {
    id: "calendar-sync",
    questionEn: "Why are some events missing after synchronization?",
    questionRu: "Почему после синхронизации не видно часть событий?",
    answerEn:
      "Refresh the page, check the selected calendar source, and verify the date range. Some events can be filtered out by current view settings.",
    answerRu:
      "Обновите страницу, проверьте выбранный источник календаря и диапазон дат. Часть событий может быть скрыта текущими фильтрами отображения.",
  },
  {
    id: "assistant-mode",
    questionEn: "What is the difference between Planner and Companion modes?",
    questionRu: "Чем отличаются режимы «Планировщик» и «Помощник»?",
    answerEn:
      "Planner focuses on schedules, tasks and optimization. Companion is more universal and better for free-form questions and discussions.",
    answerRu:
      "«Планировщик» сфокусирован на расписании, задачах и оптимизации. «Помощник» более универсален и лучше подходит для свободных вопросов и обсуждений.",
  },
  {
    id: "assistant-voice",
    questionEn: "Voice input does not work. How can I fix it?",
    questionRu: "Не работает голосовой ввод. Как исправить?",
    answerEn:
      "Allow microphone access in your browser, reload the page, and try again. Some browsers may not support realtime speech recognition.",
    answerRu:
      "Разрешите доступ к микрофону в браузере, перезагрузите страницу и попробуйте снова. Некоторые браузеры не поддерживают realtime-распознавание речи.",
  },
  {
    id: "ticket-attachments",
    questionEn: "What files can I attach to a support ticket?",
    questionRu: "Какие файлы можно прикрепить к тикету поддержки?",
    answerEn:
      "You can attach up to 3 files, each up to 3 MB. Images, PDF, text, logs, JSON and ZIP files are supported.",
    answerRu:
      "Можно прикрепить до 3 файлов, каждый до 3 МБ. Поддерживаются изображения, PDF, текстовые файлы, логи, JSON и ZIP.",
  },
  {
    id: "ticket-response-time",
    questionEn: "How do I know that support replied to my ticket?",
    questionRu: "Как понять, что поддержка ответила на мой тикет?",
    answerEn:
      "You will see a new message inside the ticket chat and a support notification in the Feed page with the updated status.",
    answerRu:
      "Вы увидите новое сообщение в чате тикета и уведомление в «Ленте» с обновлённым статусом обращения.",
  },
  {
    id: "theme-issues",
    questionEn: "The theme looks wrong after switching. What should I do?",
    questionRu: "После смены темы интерфейс выглядит некорректно. Что делать?",
    answerEn:
      "Try a hard refresh (Ctrl+F5). If the problem remains, create a ticket and attach a screenshot of the page.",
    answerRu:
      "Сделайте жёсткое обновление страницы (Ctrl+F5). Если проблема останется — создайте тикет и приложите скриншот страницы.",
  },
  {
    id: "admin-access",
    questionEn: "Why can't I open the admin panel?",
    questionRu: "Почему я не могу открыть админ-панель?",
    answerEn:
      "The admin panel is protected by backend checks. Access is available only to users with an admin role configured in the system.",
    answerRu:
      "Админ-панель защищена backend-проверками. Доступ есть только у пользователей с ролью администратора, настроенной в системе.",
  },
]
