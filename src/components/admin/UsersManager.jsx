import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Wallet, Search, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';
import { validateNewUser, validateTopup, formatTJS, ASSIGNABLE_ROLES } from '@/lib/adminUsers';

const ROLE_LABELS = {
  user: 'Пассажир',
  driver: 'Водитель',
  taxi_driver: 'Такси водитель',
  business: 'Бизнес',
  admin: 'Администратор',
};

const EMPTY_FORM = {
  email: '', password: '', fullName: '', phone: '', role: 'user', balance: '',
};

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [topupFor, setTopupFor] = useState(null); // { id, name, balance }
  const [topupAmount, setTopupAmount] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, balance, subscription_status, subscription_paid_until, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) { console.error('[UsersManager] load error:', error); return; }
        setUsers(data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [u.full_name, u.email, u.phone].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    const { ok, errors: errs } = validateNewUser(form);
    setErrors(errs);
    if (!ok) return;

    setCreating(true);
    try {
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: form.email.trim(),
        p_password: form.password,
        p_full_name: form.fullName.trim() || null,
        p_phone: form.phone.trim() || null,
        p_role: form.role,
        p_initial_balance: Number(form.balance || 0),
      });
      if (error) throw new Error(error.message);

      toast.success(`Пользователь создан · стартовый баланс ${formatTJS(form.balance || 0)}`);
      setForm(EMPTY_FORM);
      setErrors({});
      setShowCreate(false);
      load();
    } catch (err) {
      console.error('[UsersManager] create error:', err);
      toast.error(err.message || 'Не удалось создать пользователя');
    } finally {
      setCreating(false);
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    const res = validateTopup(topupAmount);
    if (!res.ok) { toast.error(res.error); return; }

    setTopupBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_topup_balance', {
        p_user_id: topupFor.id,
        p_amount: res.amount,
        p_reason: 'Пополнение администратором',
      });
      if (error) throw new Error(error.message);
      toast.success(`Баланс пополнен: ${formatTJS(data)}`);
      setTopupFor(null);
      setTopupAmount('');
      load();
    } catch (err) {
      console.error('[UsersManager] topup error:', err);
      toast.error(err.message || 'Не удалось пополнить баланс');
    } finally {
      setTopupBusy(false);
    }
  };

  const field = (key, label, type = 'text', placeholder = '') => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 ${
          errors[key] ? 'border-red-400' : 'border-gray-200 dark:border-gray-600'
        }`}
      />
      {errors[key] && <p className="text-[10px] text-red-500">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, e-mail или телефону"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          onClick={() => { setShowCreate((v) => !v); setErrors({}); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          <UserPlus size={15} />
          Добавить пользователя
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-3">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-200">
            Новый пользователь сможет войти по e-mail и паролю, а баланс потратить на подписку (например, «Бизнес» — 1000 TJS)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {field('email', 'E-mail', 'email', 'client@example.com')}
            {field('password', 'Пароль (мин. 6 символов)', 'text', '••••••')}
            {field('fullName', 'Имя', 'text', 'Имя Фамилия')}
            {field('phone', 'Телефон', 'tel', '+992 90 000 00 00')}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Роль</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              {errors.role && <p className="text-[10px] text-red-500">{errors.role}</p>}
            </div>
            {field('balance', 'Стартовый баланс, TJS', 'number', '1000')}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {creating && <Loader2 size={13} className="animate-spin" />}
              Создать
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setErrors({}); }}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-500">Пользователи не найдены</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold">Пользователь</th>
                  <th className="text-left px-4 py-2.5 font-bold">Роль</th>
                  <th className="text-left px-4 py-2.5 font-bold">Баланс</th>
                  <th className="text-left px-4 py-2.5 font-bold">Подписка</th>
                  <th className="text-right px-4 py-2.5 font-bold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{u.full_name || '—'}</p>
                      <p className="text-[11px] text-gray-400">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                      {ROLE_LABELS[u.role] || u.role || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-gray-800 dark:text-gray-100">{formatTJS(u.balance)}</td>
                    <td className="px-4 py-2.5">
                      {u.subscription_status === 'active'
                        ? <span className="text-green-600 dark:text-green-400">активна{u.subscription_paid_until ? ` до ${new Date(u.subscription_paid_until).toLocaleDateString('ru-RU')}` : ''}</span>
                        : <span className="text-gray-400">{u.subscription_status || 'нет'}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => { setTopupFor(u); setTopupAmount(''); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                      >
                        <Wallet size={12} /> Пополнить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {topupFor && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4" onClick={() => setTopupFor(null)}>
          <form
            onSubmit={handleTopup}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl p-5 space-y-3 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Пополнение баланса</p>
                <p className="text-[11px] text-gray-500">{topupFor.full_name || topupFor.email} · сейчас {formatTJS(topupFor.balance)}</p>
              </div>
              <button type="button" onClick={() => setTopupFor(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">Сумма, TJS</label>
              <input
                type="number"
                autoFocus
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="1000"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[500, 1000, 2000, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTopupAmount(String(v))}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                >
                  +{v}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={topupBusy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
              >
                {topupBusy && <Loader2 size={13} className="animate-spin" />}
                Пополнить
              </button>
              <button type="button" onClick={() => setTopupFor(null)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold">
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
