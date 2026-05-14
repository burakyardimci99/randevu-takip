/**
 * Showcase/Envanter proje kartı — like + comment + public profile link.
 *
 * Like: optimistic update (önce UI, sonra API).
 * Comments: panel toggle, ilk açılışta fetch.
 * Auth yoksa beğeni/yorum giriş'e yönlendirir.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { api } from '../services/api';
import type { ShowcaseComment, ShowcaseItem } from '../types';

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${new Date(start).toLocaleDateString('tr-TR', opts)} → ${new Date(end).toLocaleDateString('tr-TR', opts)}`;
}
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'az önce';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

interface Props {
  item: ShowcaseItem;
  /** authorId — public profile linki için (showcase API'sinden gelmiyor, bu yüzden opsiyonel). */
  authorId?: string;
  /** Mevcut beğeni sayısı (parent'tan). */
  likes: number;
  /** Mevcut yorum sayısı (parent'tan). */
  comments: number;
}

export function ShowcaseCard({ item, authorId, likes, comments }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [likeCount, setLikeCount] = useState(likes);
  const [commentCount, setCommentCount] = useState(comments);
  const [liked, setLiked] = useState(false);
  const [likeStatusLoaded, setLikeStatusLoaded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsList, setCommentsList] = useState<ShowcaseComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [sending, setSending] = useState(false);

  async function ensureLikeStatus() {
    if (likeStatusLoaded || !user) return;
    try {
      const s = await api.getLikeStatus(item.id);
      setLiked(s.liked);
      setLikeCount(s.count);
      setLikeStatusLoaded(true);
    } catch {
      // ignore
    }
  }

  async function handleLike() {
    if (!user) {
      navigate('/login');
      return;
    }
    // Optimistic
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    try {
      const s = await api.toggleLike(item.id);
      setLiked(s.liked);
      setLikeCount(s.count);
    } catch (err) {
      // Rollback
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    }
  }

  async function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && commentsList.length === 0) {
      setCommentsLoading(true);
      try {
        const res = await api.listComments(item.id);
        setCommentsList(res.comments);
      } catch (err) {
        toast.push('error', (err as Error).message || 'Yorumlar yüklenemedi.');
      } finally {
        setCommentsLoading(false);
      }
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    const body = commentBody.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.postComment(item.id, body);
      setCommentsList((list) => [res.comment, ...list]);
      setCommentCount((c) => c + 1);
      setCommentBody('');
    } catch (err) {
      toast.push('error', (err as Error).message || 'Yorum gönderilemedi.');
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await api.deleteComment(commentId);
      setCommentsList((list) => list.filter((c) => c.id !== commentId));
      setCommentCount((c) => Math.max(0, c - 1));
    } catch (err) {
      toast.push('error', (err as Error).message || 'Yorum silinemedi.');
    }
  }

  // Mount sonrası like status fetch (sadece auth varsa)
  if (user && !likeStatusLoaded) {
    void ensureLikeStatus();
  }

  return (
    <article
      className={`card-hover p-5 flex flex-col h-full ${
        item.isHighlight ? 'ring-2 ring-kt-gold-400' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-bold text-kt-gold-700 tracking-wider">
          {item.roomCode} · {item.neighborhood}
        </span>
        {item.isHighlight && (
          <span className="px-2 py-0.5 rounded-md bg-kt-gold-100 text-kt-gold-800 text-[10px] font-bold uppercase tracking-wider">
            ⭐ Öne çıkan
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-kt-green-900 mb-2 line-clamp-2">
        {item.projectName}
      </h3>
      <p className="text-sm text-kt-gray-600 line-clamp-3 mb-3 flex-1">
        {item.projectDescription}
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {item.technologies.slice(0, 5).map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded-md bg-kt-green-50 text-kt-green-800 text-[11px] font-semibold"
          >
            {t}
          </span>
        ))}
        {item.technologies.length > 5 && (
          <span className="px-2 py-0.5 rounded-md text-kt-gray-400 text-[11px]">
            +{item.technologies.length - 5}
          </span>
        )}
      </div>

      {/* Yazar + tarih */}
      <div className="flex items-center gap-2 pt-3 border-t border-kt-gray-100">
        {authorId ? (
          <Link
            to={`/u/${authorId}`}
            className="flex items-center gap-2 flex-1 min-w-0 group"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-kt-green-600 to-kt-green-800 text-white flex items-center justify-center font-bold text-xs">
              {initials(item.authorFullName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-kt-green-800 truncate group-hover:text-kt-gold-700">
                {item.authorFullName}
              </div>
              <div className="text-[10px] text-kt-gray-500">
                {fmtRange(item.startDate, item.endDate)} · {item.periodMonths} ay
              </div>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-kt-green-600 to-kt-green-800 text-white flex items-center justify-center font-bold text-xs">
              {initials(item.authorFullName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-kt-green-800 truncate">
                {item.authorFullName}
              </div>
              <div className="text-[10px] text-kt-gray-500">
                {fmtRange(item.startDate, item.endDate)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Like + Comment butonları */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all ${
            liked
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-white border-kt-gray-200 text-kt-gray-600 hover:border-rose-200 hover:text-rose-700'
          }`}
          title={liked ? 'Beğeniyi kaldır' : 'Beğen'}
        >
          <svg className="w-3.5 h-3.5" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="font-semibold tabular-nums">{likeCount}</span>
        </button>

        <button
          onClick={toggleComments}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all ${
            showComments
              ? 'bg-kt-gold-50 border-kt-gold-300 text-kt-gold-700'
              : 'bg-white border-kt-gray-200 text-kt-gray-600 hover:border-kt-gold-200 hover:text-kt-gold-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="font-semibold tabular-nums">{commentCount}</span>
        </button>
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="mt-3 border-t border-kt-gray-100 pt-3 space-y-2 animate-fade-in">
          {user && (
            <form onSubmit={handlePostComment} className="flex gap-1.5">
              <input
                type="text"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Yorum yaz..."
                maxLength={1000}
                disabled={sending}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-kt-gray-200 text-xs focus:border-kt-gold-400 focus:ring-1 focus:ring-kt-gold-400/30 outline-none"
              />
              <button
                type="submit"
                disabled={sending || !commentBody.trim()}
                className="px-2.5 py-1.5 rounded-lg bg-kt-green-700 hover:bg-kt-green-800 disabled:opacity-50 text-white text-xs font-semibold"
              >
                Gönder
              </button>
            </form>
          )}
          {!user && (
            <p className="text-[11px] text-kt-gray-500 italic text-center py-1">
              <Link to="/login" className="text-kt-gold-700 font-semibold underline">
                Giriş yap
              </Link>{' '}
              ve yorum gönder.
            </p>
          )}

          {commentsLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-10 bg-kt-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : commentsList.length === 0 ? (
            <p className="text-[11px] text-kt-gray-400 italic text-center py-2">
              Henüz yorum yok. İlk yorumu sen yap.
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {commentsList.map((c) => (
                <li key={c.id} className="flex gap-2 group">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-kt-green-600 to-kt-green-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {initials(c.userFullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[11px] font-bold text-kt-green-800">
                        {c.userFullName}
                      </span>
                      <span className="text-[10px] text-kt-gray-400">
                        {fmtRelative(c.createdAt)}
                      </span>
                      {user?.id === c.userId && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 ml-auto text-[10px] text-rose-500 hover:text-rose-700"
                          title="Yorumu sil"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-kt-green-900 whitespace-pre-wrap break-words">
                      {c.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
