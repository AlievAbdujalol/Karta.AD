import { useRef, useState } from 'react';
import { X, Send, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import {
  POST_CATEGORIES,
  POST_LIMITS,
  PHOTO_LIMITS,
  postCategoryI18nKey,
} from '@/lib/supportConfig';
import { arePhotosSettled } from '@/lib/photoUpload';
import { createPost, createPostPhotos, deletePost, removeStoragePhoto } from '@/lib/supportApi';
import PhotoPicker from './PhotoPicker';

/**
 * Композер новой публикации в сообществе.
 * Порядок: сначала грузим фото (bucket community-photos, своя папка),
 * потом создаём пост и привязываем строки фото. Если привязка не удалась —
 * пост удаляется, чтобы не осталась «успешная» публикация без фото.
 */
export default function CommunityComposer({ userId, onCreated, onCancel }) {
  const { t } = useLanguage();
  const [category, setCategory] = useState(POST_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const photosRef = useRef(photos);

  const photosReady = arePhotosSettled(photos);

  const handlePhotosChange = next => {
    photosRef.current = next;
    setPhotos(next);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < POST_LIMITS.titleMin || trimmedTitle.length > POST_LIMITS.titleMax) {
      return toast.error(t('support.titleInvalid'));
    }
    if (trimmedBody.length < POST_LIMITS.bodyMin || trimmedBody.length > POST_LIMITS.bodyMax) {
      return toast.error(t('support.postBodyInvalid'));
    }
    if (!photosReady) return toast.error(t('support.photoPending'));

    setSubmitting(true);
    try {
      const post = await createPost({ authorId: userId, category, title: trimmedTitle, body: trimmedBody });
      if (photos.length > 0) {
        try {
          await createPostPhotos(post.id, photos, userId);
        } catch (photoErr) {
          // Фото не привязались — публикация не должна выглядеть успешной.
          await deletePost(post.id).catch(() => {});
          throw photoErr;
        }
      }
      toast.success(t('support.published'));
      onCreated?.();
      onCancel?.();
    } catch (err) {
      toast.error(err.message || t('support.feedError'));
    }
    setSubmitting(false);
  };

  // Отмена композинга: уже загруженные файлы убираем из bucket, чтобы не
  // оставлять сирот (после успешной публикации этот обработчик не зовётся).
  const handleCancel = () => {
    for (const p of photosRef.current) {
      if (p.path) removeStoragePhoto(PHOTO_LIMITS.buckets.community, p.path);
    }
    onCancel?.();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[20px] p-5 shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
          {t('support.newPost')}
        </h2>
        <button
          type="button"
          aria-label={t('support.close')}
          onClick={handleCancel}
          className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.categoryLabel')}
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors"
        >
          {POST_CATEGORIES.map(c => (
            <option key={c} value={c}>{t(postCategoryI18nKey(c))}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.postTitleLabel')}
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={POST_LIMITS.titleMax}
          placeholder={t('support.postTitlePlaceholder')}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs bg-slate-50 dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 block">
          {t('support.postBodyLabel')}
        </label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          maxLength={POST_LIMITS.bodyMax}
          placeholder={t('support.postBodyPlaceholder')}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs resize-none bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <PhotoPicker
        bucket={PHOTO_LIMITS.buckets.community}
        userId={userId}
        value={photos}
        onChange={handlePhotosChange}
        maxCount={PHOTO_LIMITS.maxCount}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !photosReady}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-sm shadow-blue-500/10"
        >
          {submitting ? (
            <span className="text-xs">{t('submitting')}</span>
          ) : (
            <>
              <Send size={15} />
              <span className="text-xs">{t('support.publish')}</span>
            </>
          )}
        </button>
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        <ImagePlus size={12} />
        {t('support.photoHint', { max: PHOTO_LIMITS.maxCount })}
      </p>
    </div>
  );
}
