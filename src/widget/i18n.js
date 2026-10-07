/**
 * i18n виджета. Сейчас ru (основной язык площадки),
 * язык берётся из data-lang script-тега — seam для tg/en.
 */

const RU = {
  open: '🛒 Заказать',
  close: '✕',
  catalog: 'Каталог',
  cart: 'Корзина',
  empty: 'Товары скоро появятся',
  emptyCart: 'Корзина пуста',
  addToCart: 'В корзину',
  checkout: 'Оформить заказ',
  name: 'Ваше имя',
  phone: 'Телефон',
  delivery: 'Доставка',
  pickup: 'Самовывоз',
  address: 'Адрес доставки',
  pin: '📍 Указать на карте',
  mapFallback: 'Карта недоступна — введите адрес текстом',
  payment: 'Оплата',
  cash: 'При получении (наличные)',
  card: 'Картой',
  cardSoon: 'Оплата картой подключается',
  notes: 'Комментарий',
  total: 'Итого',
  submit: 'Заказать',
  sending: 'Отправляем…',
  success: 'Заказ принят!',
  successId: 'Номер заказа',
  loadError: 'Не удалось загрузить каталог',
  retry: 'Повторить',
  qty: 'шт.',
  by: 'на Karta-AD',
};

const STR = { ru: RU };

export function t(lang = 'ru') {
  return STR[lang] || STR.ru;
}
