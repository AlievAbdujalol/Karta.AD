import { useState, useEffect } from 'react';
import { Route, Vehicle, Review } from '@/api/entities';
import { Star, Send, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';

function StarRating({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`transition-colors ${n <= value ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
          >
            <Star size={20} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  const avg = ((review.cleanliness || 0) + (review.politeness || 0) + (review.punctuality || 0)) / 3;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-[20px] p-5 shadow-sm border border-slate-100 dark:border-slate-700/60 space-y-3.5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="font-extrabold text-xs text-blue-650 bg-blue-50 dark:bg-slate-900 dark:text-blue-400 px-2.5 py-1 rounded-xl">
          #{review.route_number || '—'}
        </span>
        <div className="flex items-center gap-1 text-amber-500 bg-amber-500/5 px-2.5 py-0.5 rounded-full border border-amber-500/10">
          <Star size={12} fill="currentColor" />
          <span className="text-[11px] font-bold text-amber-600">{avg.toFixed(1)}</span>
        </div>
      </div>
      {review.driver_name && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <span>👤</span> {`${t('reviews.driverLabel')} ${review.driver_name}`}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/40 p-3 rounded-xl">
        <div>
          <div className="font-black text-slate-800 dark:text-slate-100 text-sm">{review.cleanliness || '—'}</div>
          <div className="font-medium mt-0.5 text-slate-400">{t('reviews.cleanliness')}</div>
        </div>
        <div>
          <div className="font-black text-slate-800 dark:text-slate-100 text-sm">{review.politeness || '—'}</div>
          <div className="font-medium mt-0.5 text-slate-400">{t('reviews.politeness')}</div>
        </div>
        <div>
          <div className="font-black text-slate-800 dark:text-slate-100 text-sm">{review.punctuality || '—'}</div>
          <div className="font-medium mt-0.5 text-slate-400">{t('reviews.punctuality')}</div>
        </div>
      </div>
      {review.comment && (
        <p className="text-xs text-slate-700 dark:text-slate-350 bg-slate-50 dark:bg-slate-700/60 rounded-xl px-4 py-3 border border-slate-100/50 dark:border-slate-700/30 italic">
          "{review.comment}"
        </p>
      )}
      <p className="text-[9px] text-slate-400 dark:text-slate-500 text-right">
        {new Date(review.created_at).toLocaleDateString('ru')}
      </p>
    </div>
  );
}

export default function Reviews() {
  const { t } = useLanguage();
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
      Route.list(),
      Vehicle.filter({ is_active: false }),
      Review.list('-created_at', 50),
    ]).then(([r, v, rv]) => {
      setRoutes(r);
      setVehicles(v);
      setReviews(rv);
    });
  }, []);

  const selectedRoute = routes.find(r => r.id === form.route_id);

  const handleSubmit = async () => {
    if (!form.route_id) return toast.error(t('reviews.selectRouteError'));
    if (!form.cleanliness && !form.politeness && !form.punctuality)
      return toast.error(t('reviews.ratingRequiredError'));
    setSubmitting(true);
    const vehicle = vehicles.find(v => v.route_id === form.route_id);
    await Review.create({
      route_id: form.route_id,
      route_number: selectedRoute?.number || '',
      driver_name: vehicle?.driver_name || '',
      vehicle_number: form.vehicle_number || vehicle?.vehicle_number || '',
      cleanliness: form.cleanliness || null,
      politeness: form.politeness || null,
      punctuality: form.punctuality || null,
      comment: form.comment,
    });
    toast.success(t('reviews.submitSuccess'));
    setForm({ route_id: '', vehicle_number: '', cleanliness: 0, politeness: 0, punctuality: 0, comment: '' });
    const updated = await Review.list('-created_at', 50);
    setReviews(updated);
    setTab('list');
    setSubmitting(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md mx-auto space-y-4 pb-8">
        <div className="bg-gradient-to-br from-blue-600 to-sky-500 rounded-[20px] p-6 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <Star size={160} fill="white" />
          </div>
          <h1 className="text-xl font-black tracking-tight">{t('reviews.pageTitle')}</h1>
          <p className="text-blue-100 text-xs mt-1 font-medium">{t('reviews.pageSubtitle')}</p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 shadow-sm border border-slate-200/50 dark:border-slate-800/60">
          {[{ id: 'write', label: t('reviews.writeTab') }, { id: 'list', label: `${t('reviews.allReviewsTab')} (${reviews.length})` }].map(tab_ => (
            <button
              key={tab_.id}
              onClick={() => setTab(tab_.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === tab_.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab_.label}
            </button>
          ))}
        </div>

        {tab === 'write' && (
          <div className="bg-white dark:bg-slate-900 rounded-[20px] p-5 shadow-sm space-y-5 border border-slate-100 dark:border-slate-800/50">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">{t('reviews.routeLabel')}</label>
              <div className="relative">
                <select
                  value={form.route_id}
                  onChange={e => setForm({ ...form, route_id: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs bg-slate-50 dark:bg-slate-850 dark:text-slate-100 appearance-none pr-10 outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">{t('reviews.routePlaceholder')}</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>#{r.number} {r.name || ''}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-950/40 p-4 rounded-[20px] border border-slate-100/50 dark:border-slate-900">
              <StarRating label={t('reviews.cleanlinessLabel')} value={form.cleanliness} onChange={v => setForm({ ...form, cleanliness: v })} />
              <StarRating label={t('reviews.politenessLabel')} value={form.politeness} onChange={v => setForm({ ...form, politeness: v })} />
              <StarRating label={t('reviews.punctualityLabel')} value={form.punctuality} onChange={v => setForm({ ...form, punctuality: v })} />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">{t('reviews.commentLabel')}</label>
              <textarea
                value={form.comment}
                onChange={e => setForm({ ...form, comment: e.target.value })}
                rows={3}
                placeholder={t('reviews.commentPlaceholder')}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs resize-none bg-slate-50 dark:bg-slate-850 dark:text-slate-100 dark:placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-sm active:scale-98 shadow-blue-500/10"
            >
              <Send size={15} />
              {submitting ? t('submitting') : t('reviews.submitButton')}
            </button>
          </div>
        )}

        {tab === 'list' && (
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Star size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-xs">{t('reviews.noReviews')}</p>
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
