import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLanguage } from '@/lib/useLanguage';
import { toast } from 'sonner';
import { Package, Plus, Search, Edit2, Trash2 } from 'lucide-react';

export default function BusinessProducts() {
  const { user } = useCurrentUser();
  const { lang } = useLanguage();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', category_id: '', image_url: '', description: '' });

  const loadData = async (businessId) => {
    if (!businessId) return;
    setLoading(true);
    const { data: prods, error: pErr } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    const { data: cats, error: cErr } = await supabase
      .from('categories')
      .select('*')
      .eq('business_id', businessId)
      .order('name');
    setLoading(false);
    if (pErr) toast.error('Ошибка загрузки товаров');
    else setProducts(prods || []);
    if (cErr) toast.error('Ошибка загрузки категорий');
    else setCategories(cats || []);
  };

  const loadBusinesses = async () => {
    const { data, error } = await supabase.rpc('get_my_businesses');
    if (!error && data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusiness(data[0]);
    }
  };

  useEffect(() => {
    if (user?.id) loadBusinesses();
  }, [user?.id]);

  useEffect(() => {
    if (selectedBusiness) loadData(selectedBusiness.id);
  }, [selectedBusiness?.id]);

  const resetForm = () => {
    setForm({ name: '', price: '', category_id: '', image_url: '', description: '' });
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      toast.error('Заполните название и цену');
      return;
    }
    const payload = {
      business_id: selectedBusiness.id,
      name: form.name,
      price: Number(form.price),
      category_id: form.category_id || null,
      image_url: form.image_url || null,
      description: form.description || null,
    };
    const { error } = editing
      ? await supabase.from('products').update(payload).eq('id', editing)
      : await supabase.from('products').insert(payload).select().single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? 'Товар обновлён' : 'Товар добавлен');
    setShowForm(false);
    resetForm();
    loadData(selectedBusiness.id);
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить товар?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Товар удалён'); loadData(selectedBusiness.id); }
  };

  const toggleActive = async (product) => {
    const { error } = await supabase.from('products').update({ active: !product.active }).eq('id', product.id);
    if (!error) loadData(selectedBusiness.id);
  };

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Package size={22} className="text-emerald-500" />
            Продукты
          </h1>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition flex items-center gap-1.5">
            <Plus size={16} /> Товар
          </button>
        </div>

        {/* Business selector */}
        {businesses.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {businesses.map((b) => (
              <button key={b.id} onClick={() => setSelectedBusiness(b)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold ${selectedBusiness?.id === b.id ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600'}`}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Название" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            <div className="flex gap-2">
              <input value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} placeholder="Цена (сом)" type="number" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
              <select value={form.category_id} onChange={(e) => setForm({...form, category_id: e.target.value})} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100">
                <option value="">Категория</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <input value={form.image_url} onChange={(e) => setForm({...form, image_url: e.target.value})} placeholder="URL изображения" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Описание" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            <div className="flex gap-2">
              <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg font-semibold">Сохранить</button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-sm text-slate-500">Отмена</button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center space-y-2 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-4xl">📦</div>
            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Нет товаров</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs">Добавьте первый товар</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.category_id || 'Без категории'}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">{Number(p.price).toLocaleString('ru-RU')} сом</span>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => toggleActive(p)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {p.active ? 'Активен' : 'Выкл'}
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(p.id); setForm({ name: p.name, price: String(p.price), category_id: p.category_id || '', image_url: p.image_url || '', description: p.description || '' }); setShowForm(true); }} className="p-1 text-slate-400 hover:text-blue-500"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(p.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
