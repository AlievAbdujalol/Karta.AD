/**
 * supportConfig.js — клиентские константы раздела «Отзывы и поддержка».
 *
 * Перечни ниже обязаны ТОЧНО совпадать с CHECK-ограничениями миграции
 * supabase/migrations/20261015120000_community_support.sql — это проверяет
 * src/test/supportParity.test.js, который читает файл миграции напрямую.
 * Меняете список здесь — поправьте и миграцию (и наоборот), тест не даст
 * разойтись.
 */

export const TICKET_CATEGORIES = [
  'app_error',
  'map_broken',
  'wrong_route',
  'taxi_issue',
  'account_issue',
  'idea',
  'other',
];

export const POST_CATEGORIES = [
  'routes',
  'transit',
  'taxi',
  'map_issues',
  'ideas',
  'questions',
  'other',
];

export const TICKET_STATUSES = [
  'new',
  'in_progress',
  'awaiting_user',
  'resolved',
  'closed',
];

export const POST_STATUSES = ['published', 'hidden'];

export const REPORT_REASONS = ['spam', 'abuse', 'other'];

export const PHOTO_LIMITS = {
  maxCount: 4,
  maxSizeBytes: 5242880, // 5MB
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['jpg', 'jpeg', 'png', 'webp'],
  buckets: {
    community: 'community-photos',
    support: 'support-photos',
  },
};

export const TICKET_LIMITS = {
  subjectMin: 3,
  subjectMax: 150,
  bodyMin: 10,
  bodyMax: 4000,
  replyMin: 1,
  replyMax: 4000,
};

export const POST_LIMITS = {
  titleMin: 3,
  titleMax: 150,
  bodyMin: 3,
  bodyMax: 5000,
  commentMin: 1,
  commentMax: 2000,
};

/** Порядок статусов для фильтров панели разработчика («Все» + каждый статус). */
export const STATUS_FILTERS = ['all', ...TICKET_STATUSES];

/** Подписанные ссылки на фото обращений живут час. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/** Ярлык статуса по его значению (ключ i18n: support.status.<value>). */
export function statusI18nKey(status) {
  return TICKET_STATUSES.includes(status) ? `support.status.${status}` : status;
}

/** Ключ i18n для категории обращения. */
export function ticketCategoryI18nKey(category) {
  return TICKET_CATEGORIES.includes(category)
    ? `support.category.${category}`
    : category;
}

/** Ключ i18n для категории публикации. */
export function postCategoryI18nKey(category) {
  return POST_CATEGORIES.includes(category) ? `support.postCat.${category}` : category;
}

/** Ключ i18n для причины жалобы. */
export function reportReasonI18nKey(reason) {
  return REPORT_REASONS.includes(reason) ? `support.reason.${reason}` : reason;
}

/** Цветовая метка статуса (Tailwind-классы) для чипов. */
export function statusChipClass(status) {
  switch (status) {
    case 'new':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20';
    case 'in_progress':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
    case 'awaiting_user':
      return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20';
    case 'resolved':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
    case 'closed':
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}
