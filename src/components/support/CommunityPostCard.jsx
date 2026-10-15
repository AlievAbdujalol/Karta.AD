import { useEffect, useState } from 'react';
import { MessageSquare, ThumbsUp, Trash2, Flag, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/useLanguage';
import { PHOTO_LIMITS, POST_LIMITS, REPORT_REASONS, postCategoryI18nKey, reportReasonI18nKey } from '@/lib/supportConfig';
import { publicPhotoUrl } from '@/lib/photoUpload';
import {
  fetchComments,
  addComment,
  setReaction,
  reportTarget,
  deletePost,
} from '@/lib/supportApi';

function authorLabel(post, userId, t) {
  return post.author_id === userId ? t('support.authorMe') : t('support.authorAnon');
}

function ReportMenu({ targetType, targetId, userId, onReported }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async reason => {
    setBusy(true);
    try {
      const res = await reportTarget(targetType, targetId, reason, userId);
      toast.success(t(res.already ? 'support.alreadyReported' : 'support.reported'));
      setOpen(false);
      onReported?.();
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('support.report')}
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
      >
        <Flag size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          {REPORT_REASONS.map(reason => (
            <button
              key={reason}
              type="button"
              disabled={busy}
              onClick={() => send(reason)}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50"
            >
              {t(reportReasonI18nKey(reason))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Карточка публикации сообщества: фото, «Полезно», ветка комментариев,
 * жалоба, удаление своей публикации.
 */
export default function CommunityPostCard({ post, userId, count = 0, mine = false, onChanged }) {
  const { t, lang } = useLanguage();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);

  const photos = post.community_photos || [];

  const loadComments = async () => {
    try {
      setComments(await fetchComments(post.id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (commentsOpen) loadComments();
  }, [commentsOpen, post.id]);

  const toggleReaction = async () => {
    try {
      await setReaction(post.id, userId, !mine);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const sendComment = async () => {
    if (sending) return;
    const text = commentText.trim();
    if (text.length < POST_LIMITS.commentMin) return;
    if (text.length > POST_LIMITS.commentMax) return toast.error(t('support.commentInvalid'));
    setSending(true);
    try {
      await addComment(post.id, text, userId);
      setCommentText('');
      await loadComments();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
    setSending(false);
  };

  const removePost = async () => {
    if (!window.confirm(t('support.deleteConfirm'))) return;
    try {
      await deletePost(post.id);
      toast.success(t('support.deleted'));
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[20px] p-5 shadow-sm border border-slate-100 dark:border-slate-700/60 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20">
            {t(postCategoryI18nKey(post.category))}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
            {authorLabel(post, userId, t)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-400">
            {new Date(post.created_at).toLocaleDateString(lang)}
          </span>
          {post.author_id === userId && (
            <button
              type="button"
              aria-label={t('support.deletePost')}
              onClick={removePost}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
          <ReportMenu targetType="post" targetId={post.id} userId={userId} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{post.title}</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-line leading-relaxed">
          {post.body}
        </p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map(ph => (
            <img
              key={ph.id}
              src={publicPhotoUrl(PHOTO_LIMITS.buckets.community, ph.storage_path)}
              alt={post.title}
              loading="lazy"
              className="w-full h-36 object-cover rounded-xl border border-slate-100 dark:border-slate-700"
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
        <button
          type="button"
          onClick={toggleReaction}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
            mine
              ? 'bg-blue-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <ThumbsUp size={13} fill={mine ? 'currentColor' : 'none'} />
          {t('support.helpful')} · {count}
        </button>
        <button
          type="button"
          aria-label={t('support.comments')}
          onClick={() => setCommentsOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <MessageSquare size={13} />
          {comments.length > 0 ? comments.length : ''}
          {commentsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {commentsOpen && (
        <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3">
          {comments.length === 0 && (
            <p className="text-[11px] text-slate-400 text-center py-1">{t('support.noComments')}</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {c.author_id === userId ? t('support.authorMe') : t('support.authorAnon')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-400">
                    {new Date(c.created_at).toLocaleDateString(lang)}
                  </span>
                  <ReportMenu targetType="comment" targetId={c.id} userId={userId} />
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">{c.body}</p>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              maxLength={POST_LIMITS.commentMax}
              placeholder={t('support.commentPlaceholder')}
              onKeyDown={e => e.key === 'Enter' && sendComment()}
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />
            <button
              type="button"
              aria-label={t('support.sendComment')}
              onClick={sendComment}
              disabled={sending || commentText.trim().length === 0}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
