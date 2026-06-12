import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Star, Send, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

function StarRating({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`transition-colors ${n <= value ? 'text-amber-400' : 'text-gray-300'}`}
          >
            <Star size={22} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  const avg = ((review.cleanliness || 0) + (review.politeness || 0) + (review.punctuality || 0)) / 3;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-blue-700 dark:text-blue-400">#{review.route_number || '—'}</span>
        <div className="flex items-center gap-1 text-amber-400">
          <Star size={14} fill="currentColor" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{avg.toFixed(1)}</span>
        </div>
      </div>
      {review.driver_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Водитель: {review.driver_name}</p>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
        <div>
          <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">{review.cleanliness || '—'}</div>
          <div>Чистота</div>
        </div>
        <div>
          <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">{review.politeness || '—'}</div>
          <div>Вежливость</div>
        </div>
        <div>
          <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">{review.punctuality || '—'}</div>
          <div>Пунктуальность</div>
        </div>
      </div>
      {review.comment && (
        <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">"{review.comment}"</p>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(review.created_date).toLocaleDateString('ru')}</p>
    </div>
  );
}

export default function Reviews() {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState({
    route_id: '', vehicle_number: '', cleanliness: 0, politeness: 0, punctuality: 0, comment: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('write');

  useEffect(() => {
    Promise.all([
      base44.entities.Route.list(),
      base44.entities.Vehicle.filter({ is_active: false }),
      base44.entities.Review.list('-created_date', 50),
    ]).then(([r, v, rv]) => {
      setRoutes(r);
      setVehicles(v);
      setReviews(rv);
    });
    base44.entities.Review.list('-created_date', 50).then(setReviews);
  }, []);

  const selectedRoute = routes.find(r => r.id === form.route_id);

  const handleSubmit = async () => {
    if (!form.route_id) return toast.error('Выберите маршрут');
    if (!form.cleanliness && !form.politeness && !form.punctuality)
      return toast.error('Поставьте хотя бы одну оценку');
    setSubmitting(true);
    const vehicle = vehicles.find(v => v.route_id === form.route_id);
    await base44.entities.Review.create({
      route_id: form.route_id,
      route_number: selectedRoute?.number || '',
      driver_name: vehicle?.driver_name || '',
      vehicle_number: form.vehicle_number || vehicle?.vehicle_number || '',
      cleanliness: form.cleanliness || null,
      politeness: form.politeness || null,
      punctuality: form.punctuality || null,
      comment: form.comment,
    });
    toast.success('Отзыв отправлен! Спасибо 🙏');
    setForm({ route_id: '', vehicle_number: '', cleanliness: 0, politeness: 0, punctuality: 0, comment: '' });
    const updated = await base44.entities.Review.list('-created_date', 50);
    setReviews(updated);
    setTab('list');
    setSubmitting(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white">
          <h1 className="text-xl font-bold">Отзывы о поездках</h1>
          <p className="text-amber-100 text-sm mt-1">Оцените чистоту, вежливость и пунктуальность</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-100 dark:border-gray-700">
          {[{ id: 'write', label: 'Написать отзыв' }, { id: 'list', label: `Все отзывы (${reviews.length})` }].map(tab_ => (
            <button
              key={tab_.id}
              onClick={() => setTab(tab_.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === tab_.id ? 'bg-amber-500 text-white shadow' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab_.label}
            </button>
          ))}
        </div>

        {tab === 'write' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm space-y-5">
            {/* Route select */}
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">Маршрут *</label>
              <div className="relative">
                <select
                  value={form.route_id}
                  onChange={e => setForm({ ...form, route_id: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 appearance-none pr-10"
                >
                  <option value="">— выберите маршрут —</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>#{r.number} {r.name || ''}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Ratings */}
            <div className="space-y-3">
              <StarRating label="🧹 Чистота салона" value={form.cleanliness} onChange={v => setForm({ ...form, cleanliness: v })} />
              <StarRating label="😊 Вежливость водителя" value={form.politeness} onChange={v => setForm({ ...form, politeness: v })} />
              <StarRating label="⏰ Пунктуальность" value={form.punctuality} onChange={v => setForm({ ...form, punctuality: v })} />
            </div>

            {/* Comment */}
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block">Комментарий</label>
              <textarea
                value={form.comment}
                onChange={e => setForm({ ...form, comment: e.target.value })}
                rows={3}
                placeholder="Расскажите подробнее о поездке..."
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm resize-none bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              <Send size={17} />
              {submitting ? 'Отправляем...' : 'Отправить отзыв'}
            </button>
          </div>
        )}

        {tab === 'list' && (
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <Star size={36} className="mx-auto mb-3 opacity-30" />
                <p>Отзывов пока нет</p>
              </div>
            ) : (
              reviews.map(r => <ReviewCard key={r.id} review={r} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}