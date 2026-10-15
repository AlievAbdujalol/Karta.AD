import { Marker, Popup } from 'react-leaflet';

// Маркеры свободных водителей на карте пассажира + отправка заказа конкретному
// водителю из попапа (см. src/lib/taxiOffer.js).
// Иконка приходит снаружи (создаётся через Leaflet в вызывающем компоненте),
// чтобы файл оставался тестируемым без Leaflet-контекста.
export default function NearbyDriversPopup({ drivers, icon, canOffer = false, offeredDriverId = null, onOffer }) {
  return drivers.map((d, i) => {
    const directed = offeredDriverId != null && offeredDriverId === d.driver_id;
    return (
      <Marker key={d.driver_id || i} position={[d.lat, d.lng]} icon={icon}>
        <Popup>
          <div className="min-w-[160px] space-y-2">
            <p className="text-xs font-bold text-slate-800">Свободный водитель</p>
            {canOffer && (
              directed ? (
                <div className="rounded-xl bg-emerald-500 px-3 py-1.5 text-center text-[11px] font-bold text-white">
                  ✓ Предложение отправлено
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOffer?.(d.driver_id)}
                  className="w-full rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
                >
                  Отправить заказ
                </button>
              )
            )}
          </div>
        </Popup>
      </Marker>
    );
  });
}
