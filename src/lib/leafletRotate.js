import { L } from './leafletGlobals';
import 'leaflet-rotate/dist/leaflet-rotate.js';

// Поворот карты за курсом пользователя (как в навигаторах).
// Импорт этого модуля должен идти раньше создания первого L.map().

// Свои настройки плагина — глобально для всех карт приложения:
//  - компас-контрол плагина не нужен (управление в MapControls);
//  - shift+колёсико не должно крутить карту;
//  - ручной поворот двумя пальцами выключен (картой крутит навигация).
L.Map.mergeOptions({
  rotateControl: false,
  shiftKeyRotate: false,
  touchRotate: false,
});

// Ядро Leaflet и плагин оба регистрируют addInitHook('addHandler', 'touchZoom', …) —
// без защиты у карты появлялось бы два обработчика pinch-zoom, и зум прыгал бы.
// Оставляем ядро (оно срабатывает первым), плагинский пропускаем.
const origAddHandler = L.Map.prototype.addHandler;
L.Map.prototype.addHandler = function (name, HandlerClass) {
  if (name === 'touchZoom' && this.touchZoom) return this;
  return origAddHandler.call(this, name, HandlerClass);
};

export { L };
