import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Users } from 'lucide-react';
import { useLanguage } from '@/lib/useLanguage';
import { fetchFeed, fetchReactions, subscribe, unsubscribe } from '@/lib/supportApi';
import CommunityComposer from './CommunityComposer';
import CommunityPostCard from './CommunityPostCard';

/**
 * Лента сообщества: публичные посты, реакции, комментарии, жалобы.
 * Realtime — опционально: при сбое подписки лента просто обновляется
 * вручную и после каждого действия.
 */
export default function CommunityTab({ userId }) {
  const { t } = useLanguage();
  const [posts, setPosts] = useState([]);
  const [reactions, setReactions] = useState({ counts: {}, mine: {} });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(async () => {
    try {
      const list = await fetchFeed();
      setPosts(list);
      setFailed(false);
      const summary = await fetchReactions(list.map(p => p.id), userId);
      setReactions(summary);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload, reloadKey]);

  // Realtime-обновления ленты; сбой подписки не критичен (см. reload).
  useEffect(() => {
    const channel = subscribe('community_posts', () => setReloadKey(k => k + 1));
    return () => unsubscribe(channel);
  }, []);

  const bump = () => setReloadKey(k => k + 1);

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <RefreshCw size={28} className="mx-auto mb-3 animate-spin opacity-40" />
        <p className="text-xs">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Users size={14} />
          {t('support.communitySubtitle')}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label={t('support.reload')}
            onClick={bump}
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 flex items-center justify-center hover:text-blue-600 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setComposerOpen(v => !v)}
            className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={14} />
            {t('support.newPost')}
          </button>
        </div>
      </div>

      {composerOpen && (
        <CommunityComposer
          userId={userId}
          onCreated={bump}
          onCancel={() => setComposerOpen(false)}
        />
      )}

      {failed && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{t('support.feedError')}</span>
          <button type="button" onClick={bump} className="font-bold underline">
            {t('support.reload')}
          </button>
        </div>
      )}

      {!failed && posts.length === 0 && !composerOpen && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Users size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-xs">{t('support.feedEmpty')}</p>
        </div>
      )}

      <div className="space-y-3">
        {posts.map(post => (
          <CommunityPostCard
            key={post.id}
            post={post}
            userId={userId}
            count={reactions.counts[post.id] || 0}
            mine={Boolean(reactions.mine[post.id])}
            onChanged={bump}
          />
        ))}
      </div>
    </div>
  );
}
