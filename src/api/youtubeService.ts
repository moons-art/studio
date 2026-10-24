import { functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';

export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  channelTitle: string;
  duration?: string;
}

/**
 * 유튜브 URL 또는 ID에서 순수 11자리 videoId 추출
 */
export function extractYoutubeVideoId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const clean = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = clean.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

/**
 * 11자리 videoId 또는 URL로부터 표준 임베드 URL 생성
 */
export function getYoutubeEmbedUrl(urlOrId?: string): string | null {
  const videoId = extractYoutubeVideoId(urlOrId);
  if (!videoId) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}`;
}

/**
 * 11자리 videoId로부터 고화질 썸네일 URL 생성
 */
export function getYoutubeThumbnailUrl(urlOrId?: string): string {
  const videoId = extractYoutubeVideoId(urlOrId);
  if (!videoId) return '';
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * 완전 0원/무키 유튜브 찬양 검색 (로컬 Vite 미들웨어 및 Firebase Cloud Functions 서버리스 지원)
 */
export async function searchYoutubeVideos(query: string): Promise<YoutubeSearchResult[]> {
  if (!query || !query.trim()) return [];

  const cleanQuery = query.trim();

  // 1. 로컬 개발 환경 프록시 엔드포인트 우선 시도 (배포 없이도 즉시 동작)
  try {
    const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(cleanQuery)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.videos)) {
        return data.videos;
      }
    }
  } catch (localErr) {
    // 로컬 엔드포인트가 없거나 오류 시 Cloud Functions로 폴백
  }

  // 2. 프로덕션 환경 Cloud Functions 호출
  try {
    const searchCallable = httpsCallable<{ query: string; maxResults?: number }, { success: boolean; videos: YoutubeSearchResult[] }>(
      functions,
      'searchYoutubeVideosCallable'
    );
    const result = await searchCallable({
      query: cleanQuery,
      maxResults: 15,
    });

    if (result.data?.success && Array.isArray(result.data.videos)) {
      return result.data.videos;
    }
  } catch (err: any) {
    console.warn('[youtubeService] Cloud Functions search bypassed:', err?.message || err);
  }

  return [];
}

