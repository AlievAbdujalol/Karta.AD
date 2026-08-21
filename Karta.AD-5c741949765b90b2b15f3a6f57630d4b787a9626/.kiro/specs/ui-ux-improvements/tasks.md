# Implementation Plan: UI/UX Improvements — Karta-AD

## Overview

Последовательная реализация 11 областей улучшений UI/UX: мобильный HomeHeader с Drawer и FilterPill, исправление BusMap (tileIndex + кластеризация), исправление SchedulePanel, доработка Reviews, улучшения ProfilePage, DriverDashboard, навигации Layout, Dark Mode, Skeleton Loaders, Error Boundaries и рефакторинг Tailwind. Используется React 18, Vite, Tailwind CSS 3, Radix UI, vaul, react-leaflet-cluster, next-themes, framer-motion, Vitest, @testing-library/react, fast-check.

---

## Tasks

- [ ] 1. Подготовка: зависимости, конфиг и общие утилиты
  - [x] 1.1 Установить недостающие зависимости и обновить tailwind.config.js
    - Добавить в `package.json`: `vaul`, `react-leaflet-cluster`, `next-themes`, `framer-motion`, `fast-check` (devDependency)
    - Добавить `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` как devDependencies (если ещё не установлены)
    - Установить `@vitest/coverage-v8` для покрытия
    - В `tailwind.config.js` установить `darkMode: 'class'`
    - Добавить плагины `tailwindcss-animate` (если не добавлен) в конфиг
    - _Requirements: 8.1, 8.3_

  - [x] 1.2 Создать конфигурацию Vitest и тестовый setup
    - Создать или обновить `vitest.config.js` с настройками `environment: 'jsdom'` и `setupFiles`
    - Создать `src/test/setup.js` с импортом `@testing-library/jest-dom`
    - Создать директорию `src/test/` для общих тестовых утилит и хелперов
    - _Requirements: все (тестовая инфраструктура)_

  - [x] 1.3 Создать утилитарные функции: `calcAvg`, `validatePhone`, `getGpsColor`
    - Создать `src/lib/utils.js` (или расширить существующий) с экспортом:
      - `calcAvg(reviews)` — среднее по `(cleanliness + politeness + punctuality) / 3`
      - `validatePhone(phone)` — regex `^\+992\s?\d{2}\s?\d{3}\s?\d{4}$`, пустая строка валидна
      - `getGpsColor(accuracy)` — возвращает `'green' | 'yellow' | 'red'` по диапазонам ≤20, ≤50, >50
    - _Requirements: 4.5, 5.3, 5.4, 6.1_

  - [ ]* 1.4 Написать property-тесты для утилитарных функций
    - **Property 7: Вычисление средней оценки по маршруту**
    - **Validates: Requirements 4.5**
    - `fc.array(fc.record({ cleanliness: fc.integer({min:1,max:5}), politeness: fc.integer({min:1,max:5}), punctuality: fc.integer({min:1,max:5}) }), { minLength: 1 })` → проверить что `calcAvg(reviews)` равно ожидаемому среднему
    - **Property 9: Валидация телефонного номера**
    - **Validates: Requirements 5.3, 5.4**
    - Генерировать валидные номера (по шаблону regex) → `validatePhone` возвращает `true`; генерировать невалидные строки → `validatePhone` возвращает `false`; пустая строка → `true`
    - **Property 11: GPS-индикатор точности по диапазонам**
    - **Validates: Requirements 6.1**
    - `fc.float({ min: 0, max: 20 })` → `getGpsColor` возвращает `'green'`; `fc.float({ min: 20.01, max: 50 })` → `'yellow'`; `fc.float({ min: 50.01, max: 500 })` → `'red'`

- [x] 2. Checkpoint — установить зависимости и проверить сборку
  - Убедиться, что `npm install` проходит без ошибок, `npm run build` не падает, тесты запускаются через `npx vitest --run`

