# Requirements Document

## Introduction

Данная спецификация описывает улучшения UI/UX, логики и функциональности приложения **Karta-AD** — транспортного веб-приложения для Таджикистана на стеке React + Vite + Tailwind + Radix UI + Leaflet.

Приложение обслуживает три роли пользователей: пассажир (passenger), водитель (driver), администратор (admin). Основные страницы: Home (карта + маршруты), Profile, Reviews, DriverDashboard, DriverSchedule, AdminPanel.

Улучшения охватывают восемь проблемных областей: HomeHeader/фильтры, BusMap/карта, SchedulePanel, Reviews, Profile, DriverDashboard, навигация Layout и общесистемные качества (dark mode, skeleton loaders, error boundaries, стилизация).

---

## Glossary

- **App**: приложение Karta-AD целиком
- **HomeHeader**: компонент шапки главной страницы (`src/components/HomeHeader.jsx`)
- **BusMap**: компонент карты Leaflet с маркерами транспорта (`src/components/BusMap.jsx`)
- **MapControls**: компонент управления картой (слои, компас, геолокация), рендерится внутри BusMap
- **SchedulePanel**: компонент расписания остановок маршрута (`src/components/SchedulePanel.jsx`)
- **ReviewsPage**: страница отзывов о поездках (`src/pages/Reviews.jsx`)
- **ProfilePage**: страница профиля пользователя (`src/pages/Profile.jsx`)
- **DriverDashboard**: страница панели управления рейсом водителя (`src/pages/DriverDashboard.jsx`)
- **Layout**: корневой компонент макета с нижней навигацией (`src/components/Layout.jsx`)
- **FilterPill**: компонент-таблетка для фильтров в HomeHeader
- **TileLayer**: слой тайлов карты Leaflet
- **ErrorBoundary**: компонент React для перехвата ошибок рендеринга
- **Skeleton**: компонент-заглушка, отображаемый во время загрузки данных
- **ThemeProvider**: провайдер темы `next-themes` для переключения светлой/тёмной темы
- **GPS_Signal**: качество сигнала геолокации, определяемое по полю `accuracy` из `GeolocationCoordinates`
- **TripSession**: активная сессия отслеживания рейса водителя
- **RouteFilter**: совокупность выбранных фильтров (страна, город, тип, маршрут) в HomeHeader

---

## Requirements

---

### Requirement 1: Мобильный-friendly HomeHeader с улучшенными фильтрами

**User Story:** Как пассажир, я хочу удобно фильтровать транспорт на мобильном устройстве, чтобы быстро находить нужный маршрут без избыточных вложенных select-элементов.

#### Acceptance Criteria

1. THE HomeHeader SHALL заменить нативные `<select>` для страны, города и типа транспорта на компоненты Radix UI Select или Sheet/Drawer, открывающиеся в отдельном bottom-sheet на экранах шириной менее 640px.
2. WHEN пользователь выбирает значение в FilterPill, THE FilterPill SHALL отображать визуальный индикатор активного состояния: синий фон и белый текст вместо неактивного вида.
3. WHEN FilterPill находится в активном состоянии, THE HomeHeader SHALL отображать иконку сброса (×) внутри этого FilterPill, позволяющую сбросить фильтр одним нажатием.
4. THE HomeHeader SHALL сохранять текущее значение RouteFilter в `sessionStorage`, чтобы фильтры восстанавливались после перехода между страницами и возврата на Home.
5. WHILE App работает в offline-режиме, THE HomeHeader SHALL отображать баннер с сообщением об отсутствии соединения И показывать только кэшированные данные без визуального сбоя (graceful degradation), не блокируя взаимодействие с UI.
6. IF попытка загрузки городов или маршрутов завершилась ошибкой и кэш отсутствует, THEN THE HomeHeader SHALL отображать inline-сообщение об ошибке вместо пустого списка.

---

### Requirement 2: Корректная работа TileLayer и компаса в BusMap

