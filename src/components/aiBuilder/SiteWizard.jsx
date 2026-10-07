import { useState, useMemo } from 'react';
import { X, ArrowLeft, ArrowRight, Sparkles, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  WIZARD_STEPS, SITE_TYPES, DELIVERY_MODES, PAYMENT_PROVIDERS,
  wizardDefaults, validateWizardStep,
} from '@/lib/wizardConfig';
import { SITE_THEMES, getTheme } from '@/lib/siteThemes';

/** Этапы прогресса генерации (спецификация §16) — привязаны к реальным стадиям. */
const PROGRESS_STAGES = [
  'Сохраняю настройки сайта…',
  'Получение данных бизнеса…',
  'Создание структуры сайта…',
  'Генерация дизайна и вёрстки…',
  'Сборка preview…',
  'Готово!',
];

/** Текущий индекс этапа по строке стадии генерации. */
function progressIndex(stage, resolved) {
  if (resolved) return PROGRESS_STAGES.length - 1;
  if (!stage) return 0;
  if (stage.includes('Сохраняю настройки')) return 0;
  if (stage.startsWith('Analyzing')) return 1;
  if (stage.startsWith('Creating')) return 2;
  if (stage.startsWith('Building')) return 3;
  if (stage.includes('Сохраняю версию')) return 4;
  return 0;
}

const ONLINE_IDS = ['alif', 'eskhata', 'dushanbe_city'];
const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500';
const labelCls = 'block text-[12px] font-bold text-slate-400 mb-1';

/**
 * Визард «Создать сайт с помощью AI»: 7 шагов (спецификация §5),
 * финал — вызов onSubmit(state) → сохранение настроек + генерация,
 * с поэтапным прогрессом (§16). Чистая логика шагов — в wizardConfig.
 */
