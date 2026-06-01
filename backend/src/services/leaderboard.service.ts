/**
 * Leaderboard / Sıralama servisi (#5a).
 *
 * İki sıralama:
 *  - users: lab üyeleri — oda kullanımı (onaylı booking + kullanım günü) +
 *    showcase etkileşimi (aldığı beğeni/yorum) bileşik skoru.
 *  - projects: showcase projeleri — beğeni + yorum skoru.
 *
 * Privacy: yalnız aktif kullanıcılar; isimler showcase'te zaten public. Proje
 * sıralaması yalnız opt-in (approved + showcase_visible) projeleri içerir.
 * Endpoint user-auth (lab içi gamification) — tam public DEĞİL.
 */
import { getDb } from '../db/schema';
// Paylaşılan DTO (backend↔frontend tek kaynak) — #6.
import type { Leaderboard, LeaderboardUser, LeaderboardProject } from '@klab/shared';

export type { Leaderboard, LeaderboardUser, LeaderboardProject };

const WEIGHTS = { bookings: 10, utilizationDay: 0.25, like: 3, comment: 2 };

interface UserRow {
  id: string;
  full_name: string;
  department: string | null;
  approved_bookings: number;
  util_days: number;
  likes: number;
  comments: number;
}

interface ProjectRow {
  id: string;
  project_name: string;
  user_id: string;
  full_name: string;
  room_code: string;
  room_name: string;
  showcase_highlight: number;
  likes: number;
  comments: number;
}

function getUserRanking(limit: number): LeaderboardUser[] {
  // Beğeni/yorum: kullanıcının SAHİP olduğu booking'lere gelenler.
  // util_days: onaylı booking'lerin gün sayısı (SQLite julianday; #2'de Postgres'e uyarlanacak).
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.full_name, u.department,
              COUNT(DISTINCT CASE WHEN b.status = 'approved' THEN b.id END) AS approved_bookings,
              COALESCE(SUM(CASE WHEN b.status = 'approved'
                                THEN julianday(b.end_date) - julianday(b.start_date) + 1
                                ELSE 0 END), 0) AS util_days,
              (SELECT COUNT(*) FROM showcase_likes sl
                 JOIN bookings bb ON bb.id = sl.booking_id WHERE bb.user_id = u.id) AS likes,
              (SELECT COUNT(*) FROM showcase_comments sc
                 JOIN bookings bb ON bb.id = sc.booking_id WHERE bb.user_id = u.id) AS comments
       FROM users u
       LEFT JOIN bookings b ON b.user_id = u.id
       WHERE u.status = 1
       GROUP BY u.id, u.full_name, u.department`
    )
    .all() as UserRow[];

  return rows
    .map((r) => {
      const utilizationDays = Math.round(r.util_days ?? 0);
      const score =
        (r.approved_bookings ?? 0) * WEIGHTS.bookings +
        utilizationDays * WEIGHTS.utilizationDay +
        (r.likes ?? 0) * WEIGHTS.like +
        (r.comments ?? 0) * WEIGHTS.comment;
      return {
        userId: r.id,
        fullName: r.full_name,
        department: r.department,
        approvedBookings: r.approved_bookings ?? 0,
        utilizationDays,
        likes: r.likes ?? 0,
        comments: r.comments ?? 0,
        score: Math.round(score * 100) / 100,
      };
    })
    .filter((u) => u.score > 0) // hiç aktivitesi olmayanları gizle
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getProjectRanking(limit: number): LeaderboardProject[] {
  const rows = getDb()
    .prepare(
      `SELECT b.id, b.project_name, b.user_id, u.full_name,
              r.code AS room_code, r.name AS room_name, b.showcase_highlight,
              (SELECT COUNT(*) FROM showcase_likes sl WHERE sl.booking_id = b.id) AS likes,
              (SELECT COUNT(*) FROM showcase_comments sc WHERE sc.booking_id = b.id) AS comments
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.status = 'approved' AND b.showcase_visible = 1`
    )
    .all() as ProjectRow[];

  return rows
    .map((r) => ({
      bookingId: r.id,
      projectName: r.project_name,
      authorId: r.user_id,
      authorFullName: r.full_name,
      roomCode: r.room_code,
      roomName: r.room_name,
      isHighlight: r.showcase_highlight === 1,
      likes: r.likes ?? 0,
      comments: r.comments ?? 0,
      score: Math.round(((r.likes ?? 0) * WEIGHTS.like + (r.comments ?? 0) * WEIGHTS.comment) * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score || Number(b.isHighlight) - Number(a.isHighlight))
    .slice(0, limit);
}

export function getLeaderboard(limit = 20): Leaderboard {
  return {
    users: getUserRanking(limit),
    projects: getProjectRanking(limit),
    generatedAt: new Date().toISOString(),
    scoring: {
      bookings: WEIGHTS.bookings,
      utilizationDay: WEIGHTS.utilizationDay,
      like: WEIGHTS.like,
      comment: WEIGHTS.comment,
    },
  };
}