**User Story:** Как пользователь карты, я хочу переключать слои карты и поворачивать её с помощью компаса, чтобы видеть удобное для меня представление.

#### Acceptance Criteria

1. THE BusMap SHALL хранить `tileIndex` в локальном состоянии (`useState`) и передавать его вместе с `setTileIndex` в компонент MapControls.
2. WHEN MapControls вызывает `setTileIndex`, THE BusMap SHALL перерендерить `TileLayer` с URL, соответствующим новому значению `tileIndex` из массива `TILE_LAYERS`.
3. THE BusMap SHALL убедиться, что `TileLayer` использует реактивный `url` из состояния, а не хардкоженную строку.
4. WHEN пользователь нажимает кнопку компаса, THE MapControls SHALL вызвать `map.setBearing(angle)` (или эквивалентный метод Leaflet) для фактического поворота карты, а не только иконки.
5. WHERE количество активных маркеров транспорта превышает 15, THE BusMap SHALL применять кластеризацию маркеров с помощью `react-leaflet-cluster` или аналогичной библиотеки, отображая число транспортных средств в кластере.
6. WHEN пользователь нажимает на кластер, THE BusMap SHALL разворачивать кластер и показывать отдельные маркеры.

---

### Requirement 3: Корректная логика иконок в SchedulePanel

**User Story:** Как пассажир, я хочу видеть интуитивно понятные иконки сворачивания/разворачивания расписания, чтобы понимать текущее состояние панели.

#### Acceptance Criteria

1. WHEN `expanded === false`, THE SchedulePanel SHALL отображать иконку `ChevronDown` (стрелка вниз), сигнализируя о возможности развернуть панель.
2. WHEN `expanded === true`, THE SchedulePanel SHALL отображать иконку `ChevronUp` (стрелка вверх), сигнализируя о возможности свернуть панель.
3. THE SchedulePanel SHALL обновить логику рендеринга иконки: условие `expanded ? ChevronDown : ChevronUp` заменить на `expanded ? ChevronUp : ChevronDown`.

---

### Requirement 4: Исправление страницы Reviews

**User Story:** Как пассажир, я хочу видеть корректное название раздела "Отзывы" в навигации и иметь возможность просматривать отзывы по конкретному маршруту, а также не терять введённые данные при переключении вкладок.

#### Acceptance Criteria

1. THE Layout SHALL отображать метку "Отзывы" (а не "Избранное") для навигационной ссылки на маршрут `/reviews`, используя иконку `MessageSquare` или `Star` вместо `Heart`.
2. THE ReviewsPage SHALL отображать фильтр по маршруту на вкладке "Все отзывы", позволяющий пользователю выбрать конкретный маршрут и видеть только отзывы для него.
3. WHEN пользователь переключается с вкладки "Написать отзыв" на "Все отзывы" и обратно, THE ReviewsPage SHALL сохранять все введённые значения формы (`route_id`, `cleanliness`, `politeness`, `punctuality`, `comment`) без их сброса.
4. WHEN пользователь успешно отправляет отзыв, THE ReviewsPage SHALL очистить форму И переключить вкладку на "Все отзывы".
5. THE ReviewsPage SHALL отображать среднюю оценку (avg) по каждому маршруту в фильтре или в заголовке списка отзывов.

---

### Requirement 5: Безопасность и улучшения ProfilePage

**User Story:** Как администратор системы, я хочу, чтобы роль "admin" нельзя было выбрать из UI без соответствующих прав, а пользователи не могли вводить невалидный номер телефона или терять выбранную вкладку профиля.

#### Acceptance Criteria