- [x] 3. Создать ErrorBoundary компонент и обернуть маршруты
  - [x] 3.1 Создать `src/components/ErrorBoundary.jsx`
    - Реализовать класс-компонент `ErrorBoundary` с `state = { hasError: false, error: null }`
    - `static getDerivedStateFromError(error)` → `{ hasError: true, error }`
    - `componentDidCatch(error, info)` → `console.error` в DEV (`import.meta.env.DEV`)
    - `render()`: если `hasError` → рендерить `this.props.fallback?.(error)` или `<DefaultErrorFallback>`
    - Создать `DefaultErrorFallback` с кнопкой "Перезагрузить страницу" (`window.location.reload()`)
    - Создать `BusMapErrorFallback` — статичный `<div>` с сообщением об ошибке карты
    - Экспортировать оба компонента
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 3.2 Обернуть все маршруты и AuthenticatedApp в ErrorBoundary в `App.jsx`
    - Обернуть `<AuthenticatedApp>` в глобальный `<ErrorBoundary>` (Requirement 10.5)
    - Внутри `App.jsx` / роутинга: обернуть каждый `<Route>` (`Home`, `ReviewsPage`, `ProfilePage`, `DriverDashboard`, `AdminPanel`, `DriverSchedule`) в отдельный `<ErrorBoundary>`
    - Для маршрута `Home` использовать `BusMapErrorFallback` для вложенного BusMap
    - _Requirements: 10.1, 10.5_

  - [ ]* 3.3 Написать property-тест для ErrorBoundary
    - **Property 17: ErrorBoundary перехватывает ошибки и показывает fallback**
    - **Validates: Requirements 10.2**
    - Создать компонент `ThrowingChild`, который бросает ошибку при рендеринге
    - `fc.string({ minLength: 1 })` как сообщение ошибки → рендерить `<ErrorBoundary><ThrowingChild msg={msg} /></ErrorBoundary>` → проверить что в DOM есть текст fallback и кнопка "Перезагрузить страницу"

