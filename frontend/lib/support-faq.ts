export type SupportFaqItem = {
  id: string
  questionEn: string
  questionRu: string
  answerEn: string
  answerRu: string
}

export type SupportFaqCategory = {
  id: string
  titleEn: string
  titleRu: string
  descriptionEn: string
  descriptionRu: string
  items: SupportFaqItem[]
}

export const SUPPORT_FAQ_CATEGORIES: SupportFaqCategory[] = [
  {
    id: "assistant",
    titleEn: "Assistant",
    titleRu: "Ассистент",
    descriptionEn: "Planner mode, companion mode, chat names and voice input.",
    descriptionRu: "Режимы, названия чатов, голосовой ввод и работа с расписанием.",
    items: [
      {
        id: "assistant-mode",
        questionEn: "What is the difference between Planner and Companion?",
        questionRu: "Чем отличаются «Планировщик» и «Помощник»?",
        answerEn: "Planner works with schedules, events, routes and optimization. Companion is better for regular questions and free-form chat.",
        answerRu: "«Планировщик» работает с расписанием, событиями, маршрутами и оптимизацией. «Помощник» лучше для обычных вопросов и свободного диалога.",
      },
      {
        id: "assistant-title",
        questionEn: "How are chat names created?",
        questionRu: "Как создаются названия чатов?",
        answerEn: "A new chat gets a short title from the first user message. Later messages do not rename the chat.",
        answerRu: "Новый чат получает короткое название по первому сообщению пользователя. Следующие сообщения название не меняют.",
      },
      {
        id: "assistant-voice",
        questionEn: "Voice input does not work. What should I check?",
        questionRu: "Не работает голосовой ввод. Что проверить?",
        answerEn: "Allow microphone access in the browser and reload the page. Some browsers do not support realtime speech recognition.",
        answerRu: "Разрешите доступ к микрофону в браузере и перезагрузите страницу. Некоторые браузеры не поддерживают realtime-распознавание.",
      },
    ],
  },
  {
    id: "tickets",
    titleEn: "Tickets",
    titleRu: "Тикеты",
    descriptionEn: "Support chats, attachments and response status.",
    descriptionRu: "Чаты поддержки, вложения и статусы ответов.",
    items: [
      {
        id: "ticket-create",
        questionEn: "What should I include in a support ticket?",
        questionRu: "Что писать в тикете поддержки?",
        answerEn: "Add a short title, the expected result, what happened instead, and screenshots or logs when possible.",
        answerRu: "Укажите короткое название, ожидаемый результат, что произошло фактически, и по возможности приложите скриншоты или логи.",
      },
      {
        id: "ticket-attachments",
        questionEn: "What files can I attach?",
        questionRu: "Какие файлы можно прикрепить?",
        answerEn: "Up to 3 files, each up to 3 MB. Images, PDF, text, logs, JSON and ZIP files are supported.",
        answerRu: "До 3 файлов, каждый до 3 МБ. Поддерживаются изображения, PDF, текстовые файлы, логи, JSON и ZIP.",
      },
      {
        id: "ticket-response-time",
        questionEn: "How do I know support replied?",
        questionRu: "Как понять, что поддержка ответила?",
        answerEn: "The ticket chat will show a new message, and the Feed page will show a support notification.",
        answerRu: "В чате тикета появится новое сообщение, а в «Ленте» появится уведомление поддержки.",
      },
    ],
  },
  {
    id: "integrations",
    titleEn: "Integrations",
    titleRu: "Интеграции",
    descriptionEn: "Telegram, maps and connected services.",
    descriptionRu: "Telegram, карты и подключенные сервисы.",
    items: [
      {
        id: "telegram-link",
        questionEn: "Telegram is not linked. What should I do?",
        questionRu: "Telegram не привязан. Что делать?",
        answerEn: "Open Integrations, start the linking flow again, and confirm the code in Telegram before it expires.",
        answerRu: "Откройте «Интеграции», запустите привязку заново и подтвердите код в Telegram до истечения срока.",
      },
      {
        id: "map-provider",
        questionEn: "How do I change the map provider?",
        questionRu: "Как сменить провайдера карт?",
        answerEn: "Open Integrations and select the map provider. Route previews and event maps will use that setting.",
        answerRu: "Откройте «Интеграции» и выберите провайдера карт. Предпросмотр маршрутов и карты событий будут использовать эту настройку.",
      },
    ],
  },
  {
    id: "events",
    titleEn: "Events",
    titleRu: "События",
    descriptionEn: "Creation, routes, reminders and conflicts.",
    descriptionRu: "Создание, маршруты, напоминания и конфликты.",
    items: [
      {
        id: "event-route",
        questionEn: "Where did route building move?",
        questionRu: "Куда перенесли построение маршрута?",
        answerEn: "Routes are built inside the event page. The default mode comes from Profile, and you can switch it inside the event.",
        answerRu: "Маршрут строится внутри страницы события. Способ по умолчанию берется из профиля, но его можно сменить прямо в событии.",
      },
      {
        id: "event-reminders",
        questionEn: "How do reminders work?",
        questionRu: "Как работают напоминания?",
        answerEn: "Open an event and add reminders in the reminders block. Notifications will be sent according to the configured time.",
        answerRu: "Откройте событие и добавьте напоминания в блоке напоминаний. Уведомления уйдут по настроенному времени.",
      },
    ],
  },
  {
    id: "gantt",
    titleEn: "Gantt charts",
    titleRu: "Диаграммы ганта",
    descriptionEn: "Timeline view and schedule density.",
    descriptionRu: "Временная шкала и плотность расписания.",
    items: [
      {
        id: "gantt-purpose",
        questionEn: "What is the Gantt chart for?",
        questionRu: "Для чего нужна диаграмма Ганта?",
        answerEn: "It shows events as a timeline, making overlaps, long blocks and busy days easier to scan.",
        answerRu: "Она показывает события на временной шкале, чтобы быстрее видеть пересечения, длинные блоки и загруженные дни.",
      },
      {
        id: "gantt-missing",
        questionEn: "Why is an event missing from the chart?",
        questionRu: "Почему события нет на диаграмме?",
        answerEn: "Check the selected date range, event status and current filters on the events page.",
        answerRu: "Проверьте выбранный диапазон дат, статус события и текущие фильтры на странице событий.",
      },
    ],
  },
  {
    id: "login",
    titleEn: "2FA and login",
    titleRu: "2FA и вход",
    descriptionEn: "Authenticator, Telegram approval and account access.",
    descriptionRu: "Аутентификатор, подтверждение в Telegram и доступ к аккаунту.",
    items: [
      {
        id: "twofa-switch",
        questionEn: "Can I keep several 2FA methods linked?",
        questionRu: "Можно ли держать несколько методов 2FA привязанными?",
        answerEn: "Yes. Only one method is active at a time, but linked methods can remain stored until you unlink them.",
        answerRu: "Да. Одновременно активен только один способ, но привязанные методы могут храниться, пока вы их не отвяжете.",
      },
      {
        id: "login-problems",
        questionEn: "I cannot sign in. What should I check first?",
        questionRu: "Не получается войти. Что проверить сначала?",
        answerEn: "Check the password, active 2FA method and browser time. If Telegram approval is used, confirm the request before it expires.",
        answerRu: "Проверьте пароль, активный метод 2FA и время в браузере. Если используется Telegram, подтвердите запрос до истечения срока.",
      },
    ],
  },
]