1. THE ProfilePage SHALL скрывать кнопку выбора роли `admin` в UI, если текущий пользователь не имеет роли `admin` (то есть `user.role !== 'admin'`), отображая только роли `passenger` и `driver`.
2. IF текущий пользователь уже имеет роль `admin`, THEN THE ProfilePage SHALL отображать все три варианта роли, но кнопка `admin` SHALL быть заблокирована (disabled) и недоступна для изменения.
3. WHEN пользователь вводит телефон в поле `phone`, THE ProfilePage SHALL валидировать формат по регулярному выражению `^\+992\s?\d{2}\s?\d{3}\s?\d{4}$` и отображать inline-сообщение об ошибке при несоответствии.
4. IF форма сохраняется с невалидным телефоном, THEN THE ProfilePage SHALL заблокировать отправку и показать сообщение об ошибке.
5. THE ProfilePage SHALL сохранять активную вкладку (`settings`, `favorites`, `history`) в `sessionStorage` по ключу `profile_active_tab`, чтобы она восстанавливалась при возврате на страницу.

---

### Requirement 6: Улучшения DriverDashboard

**User Story:** Как водитель, я хочу видеть качество GPS-сигнала, иметь возможность ставить рейс на паузу и получать чёткую визуальную обратную связь о состоянии кнопки старта.

#### Acceptance Criteria

1. WHILE TripSession активна, THE DriverDashboard SHALL отображать индикатор качества GPS-сигнала, основанный на значении `accuracy` из `GeolocationCoordinates`: зелёный при `accuracy ≤ 20м`, жёлтый при `accuracy ≤ 50м`, красный при `accuracy > 50м`.
2. WHILE TripSession активна, THE DriverDashboard SHALL отображать кнопку "Пауза", позволяющую водителю приостановить обновление координат без завершения рейса (поле `is_active` остаётся `true`, но `watchPosition` приостанавливается).
3. WHEN водитель нажимает "Пауза", THE DriverDashboard SHALL обновить Vehicle с `speed: 0` и отображать статус "На паузе" в баннере.
4. WHEN водитель нажимает "Продолжить" после паузы, THE DriverDashboard SHALL возобновить `watchPosition` и снять статус паузы.
5. WHILE маршрут не выбран (`selectedRoute === ''`), THE DriverDashboard SHALL отображать кнопку "Начать рейс" с явно заметным отключённым состоянием: пониженная непрозрачность (opacity 40%), серый фон и tooltip "Выберите маршрут для начала рейса".
6. IF геолокация недоступна или отклонена пользователем, THEN THE DriverDashboard SHALL отобразить ошибку с объяснением и ссылкой на настройки браузера.

---

### Requirement 7: Улучшения навигации Layout

**User Story:** Как пользователь, я хочу видеть счётчик непрочитанных уведомлений на иконке навигации и анимированный индикатор активного маршрута, чтобы удобнее ориентироваться в приложении.

#### Acceptance Criteria

1. THE Layout SHALL отображать badge с числом непрочитанных уведомлений на иконке навигационного пункта "Карта" (`/`), получая их количество через контекст или пропс.
2. WHEN количество уведомлений равно нулю, THE Layout SHALL скрывать badge.
3. WHEN количество уведомлений больше 99, THE Layout SHALL отображать в badge значение "99+".
4. WHEN навигационный пункт становится активным, THE Layout SHALL применять анимацию подчёркивания или масштабирования иконки (`scale-110` + `transition-transform`) дополнительно к смене цвета.
5. THE Layout SHALL применять `aria-current="page"` к активному навигационному пункту для поддержки скрин-ридеров.

---

### Requirement 8: Dark Mode

**User Story:** Как пользователь, я хочу переключать тёмную и светлую тему приложения, чтобы комфортно пользоваться им в ночное время.

#### Acceptance Criteria

