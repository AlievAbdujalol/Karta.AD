import { useState, useEffect } from 'react';
import { KeyRound, Eye, EyeOff, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadUserKeys, saveUserKey, deleteUserKey, hasOwnKey,
} from '@/lib/userKeys';
import { validateOpenRouterKey } from '@/lib/openrouter';

const PROVIDERS = [
  {
    id: 'openrouter',
    title: 'OpenRouter',
    desc: 'AI-конструктор сайтов в Бизнесе',
    link: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-v1-…',
  },
  {
    id: 'gemini',
    title: 'Gemini',
    desc: 'Помощник, умный поиск, озвучка советов',
    link: 'https://aistudio.google.com/apikey',
    placeholder: 'AQ.…',
  },
];

/**
 * Личные AI-ключи пользователя. У каждого свой ключ,
 * общий из .env используется только как фолбэк.
 */
export default function UserApiKeys({ userId }) {
  const [values, setValues] = useState({ openrouter: '', gemini: '' });
  const [saved, setSaved] = useState({ openrouter: '', gemini: '' });
  const [show, setShow] = useState({ openrouter: false, gemini: false });
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    if (!userId) return;
    loadUserKeys(userId).then(() => {
      setSaved({
        openrouter: hasOwnKey('openrouter') ? 'saved' : '',
        gemini: hasOwnKey('gemini') ? 'saved' : '',
      });
    }).catch(() => {});
  }, [userId]);

  const handleSave = async (id) => {
    if (!userId || !values[id]?.trim()) {
      toast.error('Вставь ключ');
      return;
    }
    setSaving(id);
    try {
      if (id === 'openrouter') {
        const check = await validateOpenRouterKey(values[id]);
        if (!check.ok && check.reason !== 'network') {
          toast.error(check.reason);
          return;
        }
        if (!check.ok) toast.info('Нет связи — сохранил без проверки');
      }
      await saveUserKey(userId, id, values[id]);
      setSaved((s) => ({ ...s, [id]: 'saved' }));
      setValues((v) => ({ ...v, [id]: '' }));
      toast.success('Ключ сохранён — только ты его видишь');
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить свой ключ? Будет использоваться общий.')) return;
    try {
      await deleteUserKey(userId, id);
      setSaved((s) => ({ ...s, [id]: '' }));
      toast.success('Ключ удалён');
    } catch (e) {
      toast.error(e.message || 'Не удалось удалить');
    }
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-violet-500" />
        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex-1">Мои AI-ключи</p>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
        У каждого свой ключ — траты идут с твоего счёта. Без личного ключа работает общий.
      </p>
      {PROVIDERS.map((p) => (
        <div key={p.id} className="space-y-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 flex-1">{p.title}</p>
            {saved[p.id] && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                свой ключ ✓
              </span>
            )}
            <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
              Взять ключ
            </a>
          </div>
          <p className="text-[11px] text-slate-400">{p.desc}</p>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type={show[p.id] ? 'text' : 'password'}
                value={values[p.id]}
                onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                placeholder={saved[p.id] ? 'Введён •••• — вставь новый для замены' : p.placeholder}
                autoComplete="off"
                className="w-full pr-9 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-mono"
              />
              <button
                onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title={show[p.id] ? 'Скрыть' : 'Показать'}
              >
                {show[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={() => handleSave(p.id)}
              disabled={saving === p.id || !values[p.id]?.trim()}
              className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1"
            >
              {saving === p.id ? '…' : <><Save size={12} /> OK</>}
            </button>
            {saved[p.id] && (
              <button onClick={() => handleDelete(p.id)} title="Удалить ключ"
                className="px-2.5 py-2 rounded-lg border border-red-200 dark:border-red-500/30 text-red-500">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
