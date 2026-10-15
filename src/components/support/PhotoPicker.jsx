import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, RotateCw, Loader2, CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import { PHOTO_LIMITS } from '@/lib/supportConfig';
import {
  uploadPhoto,
  validatePhotoFile,
  arePhotosSettled,
} from '@/lib/photoUpload';
import { removeStoragePhoto } from '@/lib/supportApi';

const ERROR_KEYS = {
  too_big: 'support.photoTooBig',
  bad_type: 'support.photoBadType',
  empty: 'support.photoEmpty',
};

let seq = 0;

/**
 * Выбор фото: валидация по магическим байтам, загрузка в bucket, превью,
 * повтор при сбое, удаление (в т.ч. уже загруженного файла из bucket).
 *
 * Управляемый: родитель хранит entries и передаёт их в RPC как источники
 * фото. Пока хоть одно фото не готово (uploading/error) — отправка формы
 * должна блокироваться (arePhotosSettled).
 *
 * @param {{ bucket: string, userId: string, value: any[], onChange: (v:any[])=>void,
 *           maxCount?: number }} props
 */
export default function PhotoPicker({ bucket, userId, value = [], onChange, maxCount = PHOTO_LIMITS.maxCount }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState(value);
  const entriesRef = useRef(value);
  const inputRef = useRef(null);

  // Родитель может сбросить список (после успешной отправки) — синхронизируемся
  // и отпускаем object-URLы удалённых карточек.
  useEffect(() => {
    const prev = entriesRef.current;
    const keep = new Set(value.map(e => e.id));
    for (const e of prev) {
      if (!keep.has(e.id) && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    }
    entriesRef.current = value;
    setEntries(value);
  }, [value]);

  // Отпускаем object-URL при размонтировании.
  useEffect(() => {
    const current = entriesRef;
    return () => {
      for (const e of current.current) {
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
      }
    };
  }, []);

  const emit = next => {
    entriesRef.current = next;
    setEntries(next);
    onChange(next);
  };

  const patch = (id, changes) => {
    emit(entriesRef.current.map(e => (e.id === id ? { ...e, ...changes } : e)));
  };

  const runUpload = async entry => {
    patch(entry.id, { status: 'uploading', error: null });
    try {
      const { path, mime, size } = await uploadPhoto(entry.file, bucket, userId);
      const stillPicked = entriesRef.current.some(e => e.id === entry.id);
      patch(entry.id, { status: 'ready', path, mime, size, error: null });
      if (!stillPicked) {
        // Файл убрали из списка, пока грузился — удаляем, чтобы не оставить сироту.
        removeStoragePhoto(bucket, path);
      }
    } catch (err) {
      if (ERROR_KEYS[err.code]) {
        // Файл не прошёл проверку до загрузки — убираем из списка совсем.
        toast.error(t(ERROR_KEYS[err.code]));
        removeEntry(entry.id, false);
        return;
      }
      patch(entry.id, { status: 'error', error: err.message || 'upload' });
    }
  };

  const removeEntry = (id, cleanStorage = true) => {
    const target = entriesRef.current.find(e => e.id === id);
    if (!target) return;
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    if (cleanStorage && target.path) removeStoragePhoto(bucket, target.path);
    emit(entriesRef.current.filter(e => e.id !== id));
  };

  const handleFiles = async fileList => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    // Всё считаем от последнего состояния (ref), иначе гонка с другими загрузками
    // затрёт их результат или превысит лимит.
    const base = entriesRef.current;
    const free = maxCount - base.length;
    if (free <= 0) {
      toast.error(t('support.photoCountLimit', { max: maxCount }));
      return;
    }
    const accepted = [];
    for (const file of files.slice(0, free)) {
      const check = await validatePhotoFile(file);
      if (!check.ok) {
        toast.error(t(ERROR_KEYS[check.error] || ERROR_KEYS.bad_type));
        continue;
      }
      seq += 1;
      accepted.push({
        id: `ph-${seq}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
        path: null,
        mime: check.mime,
        size: file.size,
        error: null,
      });
    }
    if (files.length > free) toast.error(t('support.photoCountLimit', { max: maxCount }));
    if (accepted.length === 0) return;
    emit([...base, ...accepted]);
    for (const entry of accepted) runUpload(entry);
  };

  const busy = entries.some(e => e.status === 'uploading');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {t('support.photosLabel')}
        </span>
        <span className="text-[11px] text-slate-400">
          {entries.length}/{maxCount}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {entries.map(entry => (
          <div
            key={entry.id}
            className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 group"
          >
            <img
              src={entry.previewUrl}
              alt=""
              className="w-full h-full object-cover"
              data-testid={`photo-${entry.id}`}
            />
            {entry.status === 'uploading' && (
              <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center">
                <Loader2 size={18} className="text-white animate-spin" />
              </div>
            )}
            {entry.status === 'error' && (
              <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-1 text-white px-1">
                <CircleAlert size={16} />
                <button
                  type="button"
                  onClick={() => runUpload(entry)}
                  className="text-[10px] font-bold bg-white/20 rounded-lg px-2 py-0.5 flex items-center gap-1"
                >
                  <RotateCw size={10} />
                  {t('support.retry')}
                </button>
              </div>
            )}
            <button
              type="button"
              aria-label={t('support.removePhoto')}
              onClick={() => removeEntry(entry.id)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {entries.length < maxCount && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <ImagePlus size={18} />
            <span className="text-[10px] font-bold">{t('support.addPhoto')}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        data-testid="photo-input"
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {!arePhotosSettled(entries) && entries.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{t('support.photoPending')}</p>
      )}
    </div>
  );
}