1. THE App SHALL подключить `ThemeProvider` из `next-themes` с атрибутом `class` и `defaultTheme="system"` в корне приложения (`App.jsx`).
2. THE ProfilePage SHALL содержать переключатель темы (toggle), меняющий тему между `light`, `dark` и `system`.
3. WHEN тема переключается на `dark`, THE App SHALL применять CSS-переменные Tailwind dark-mode (`dark:` префиксы) ко всем основным компонентам: Layout, HomeHeader, BusMap, SchedulePanel, ReviewsPage, ProfilePage, DriverDashboard.
4. THE App SHALL сохранять выбранную тему в `localStorage` через механизм `next-themes`, чтобы она восстанавливалась при следующем открытии приложения.
5. WHERE `prefers-color-scheme: dark` активен в системе пользователя и тема установлена в `system`, THE App SHALL автоматически применять тёмную тему без действий пользователя.

---

### Requirement 9: Skeleton Loaders при загрузке данных

**User Story:** Как пользователь, я хочу видеть анимированные заглушки во время загрузки данных вместо пустых областей, чтобы понимать, что приложение работает.

#### Acceptance Criteria

1. WHILE данные городов загружаются в HomeHeader, THE HomeHeader SHALL отображать Skeleton-заглушки для FilterPill вместо пустых pill-элементов.
2. WHILE данные маршрутов загружаются в ReviewsPage, THE ReviewsPage SHALL отображать Skeleton-карточки отзывов (минимум 3 штуки) вместо пустого списка.
3. WHILE данные профиля загружаются в ProfilePage, THE ProfilePage SHALL отображать Skeleton-блоки для аватара, имени и полей формы.
4. WHILE данные рейсов загружаются в DriverDashboard, THE DriverDashboard SHALL отображать Skeleton-блоки для select-полей города и маршрута.
5. THE App SHALL использовать компонент `Skeleton` из `src/components/ui/skeleton.jsx` для всех вышеуказанных состояний загрузки.

---

### Requirement 10: Error Boundaries

**User Story:** Как пользователь, я хочу, чтобы ошибка в одном разделе приложения не ломала весь экран, а показывала понятное сообщение с возможностью продолжить работу.

#### Acceptance Criteria

1. THE App SHALL обернуть каждый маршрут (`Home`, `ReviewsPage`, `ProfilePage`, `DriverDashboard`, `AdminPanel`, `DriverSchedule`) в отдельный компонент ErrorBoundary.
2. WHEN компонент внутри ErrorBoundary выбрасывает необработанную ошибку, THE ErrorBoundary SHALL отображать fallback-UI с сообщением об ошибке и кнопкой "Перезагрузить страницу".
3. THE ErrorBoundary SHALL логировать детали ошибки (`error.message`, `componentStack`) в консоль в режиме разработки.
4. IF ошибка произошла в BusMap (Leaflet), THEN THE ErrorBoundary SHALL отображать статичную карту-заглушку (изображение или простой блок с координатами) вместо пустого экрана.
5. THE App SHALL содержать глобальный ErrorBoundary, оборачивающий `AuthenticatedApp`, для перехвата ошибок вне маршрутов.

---

### Requirement 11: Устранение inline-стилей и унификация стилизации

**User Story:** Как разработчик, я хочу, чтобы стилизация компонентов использовала Tailwind CSS классы вместо inline-стилей, чтобы упростить поддержку, тестирование и тёмную тему.

#### Acceptance Criteria

1. THE HomeHeader SHALL заменить все `style={{ ... }}` объекты на эквивалентные Tailwind CSS классы там, где это возможно без потери функциональности (исключение: динамические значения, вычисляемые в runtime, например `route.color`).
2. THE SchedulePanel SHALL заменить все `style={{ ... }}` объекты на Tailwind CSS классы.
3. THE Layout SHALL заменить `style={{ boxShadow: '...' }}` и аналогичные на Tailwind-утилиты (`shadow-md`, `shadow-lg` и т.д.).
4. THE App SHALL обеспечить, что все компоненты из `src/components/ui/` используют только Tailwind CSS классы и CSS-переменные (без inline-стилей).
5. WHEN разработчик добавляет новый компонент, THE App SHALL — согласно соглашению в документации — требовать использования Tailwind CSS классов вместо inline-стилей (данное требование фиксируется в README).