- [ ] 4. Подключить ThemeProvider и реализовать Dark Mode
  - [x] 4.1 Обернуть App в ThemeProvider из `next-themes`
    - Импортировать `{ ThemeProvider }` из `next-themes` в `App.jsx`
    - Обернуть `<AuthProvider>` / корень в `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
    - _Requirements: 8.1, 8.5_

  - [x] 4.2 Добавить `dark:` классы к Layout, HomeHeader, BusMap, SchedulePanel
    - В `Layout.jsx`: добавить `dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100` к контейнерам навигации
    - В `HomeHeader.jsx`: добавить `dark:bg-gray-800 dark:text-gray-100` к шапке и FilterPill
    - В `BusMap.jsx`: обёртка карты — `dark:bg-gray-800`
    - В `SchedulePanel.jsx`: панель — `dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700`
    - _Requirements: 8.3_

  - [x] 4.3 Добавить `dark:` классы к ReviewsPage, ProfilePage, DriverDashboard
    - В `src/pages/Reviews.jsx`: карточки отзывов, фильтр, форма — `dark:bg-gray-900 dark:text-gray-100`
    - В `src/pages/Profile.jsx`: форма, аватар, вкладки — `dark:bg-gray-900 dark:text-gray-100`
    - В `src/pages/DriverDashboard.jsx`: все карточки и кнопки — тёмные варианты
    - _Requirements: 8.3_

  - [-] 4.4 Добавить переключатель темы в ProfilePage
    - Импортировать `{ useTheme }` из `next-themes`
    - Добавить в раздел "Настройки" три кнопки (light / dark / system) или `<Switch>` для переключения темы
    - Показывать текущую тему
    - _Requirements: 8.2, 8.4_

  - [ ]* 4.5 Написать property-тест для сохранения темы
    - **Property 15: Тема сохраняется в localStorage (round-trip)**
    - **Validates: Requirements 8.4**
    - `fc.constantFrom('light', 'dark', 'system')` → вызвать `setTheme(value)` через тест с провайдером → проверить `localStorage['theme'] === value`

- [ ] 5. Создать NotificationContext и улучшить Layout навигацию
  - [x] 5.1 Создать `src/lib/NotificationContext.jsx` и NotificationProvider
    - Создать контекст `NotificationContext` с типом `{ count: number, notifications: [], clear: () => void }`
    - Создать `NotificationProvider` компонент
    - Экспортировать хук `useNotificationCount()`
    - Подключить `NotificationProvider` в `App.jsx` (внутри `ThemeProvider`)
    - _Requirements: 7.1_

  - [~] 5.2 Добавить `NavBadge`, анимацию и `aria-current` в `Layout.jsx`
    - Создать внутренний компонент `NavBadge({ count })`: при `count === 0` возвращает `null`; при `count > 99` показывает `"99+"`; иначе — число. CSS: `absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full`
    - Подключить `useNotificationCount()` и отобразить `<NavBadge>` на иконке навигации для маршрута `/`
    - Обернуть навигационные иконки в `motion.div` из `framer-motion` с `whileTap={{ scale: 0.9 }}`
    - Активный пункт получает класс `scale-110 transition-transform`
    - Добавить `aria-current="page"` к активному `<Link>` (через `useLocation` или через `NavLink` с `aria-current`)
    - Исправить метку навигации `/reviews`: `"Отзывы"` с иконкой `MessageSquare` из `lucide-react`
    - Заменить `style={{ boxShadow: '...' }}` на Tailwind-утилиты (`shadow-md` и т.д.)
    - _Requirements: 4.1, 7.1, 7.2, 7.3, 7.4, 7.5, 11.3_

  - [ ]* 5.3 Написать property-тесты для NavBadge и aria-current
    - **Property 13: Badge уведомлений**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - `fc.integer({ min: 0, max: 150 })` → рендерить `<NavBadge count={n} />` → если `n === 0`: DOM-элемент отсутствует; если `1 ≤ n ≤ 99`: badge содержит `String(n)`; если `n > 99`: badge содержит `"99+"`
    - **Property 14: aria-current для активного навигационного пункта**
    - **Validates: Requirements 7.5**
    - Для каждого из маршрутов навигации (`'/'`, `'/reviews'`, `'/profile'`) → рендерить Layout с текущим путём → проверить что ровно один nav-элемент имеет `aria-current="page"`, остальные — не имеют

- [ ] 6. Реализовать мобильный HomeHeader с Drawer и FilterPill
  - [x] 6.1 Создать хук `useSessionFilter` в `src/lib/useSessionFilter.js`
    - Хук принимает `(key: string, initial: T)` и возвращает `[value, setValue]`
    - При инициализации читает из `sessionStorage[key]` (JSON.parse), при отсутствии использует `initial`
    - `setValue` сохраняет в `sessionStorage[key]` (JSON.stringify) и обновляет state
    - _Requirements: 1.4_

  - [ ]* 6.2 Написать property-тест для useSessionFilter (round-trip)
    - **Property 2: Сохранение фильтров в sessionStorage (round-trip)**
    - **Validates: Requirements 1.4**
    - `fc.record({ country: fc.string(), cityId: fc.option(fc.string()), type: fc.constantFrom('all','bus','minibus'), routeId: fc.option(fc.string()) })` → вызвать `setValue(filter)` → читать из `sessionStorage` и JSON.parse → объект должен быть идентичен исходному

  - [-] 6.3 Рефакторинг `HomeHeader.jsx`: FilterPill с активным состоянием и Drawer
    - Создать компонент `FilterPill` внутри HomeHeader (или в отдельном файле `src/components/FilterPill.jsx`) с пропсами `{ icon, label, value, active, onClear, onClick, loading }`
    - При `active === true`: применять `bg-blue-600 text-white`; при `active === false`: стандартный стиль
    - При `active === true`: показывать кнопку сброса (×) с `onClear` хендлером
    - При `loading === true`: рендерить `<Skeleton className="h-9 w-24 rounded-2xl" />` вместо содержимого pill
    - На экранах `< 640px` (класс `block sm:hidden`): FilterPill при клике открывает `<Drawer>` из `vaul` (bottom-sheet)
    - На экранах `≥ 640px` (класс `hidden sm:block`): FilterPill отображает Radix UI `<Select>`
    - Подключить `useSessionFilter('home_filters', initialFilter)` для сохранения `{ country, cityId, type, routeId }`
    - Заменить все `style={{ ... }}` на Tailwind-классы (исключение: динамические `route.color`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 11.1_

  - [~] 6.4 Добавить OfflineBanner и InlineError в HomeHeader
    - Подключить `window.addEventListener('online'/'offline')` или `navigator.onLine` для определения `isOffline`
    - При `isOffline === true`: рендерить баннер "Нет соединения. Показаны кэшированные данные" над фильтрами
    - При ошибке загрузки + пустом кэше: рендерить inline-сообщение об ошибке под фильтрами с кнопкой "Повторить"
    - _Requirements: 1.5, 1.6_

  - [ ]* 6.5 Написать property-тест для FilterPill активного состояния
    - **Property 1: FilterPill активное состояние содержит правильные CSS-классы**
    - **Validates: Requirements 1.2, 1.3**
    - `fc.string({ minLength: 1 })` как `value` → рендерить `<FilterPill active={true} value={value} ... />` → проверить наличие CSS-класса `bg-blue-600` и `text-white`, и кнопки сброса в DOM
    - Для `active === false`: проверить отсутствие `bg-blue-600` и кнопки сброса

- [~] 7. Checkpoint — проверить HomeHeader, Dark Mode и ErrorBoundary
  - Убедиться что все тесты проходят (`npx vitest --run`), отсутствуют TypeScript/lint ошибки, компонент монтируется без ошибок

- [ ] 8. Исправить BusMap: tileIndex state и кластеризация маркеров
  - [x] 8.1 Поднять `tileIndex` в `BusMap.jsx` и передать в `MapControls`
    - Добавить `const [tileIndex, setTileIndex] = useState(0)` в `BusMap`
    - Передать `tileIndex` и `setTileIndex` как пропсы в `<MapControls tileIndex={tileIndex} setTileIndex={setTileIndex} />`
    - Обновить `TileLayer`: заменить хардкоженный URL на `url={TILE_LAYERS[tileIndex].url}`
    - В `MapControls.jsx`: получить `{ tileIndex, setTileIndex }` из пропсов и использовать их при смене слоя
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 8.2 Реализовать кластеризацию маркеров в `BusMap.jsx`
    - Импортировать `MarkerClusterGroup` из `react-leaflet-cluster`
    - Добавить `import 'react-leaflet-cluster/lib/assets/MarkerCluster.css'` и `.Default.css`
    - При `filteredVehicles.length > 15`: обернуть все маркеры в `<MarkerClusterGroup chunkedLoading>`
    - При `filteredVehicles.length ≤ 15`: рендерить маркеры без кластеризации
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ]* 8.3 Написать property-тест для tileIndex и кластеризации
    - **Property 3: TileLayer реагирует на tileIndex**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - `fc.integer({ min: 0, max: TILE_LAYERS.length - 1 })` → рендерить BusMap с mocked состоянием `tileIndex = n` → проверить что `TileLayer` получает `url === TILE_LAYERS[n].url`
    - **Property 4: Кластеризация при превышении порога маркеров**
    - **Validates: Requirements 2.5**
    - `fc.array(vehicleArbitrary, { minLength: 16, maxLength: 50 })` → рендерить BusMap → проверить что в DOM/tree присутствует `MarkerClusterGroup`; для массива ≤ 15 элементов — отсутствует

- [x] 9. Исправить SchedulePanel и рефакторинг SchedulePanel стилей
  - [x] 9.1 Исправить логику иконок в `SchedulePanel.jsx` и заменить inline-стили
    - Найти строку `expanded ? <ChevronDown /> : <ChevronUp />` и заменить на `expanded ? <ChevronUp /> : <ChevronDown />`
    - Заменить все `style={{ ... }}` объекты на эквивалентные Tailwind CSS классы в `SchedulePanel.jsx`
    - Добавить `dark:` варианты для фона, текста и бордеров
    - _Requirements: 3.1, 3.2, 3.3, 11.2_

  - [ ]* 9.2 Написать property-тест для иконок SchedulePanel
    - **Property 5: Корректные иконки SchedulePanel**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - `fc.boolean()` как значение `expanded` → рендерить `<SchedulePanel expanded={b} ... />` → при `b === false`: в DOM присутствует `ChevronDown` (проверить `data-testid` или aria-label), `ChevronUp` отсутствует; при `b === true`: наоборот

- [ ] 10. Улучшить ReviewsPage: фильтр, персистентность формы, avg оценка
  - [~] 10.1 Добавить фильтр по маршруту, персистентность формы и avg в `src/pages/Reviews.jsx`
    - Добавить state `filterRouteId` для фильтра на вкладке "Все отзывы"
    - Перенести state формы (`route_id`, `cleanliness`, `politeness`, `punctuality`, `comment`) в родительский компонент `Reviews` (не в дочерний `ReviewForm`)
    - Вычислять `routeAvgMap` из массива отзывов с помощью `calcAvg` из `src/lib/utils.js` и отображать avg в фильтре/заголовке
    - При успешной отправке: очистить форму и переключиться на вкладку "Все отзывы"
    - Показывать Skeleton-карточки (`<Skeleton className="h-28 w-full rounded-2xl" />` × 3) пока `isLoadingReviews === true`
    - Добавить `dark:` классы ко всем элементам страницы
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 9.2_

  - [ ]* 10.2 Написать property-тесты для Reviews формы и avg
    - **Property 6: Форма Reviews не сбрасывается при смене вкладок**
    - **Validates: Requirements 4.3**
    - `fc.record({ route_id: fc.string(), cleanliness: fc.integer({min:1,max:5}), politeness: fc.integer({min:1,max:5}), punctuality: fc.integer({min:1,max:5}), comment: fc.string() })` → заполнить форму → переключить на вкладку `list` → переключить обратно на `write` → все значения формы должны быть идентичны исходным
    - **Property 16: Skeleton на вкладке Reviews при загрузке**
    - **Validates: Requirements 9.2**
    - Рендерить `<ReviewsPage>` с mocked `isLoadingReviews = true` → подсчитать DOM-элементы с ролью/классом skeleton → результат ≥ 3

- [ ] 11. Улучшить ProfilePage: безопасность, валидация телефона, tab persist, Skeleton
  - [~] 11.1 Скрыть/заблокировать кнопку роли admin и добавить валидацию телефона в `src/pages/Profile.jsx`
    - Роль `admin` в кнопках рендерится только если `user?.role === 'admin'`; если пользователь admin — кнопка `disabled`
    - Добавить state `phoneError` — использовать `validatePhone` из `src/lib/utils.js`
    - Показывать inline-сообщение об ошибке под полем телефона при `phoneError`
    - Заблокировать кнопку "Сохранить" если `phoneError !== null`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [~] 11.2 Добавить персистентность вкладки и Skeleton в ProfilePage
    - Использовать `sessionStorage['profile_active_tab']` для сохранения/восстановления активной вкладки (`settings`, `favorites`, `history`)
    - При `!user` (загрузка профиля): рендерить Skeleton-блоки для аватара (`<Skeleton className="h-16 w-16 rounded-full" />`), имени и полей формы (`<Skeleton className="h-10 w-full rounded-xl" />` × 4)
    - Добавить `dark:` классы
    - _Requirements: 5.5, 9.3_

  - [ ]* 11.3 Написать property-тесты для Profile
    - **Property 8: Скрытие роли admin для не-администраторов**
    - **Validates: Requirements 5.1**
    - `fc.constantFrom('passenger', 'driver')` как `user.role` → рендерить `<ProfilePage user={{ role }} />` → проверить отсутствие DOM-элемента кнопки с текстом `admin`
    - **Property 10: Персистентность активной вкладки Profile в sessionStorage**
    - **Validates: Requirements 5.5**
    - `fc.constantFrom('settings', 'favorites', 'history')` → вызвать функцию смены вкладки → проверить `sessionStorage['profile_active_tab'] === tab`

- [ ] 12. Улучшить DriverDashboard: GPS индикатор, пауза, disabled кнопка, Skeleton
  - [~] 12.1 Добавить GPS accuracy индикатор, кнопку паузы и обработку ошибок геолокации
    - Добавить state `isPaused: boolean` и `gpsAccuracy: number | null`
    - Создать компонент `GpsSignalBadge({ accuracy })` с цветовой схемой из дизайна (использовать `getGpsColor` из utils)
    - Показывать `<GpsSignalBadge>` пока `isTracking === true`
    - Добавить кнопку "Пауза": при нажатии — `clearWatch(watchId)`, `setIsPaused(true)`, обновить Vehicle `{ speed: 0 }`, показать баннер "На паузе"
    - Добавить кнопку "Продолжить": при нажатии — `watchPosition` возобновляется, `setIsPaused(false)`
    - Обработать ошибки геолокации (`PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`) с `sonner toast` сообщениями
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [~] 12.2 Добавить disabled состояние кнопки старта и Skeleton в DriverDashboard
    - При `selectedRoute === ''`: кнопка "Начать рейс" получает `disabled`, классы `opacity-40 bg-gray-400 cursor-not-allowed`, и `title="Выберите маршрут для начала рейса"`
    - При `isLoadingRoutes === true`: рендерить `<Skeleton className="h-12 w-full rounded-xl" />` × 2 вместо select-полей
    - Добавить `dark:` классы
    - _Requirements: 6.5, 9.4_

  - [ ]* 12.3 Написать property-тесты для DriverDashboard
    - **Property 11: GPS-индикатор точности по диапазонам**
    - **Validates: Requirements 6.1**
    - `fc.float({ min: 0, max: 20 })` → рендерить `<GpsSignalBadge accuracy={v} />` → DOM содержит класс `bg-green-500`; `fc.float({ min: 20.01, max: 50 })` → `bg-yellow-500`; `fc.float({ min: 50.01, max: 200 })` → `bg-red-500`
    - **Property 12: Кнопка старта рейса disabled без маршрута**
    - **Validates: Requirements 6.5**
    - Рендерить `<DriverDashboard>` с `selectedRoute === ''` → кнопка "Начать рейс" имеет атрибут `disabled` и класс `opacity-40`

- [~] 13. Checkpoint — проверить все реализованные компоненты
  - Запустить `npx vitest --run` — все тесты должны проходить
  - Убедиться что `npm run build` проходит без ошибок

- [ ] 14. Рефакторинг Tailwind: удаление inline-стилей
  - [~] 14.1 Заменить inline-стили в `HomeHeader.jsx` и `Layout.jsx` на Tailwind-классы
    - В `HomeHeader.jsx`: заменить все `style={{ ... }}` на Tailwind-эквиваленты (см. таблицу в design.md); исключение: `style={{ background: route.color }}` для динамических цветов
    - В `Layout.jsx`: заменить `style={{ boxShadow: '...' }}` и аналогичные на `shadow-md`, `shadow-lg`; `style={{ height: '100dvh' }}` → `h-dvh`; `style={{ paddingBottom: 'env(...)' }}` → `pb-safe` (через `tailwindcss-safe-area`) или аналог
    - _Requirements: 11.1, 11.3_

  - [~] 14.2 Заменить inline-стили в компонентах `src/components/ui/`
    - Проверить все файлы в `src/components/ui/`: убрать inline-стили, заменить на Tailwind-классы и CSS-переменные
    - _Requirements: 11.4_

  - [~] 14.3 Добавить документацию соглашения по стилизации в README
    - В `README.md` добавить раздел "Соглашения по стилизации": использовать Tailwind CSS классы вместо inline-стилей, исключение для динамических runtime-значений
    - _Requirements: 11.5_

- [~] 15. Финальный checkpoint — все тесты и финальная сборка
  - Запустить `npx vitest --run` — все property и unit тесты должны проходить
  - Запустить `npm run build` — сборка без ошибок и предупреждений
  - Убедиться что все 11 требований реализованы и покрыты тестами

---

## Notes

- Задачи, помеченные `*`, опциональны и могут быть пропущены для более быстрого MVP
- Каждая задача ссылается на конкретные требования для трассируемости
- Checkpoint-задачи обеспечивают инкрементальную валидацию
- Property-тесты используют `fast-check` и запускаются через Vitest (`npx vitest --run`)
- Unit-тесты для `calcAvg`, `validatePhone`, `getGpsColor` — 100% покрытие
- Для property-тестов: минимум 100 итераций (`fc.assert(fc.property(...), { numRuns: 100 })`)
- Inline-стили с `route.color` — намеренные исключения из Requirement 11.1 (динамические runtime-значения)
- `react-leaflet-cluster` требует CSS-импорта для корректного отображения кластеров

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "3.1"] },
    { "id": 2, "tasks": ["1.4", "3.2"] },
    { "id": 3, "tasks": ["3.3", "4.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.3", "8.1"] },
    { "id": 5, "tasks": ["4.4", "6.4", "8.2", "9.1"] },
    { "id": 6, "tasks": ["4.5", "5.2", "6.2", "8.3", "9.2", "10.1", "11.1"] },
    { "id": 7, "tasks": ["5.3", "6.5", "10.2", "11.2", "12.1"] },
    { "id": 8, "tasks": ["11.3", "12.2"] },
    { "id": 9, "tasks": ["12.3", "14.1", "14.2"] },
    { "id": 10, "tasks": ["14.3"] }
  ]
}
```