export default function SiteWizard({ open, onClose, business, products = [], busy, stage, onSubmit }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('form'); // form | progress
  const [resolved, setResolved] = useState(false);
  const [errors, setErrors] = useState([]);
  const [form, setForm] = useState(() => wizardDefaults({}));

  const productList = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const current = WIZARD_STEPS[step];
  const theme = getTheme(form.style);

  if (!open) return null;

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const goto = (next) => {
    const list = validateWizardStep(WIZARD_STEPS[step].id, form);
    if (list.length && next > step) {
      setErrors(list);
      return;
    }
    setErrors([]);
    setStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, next)));
  };

  const toggleProduct = (id) => {
    const has = form.productIds.includes(id);
    patch({ productIds: has ? form.productIds.filter((x) => x !== id) : [...form.productIds, id] });
  };

  const toggleProvider = (id) => {
    const providers = form.payment.providers.includes(id)
      ? form.payment.providers.filter((x) => x !== id)
      : [...form.payment.providers, id];
    patch({
      payment: {
        ...form.payment,
        providers,
        cod: providers.some((x) => x === 'cash' || x === 'card'),
        online: providers.some((x) => ONLINE_IDS.includes(x)),
      },
    });
  };

  const submit = async () => {
    const all = WIZARD_STEPS.map((s) => ({ id: s.id, list: validateWizardStep(s.id, form) }))
      .filter((s) => s.list.length);
    if (all.length) {
      setStep(WIZARD_STEPS.findIndex((s) => s.id === all[0].id));
      setErrors(all[0].list);
      return;
    }
    if (!business) {
      toast.error('Сначала создай бизнес — сайт привязывается к нему');
      return;
    }
    setPhase('progress');
    setResolved(false);
    try {
      const ok = await onSubmit(form);
      if (ok) {
        setResolved(true);
      } else {
        setPhase('form');
      }
    } catch (e) {
      setPhase('form');
      toast.error(e?.message || 'Не удалось создать сайт');
    }
  };

  // ─── поэтапный прогресс (§16) ──────────────────────────────
  if (phase === 'progress') {
    const idx = progressIndex(stage, resolved);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={busy ? undefined : onClose} />
        <div className="relative w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-400" />
            <h2 className="font-black text-white">Создание сайта…</h2>
          </div>
          <ul className="space-y-2.5">
            {PROGRESS_STAGES.map((label, i) => {
              const done = i < idx;
              const active = i === idx;
              return (
                <li key={label} className="flex items-center gap-2.5 text-sm">
                  {done ? (
                    <Check size={16} className="text-emerald-400 shrink-0" />
                  ) : active ? (
                    <Loader2 size={16} className="text-violet-400 animate-spin shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span className={done ? 'text-slate-500' : active ? 'text-white font-bold' : 'text-slate-600'}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          {!busy && !resolved && (
            <p className="text-xs text-amber-400 font-bold">Генерация скоро начнётся…</p>
          )}
        </div>
      </div>
    );
  }

  // ─── шаги формы ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-700 bg-slate-900 overflow-hidden">
        {/* Шапка: прогресс шагов */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-400" />
            <h2 className="flex-1 font-black text-white">Создать сайт с помощью AI</h2>
            <button onClick={onClose} title="Закрыть" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800">
              <X size={17} />
            </button>
          </div>
          <div className="flex gap-1.5 mt-3">
            {WIZARD_STEPS.map((s, i) => (
              <div
                key={s.id}
                title={s.title}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-violet-500' : 'bg-slate-800'}`}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] font-bold text-slate-400">
            Шаг {step + 1} из {WIZARD_STEPS.length} · {current.title}
            <span className="text-slate-600"> — {current.hint}</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-ui p-5 space-y-4">
          {!business && (
            <p className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              Бизнес не выбран — сначала создай его в разделе «Бизнес»
            </p>
          )}

          {step === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SITE_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => patch({ siteType: t.id })}
                  className={`px-3 py-3 rounded-xl text-xs font-bold border transition-colors ${
                    form.siteType === t.id
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SITE_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => patch({ style: t.id })}
                  className={`rounded-xl border overflow-hidden text-left ${
                    form.style === t.id ? 'border-violet-500 ring-2 ring-violet-500/40' : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="h-16 flex items-center justify-center text-[10px] font-black" style={{ background: t.gradient, color: t.text }}>
                    Aa
                  </div>
                  <div className="px-2 py-1.5 bg-slate-800">
                    <p className="text-[11px] font-bold text-white truncate">{t.label}</p>
                    <p className="text-[9px] text-slate-500 truncate">{t.dark ? 'тёмная' : 'светлая'}</p>
                  </div>
                </button>
              ))}
              <p className="col-span-full text-xs text-slate-500">{theme.description}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Название сайта</label>
                <input
                  className={inputCls}
                  value={form.heroTitle}
                  maxLength={80}
                  placeholder={business?.name || 'Например: Магазин-AD'}
                  onChange={(e) => patch({ heroTitle: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Чем занимаетесь (1–2 предложения)</label>
                <textarea
                  className={`${inputCls} min-h-[80px] resize-y`}
                  value={form.heroDescription}
                  maxLength={300}
                  placeholder="Продажа спортивной обуви и одежды в Душанбе"
                  onChange={(e) => patch({ heroDescription: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => patch({ productIds: [] })}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                    form.productIds.length === 0 ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Все товары ({productList.length})
                </button>
                {productList.length > 0 && (
                  <button
                    onClick={() => patch({ productIds: productList.map((p) => p.id) })}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300"
                  >
                    Выбрать все
                  </button>
                )}
              </div>
              {productList.length === 0 && (
                <p className="text-xs text-slate-500">Товаров пока нет — каталог подключится, когда они появятся</p>
              )}
              <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-ui">
                {productList.map((p) => {
                  const checked = form.productIds.includes(p.id) || form.productIds.length === 0;
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => form.productIds.length === 0
                          ? patch({ productIds: productList.filter((x) => x.id !== p.id).map((x) => x.id) })
                          : toggleProduct(p.id)}
                        className="accent-violet-500"
                      />
                      <span className="flex-1 text-xs text-slate-200 truncate">{p.name}</span>
                      <span className="text-[11px] font-bold text-slate-400">{p.price} TJS</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                {form.productIds.length === 0
                  ? 'В каталоге будут все активные товары'
                  : `Выбрано: ${form.productIds.length} из ${productList.length}`}
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.delivery.enabled}
                  onChange={(e) => patch({ delivery: { ...form.delivery, enabled: e.target.checked } })}
                  className="accent-violet-500"
                />
                <span className="text-sm font-bold text-white">Доставка включена</span>
              </label>
              {form.delivery.enabled && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {DELIVERY_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => patch({ delivery: { ...form.delivery, mode: m.id } })}
                        className={`px-2 py-2.5 rounded-xl text-[11px] font-bold border ${
                          form.delivery.mode === m.id
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {form.delivery.mode === 'fixed' && (
                      <div>
                        <label className={labelCls}>Цена, TJS</label>
                        <input
                          type="number" min="0" className={inputCls}
                          value={form.delivery.price}
                          onChange={(e) => patch({ delivery: { ...form.delivery, price: e.target.value } })}
                        />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Мин. заказ, TJS</label>
                      <input
                        type="number" min="0" className={inputCls}
                        value={form.delivery.minOrder}
                        onChange={(e) => patch({ delivery: { ...form.delivery, minOrder: e.target.value } })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Радиус, км</label>
                      <input
                        type="number" min="1" max="100" className={inputCls}
                        value={form.delivery.radiusKm}
                        onChange={(e) => patch({ delivery: { ...form.delivery, radiusKm: e.target.value } })}
                      />
                    </div>
                  </div>
                  {form.delivery.mode === 'distance' && (
                    <p className="text-[11px] text-slate-500">Стоимость по расстоянию считает сервер по координатам</p>
                  )}
                </>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2">
              {PAYMENT_PROVIDERS.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.payment.providers.includes(p.id)}
                    onChange={() => toggleProvider(p.id)}
                    className="accent-violet-500"
                  />
                  <span className="flex-1 text-sm text-slate-200">{p.label}</span>
                  {ONLINE_IDS.includes(p.id) && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">подключается</span>
                  )}
                </label>
              ))}
              <p className="text-[11px] text-slate-500">
                Онлайн-провайдеры подключаются отдельно — до этого заказы принимаются с оплатой при получении.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Пожелания к сайту (необязательно)</label>
                <textarea
                  className={`${inputCls} min-h-[90px] resize-y`}
                  value={form.prompt}
                  maxLength={1000}
                  placeholder="Например: яркий баннер с акцией, отзывы покупателей выше каталога"
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
                <p className="text-[10px] text-slate-600 mt-1">{form.prompt.length}/1000</p>
              </div>
              <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 space-y-1 text-[11px] text-slate-400">
                <p><b className="text-slate-300">Тип:</b> {SITE_TYPES.find((t) => t.id === form.siteType)?.label}</p>
                <p><b className="text-slate-300">Стиль:</b> {theme.label}</p>
                <p><b className="text-slate-300">Товары:</b> {form.productIds.length ? `выбрано ${form.productIds.length}` : 'все'}</p>
                <p><b className="text-slate-300">Доставка:</b> {form.delivery.enabled ? DELIVERY_MODES.find((m) => m.id === form.delivery.mode)?.label : 'выключена'}</p>
                <p><b className="text-slate-300">Оплата:</b> {form.payment.providers.map((id) => PAYMENT_PROVIDERS.find((p) => p.id === id)?.label).join(', ') || '—'}</p>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="space-y-1">
              {errors.map((e) => (
                <li key={e} className="text-xs font-bold text-red-400">• {e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Навигация */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={() => goto(step - 1)}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-700"
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <span className="flex-1" />
          {step < WIZARD_STEPS.length - 1 ? (
            <button
              onClick={() => goto(step + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500"
            >
              Далее <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-black disabled:opacity-50"
            >
              <Sparkles size={14} /> Создать сайт
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
