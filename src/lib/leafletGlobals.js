import L from 'leaflet';

// Плагин leaflet-rotate (и часть старых плагинов Leaflet) обращаются к глобальному L,
// а ESM-сборка leaflet глобальным не является. Пробрасываем сами — до загрузки плагина.
if (typeof window !== 'undefined' && !window.L) window.L = L;

export { L };
