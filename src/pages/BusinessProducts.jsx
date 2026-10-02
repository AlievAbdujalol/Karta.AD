import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { toast } from 'sonner';
import { Package, Plus, Search, Edit2, Trash2, ImagePlus, X } from 'lucide-react';
import BusinessSubHeader from '@/components/BusinessSubHeader';

export default function BusinessProducts() {
  const { user } = useCurrentUser();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', category_id: '', image_url: '', description: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

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
    setPhotoFile(null);
    setPhotoPreview('');
    setEditing(null);
  };

  const pickPhoto = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Выбери файл-картинку');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Фото больше 5 МБ');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (businessId) => {
    if (!photoFile) return form.image_url || null;
    const ext = (photoFile.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
    const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, photoFile, {
      contentType: photoFile.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const photoPathFromUrl = (url) => {
    if (!url) return null;
    const i = url.indexOf('product-images/');
    return i >= 0 ? url.slice(i + 'product-images/'.length) : null;
  };

  const handleAddCategory = async () => {
    const name = newCategory.trim();
    if (!name || !selectedBusiness) return;
    setAddingCategory(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ business_id: selectedBusiness.id, name })
        .select()
        .single();
      if (error) throw error;
      setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
      setForm((f) => ({ ...f, category_id: data.id }));
      setNewCategory('');
      toast.success('Категория добавлена');
    } catch (e) {
      toast.error(e.message || 'Не удалось добавить категорию');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error('Заполните название и цену');
      return;
    }
    if (Number(form.price) <= 0 || Number.isNaN(Number(form.price))) {
      toast.error('Цена должна быть больше нуля');
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadPhoto(selectedBusiness.id);
      const payload = {
        business_id: selectedBusiness.id,
        name: form.name.trim(),
        price: Number(form.price),
        category_id: form.category_id || null,
        image_url: imageUrl,
        description: form.description || null,
      };
      const { error } = editing
        ? await supabase.from('products').update(payload).eq('id', editing)
        : await supabase.from('products').insert(payload).select().single();
      if (error) throw error;
      toast.success(editing ? 'Товар обновлён' : 'Товар добавлен');
      setShowForm(false);
      resetForm();
      loadData(selectedBusiness.id);
    } catch (e) {
      toast.error(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!confirm('Удалить товар?')) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const path = photoPathFromUrl(product.image_url);
    if (path) {
      try { await supabase.storage.from('product-images').remove([path]); } catch {}
    }
    toast.success('Товар удалён');
    loadData(selectedBusiness.id);
  };

  const toggleActive = async (product) => {
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    if (error) toast.error(error.message);
    else loadData(selectedBusiness.id);
  };

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <BusinessSubHeader
          title="Продукты"
          icon={Package}
          iconClassName="text-emerald-500 flex items-center"
          right={(
            <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition flex items-center gap-1.5">
              <Plus size={16} /> Товар
            </button>
          )}
        />

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
              <input value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} placeholder="Цена (сом)" type="number" min="0" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
              <select value={form.category_id} onChange={(e) => setForm({...form, category_id: e.target.value})} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100">
                <option value="">Категория</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }} placeholder="Новая категория…" className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
              <button onClick={handleAddCategory} disabled={addingCategory || !newCategory.trim()} className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold disabled:opacity-50 flex items-center gap-1">
                <Plus size={13} /> {addingCategory ? '…' : 'Категория'}
              </button>
            </div>
            {/* Фото товара */}
            <div>
              <input
                id="product-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }}
              />
              {photoPreview ? (
                <div className="relative w-28 h-28">
                  <img src={photoPreview} alt="Фото товара" className="w-28 h-28 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(''); setForm((f) => ({ ...f, image_url: '' })); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow"
                    title="Убрать фото"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="product-photo"
                  className="flex items-center justify-center gap-2 w-full px-3 py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 cursor-pointer hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                >
                  <ImagePlus size={16} />
                  Загрузить фото
                </label>
              )}
            </div>
            <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Описание" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm text-slate-800 dark:text-slate-100" />
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded-lg font-semibold">{saving ? 'Сохраняем…' : 'Сохранить'}</button>
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
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                    ) : (
                      <span className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">📦</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{categories.find((c) => c.id === p.category_id)?.name || 'Без категории'}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">{Number(p.price).toLocaleString('ru-RU')} сом</span>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => toggleActive(p)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.is_active ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {p.is_active ? 'Активен' : 'Выкл'}
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(p.id); setForm({ name: p.name, price: String(p.price), category_id: p.category_id || '', image_url: p.image_url || '', description: p.description || '' }); setPhotoFile(null); setPhotoPreview(p.image_url || ''); setShowForm(true); }} className="p-1 text-slate-400 hover:text-blue-500"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(p)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
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
