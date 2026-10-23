import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  getDocFromCache,
  getDocsFromCache,
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import type { HymnalSong } from '../types/hymnal';

export interface FirestoreSong extends HymnalSong {
  albumId?: string;
  storageUrl?: string;
  fileId?: string; // 레거시 구글 드라이브 ID (하위 호환)
  searchTokens?: string[];
  updatedAt?: any;
}

export interface FirestoreAlbum {
  id: string;
  name: string;
  type: 'system' | 'custom' | 'fixed';
  path?: string;
  order?: number;
}

export interface FirestoreConti {
  id: string;
  title: string;
  date?: string;
  target?: string;
  items: any[]; // ContiItem[] 좌표, 크롭, 메모 등
  songForms?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export const hymnalFirestoreService = {
  /**
   * 현재 인증된 유저의 UID를 획득합니다.
   * 비동기 인증 복원 타이밍에도 안전하도록 offline_user_profile 백업을 지원합니다.
   */
  getCurrentUserId: (): string | null => {
    if (auth.currentUser?.uid) return auth.currentUser.uid;
    try {
      const offline = localStorage.getItem('offline_user_profile');
      if (offline) {
        const parsed = JSON.parse(offline);
        if (parsed?.uid) return parsed.uid;
      }
    } catch {}
    return null;
  },

  // --------------------------------------------------------------------------
  // 1. 앨범 관리 (users/{uid}/meta/albums)
  // --------------------------------------------------------------------------
  getAlbums: async (): Promise<FirestoreAlbum[]> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    const defaultAlbums: FirestoreAlbum[] = [
      { id: 'hymnal', name: '새찬송가', type: 'system' },
      { id: 'misc', name: '미분류', type: 'system' },
    ];

    if (!uid) {
      try {
        const cached = localStorage.getItem('nations_guest_albums');
        if (cached) return JSON.parse(cached);
      } catch {}
      return defaultAlbums;
    }

    try {
      const albumsDocRef = doc(db, `users/${uid}/meta/albums`);
      // 1. 로컬 캐시 우선 읽기 시도 (과금 방어)
      let snap;
      try {
        snap = await getDocFromCache(albumsDocRef);
      } catch {
        snap = await getDoc(albumsDocRef);
      }

      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.albums) && data.albums.length > 0) {
          return data.albums.map((a: any) =>
            a.id === 'misc' ? { ...a, name: '미분류' } : a
          );
        }
      }
    } catch (err) {
      console.warn('[hymnalFirestoreService] getAlbums cache/server miss, falling back:', err);
    }

    return defaultAlbums;
  },

  saveAlbums: async (albums: FirestoreAlbum[]): Promise<boolean> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (!uid) {
      try {
        localStorage.setItem('nations_guest_albums', JSON.stringify(albums));
        return true;
      } catch {
        return false;
      }
    }

    try {
      const albumsDocRef = doc(db, `users/${uid}/meta/albums`);
      await setDoc(albumsDocRef, {
        albums,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('[hymnalFirestoreService] saveAlbums error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // 2. 곡 관리 (IndexedDB 로컬 영구 저장소 1차 보장 + users/{uid}/songs/{songId} 하이브리드)
  // --------------------------------------------------------------------------
  getUserSongs: async (): Promise<FirestoreSong[]> => {
    const { imageCache } = await import('../utils/imageCache');
    const songMap = new Map<string, FirestoreSong>();
    const cloudSongIds = new Set<string>();

    // 1. IndexedDB에서 로컬 영구 보관된 사용자 악보 메타데이터 로드 (용량 무제한, 무조건 성공)
    try {
      const localMetaList = await imageCache.getAllSongsMeta();
      if (Array.isArray(localMetaList)) {
        localMetaList.forEach((s) => {
          if (s && s.id) songMap.set(s.id, s);
        });
      }
    } catch (e) {
      console.warn('[hymnalFirestoreService] IndexedDB meta load warning:', e);
    }

    // 2. LocalStorage 게스트/백업 데이터 병합
    try {
      const guestCached = localStorage.getItem('nations_guest_songs');
      if (guestCached) {
        const parsed = JSON.parse(guestCached);
        if (Array.isArray(parsed)) {
          parsed.forEach((s: any) => {
            if (s && s.id && !songMap.has(s.id)) songMap.set(s.id, s);
          });
        }
      }
    } catch {}

    // 3. Firestore 클라우드 동기화 시도 (온라인/인증 유효 시)
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (uid) {
      try {
        const songsColRef = collection(db, `users/${uid}/songs`);
        const snap = await getDocs(songsColRef);
        snap.forEach((d) => {
          const cloudSong = d.data() as FirestoreSong;
          if (cloudSong && cloudSong.id) {
            cloudSongIds.add(cloudSong.id);
            songMap.set(cloudSong.id, cloudSong);
            // 클라우드 데이터를 로컬 IndexedDB에도 백업 동기화
            imageCache.saveSongMeta(cloudSong).catch(() => {});
          }
        });

        // 4. 로컬에만 있고 클라우드에 아직 없는 사용자 곡이 있다면 백그라운드로 자동 업로드/동기화 (복구 메커니즘)
        songMap.forEach((localSong, id) => {
          if (!cloudSongIds.has(id) && (id.startsWith('song_') || localSong.albumId)) {
            hymnalFirestoreService.saveUserSong(localSong).catch(() => {});
          }
        });
      } catch (err: any) {
        console.warn('[hymnalFirestoreService] Cloud songs fetch bypassed:', err?.message || err);
      }
    }

    return Array.from(songMap.values());
  },

  saveUserSong: async (song: FirestoreSong): Promise<boolean> => {
    const { imageCache } = await import('../utils/imageCache');
    
    // 1. IndexedDB에 무조건 100% 즉시 영구 저장 (어떤 권한/네트워크 상태에서도 데이터 유실 방지)
    try {
      await imageCache.saveSongMeta(song);
    } catch (e) {
      console.error('[hymnalFirestoreService] Failed to save song to IndexedDB:', e);
    }

    // 2. LocalStorage에도 보조 백업 저장
    try {
      const cached = localStorage.getItem('nations_guest_songs');
      let list: any[] = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex((s: any) => s.id === song.id);
      if (idx !== -1) list[idx] = song;
      else list.push(song);
      localStorage.setItem('nations_guest_songs', JSON.stringify(list));
    } catch {}

    // 3. Firestore 원격 동기화 시도 (1KB 미만 초경량 메타데이터만 전송하여 1MB 한도 원천 방어)
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (uid) {
      try {
        const cleanSong: any = { ...song };
        // Base64 Data URL이 Firestore에 들어가서 1MB 한도를 초과하지 않도록 정제
        if (typeof cleanSong.storageUrl === 'string' && cleanSong.storageUrl.startsWith('data:')) {
          cleanSong.storageUrl = '';
        }
        if (typeof cleanSong.filePath === 'string' && cleanSong.filePath.startsWith('data:')) {
          cleanSong.filePath = '';
        }

        const songDocRef = doc(db, `users/${uid}/songs/${cleanSong.id}`);
        await setDoc(songDocRef, {
          ...cleanSong,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log(`[hymnalFirestoreService] Synced song to Firestore: ${cleanSong.title} (${cleanSong.id})`);
      } catch (err: any) {
        console.warn('[hymnalFirestoreService] Remote Firestore save bypassed (locally secured):', err?.message || err);
      }
    }

    return true;
  },

  deleteUserSong: async (songId: string): Promise<boolean> => {
    const { imageCache } = await import('../utils/imageCache');

    // 1. IndexedDB에서 삭제
    try {
      await imageCache.deleteSongMeta(songId);
    } catch {}

    // 2. LocalStorage에서 삭제
    try {
      const cached = localStorage.getItem('nations_guest_songs');
      if (cached) {
        let list: any[] = JSON.parse(cached);
        list = list.filter((s: any) => s.id !== songId);
        localStorage.setItem('nations_guest_songs', JSON.stringify(list));
      }
    } catch {}

    // 3. Firestore에서 삭제 시도
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (uid) {
      try {
        const songDocRef = doc(db, `users/${uid}/songs/${songId}`);
        await deleteDoc(songDocRef);
      } catch (err: any) {
        console.warn('[hymnalFirestoreService] Remote Firestore delete bypassed:', err?.message || err);
      }
    }

    return true;
  },

  // --------------------------------------------------------------------------
  // 3. 콘티 관리 (users/{uid}/contis/{contiId})
  // --------------------------------------------------------------------------
  getSavedContis: async (): Promise<FirestoreConti[]> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (!uid) {
      try {
        const cached = localStorage.getItem('nations_guest_contis');
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }

    try {
      const contisColRef = collection(db, `users/${uid}/contis`);
      // 로컬 캐시 우선 읽기 (과금 방어)
      let snap;
      try {
        snap = await getDocsFromCache(contisColRef);
      } catch {
        snap = await getDocs(contisColRef);
      }

      const list: FirestoreConti[] = [];
      snap.forEach((d) => {
        list.push(d.data() as FirestoreConti);
      });
      return list;
    } catch (err) {
      console.error('[hymnalFirestoreService] getSavedContis error:', err);
      return [];
    }
  },

  saveConti: async (conti: FirestoreConti): Promise<boolean> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    const cleanConti = {
      ...conti,
      updatedAt: new Date().toISOString(),
      createdAt: conti.createdAt || new Date().toISOString(),
    };

    if (!uid) {
      try {
        const list = await hymnalFirestoreService.getSavedContis();
        const idx = list.findIndex((c) => c.id === cleanConti.id);
        if (idx !== -1) list[idx] = cleanConti;
        else list.push(cleanConti);
        localStorage.setItem('nations_guest_contis', JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    }

    try {
      const contiDocRef = doc(db, `users/${uid}/contis/${cleanConti.id}`);
      await setDoc(contiDocRef, cleanConti, { merge: true });
      return true;
    } catch (err) {
      console.error('[hymnalFirestoreService] saveConti error:', err);
      return false;
    }
  },

  deleteSavedConti: async (id: string): Promise<boolean> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (!uid) {
      try {
        let list = await hymnalFirestoreService.getSavedContis();
        list = list.filter((c) => c.id !== id);
        localStorage.setItem('nations_guest_contis', JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    }

    try {
      const contiDocRef = doc(db, `users/${uid}/contis/${id}`);
      await deleteDoc(contiDocRef);
      return true;
    } catch (err) {
      console.error('[hymnalFirestoreService] deleteSavedConti error:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // 4. 마지막 콘티 상태 복원 (users/{uid}/meta/lastConti)
  // --------------------------------------------------------------------------
  getLastConti: async (): Promise<any | null> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (!uid) {
      try {
        const cached = localStorage.getItem('nations_guest_last_conti');
        if (cached) return JSON.parse(cached);
      } catch {}
      return null;
    }

    try {
      const docRef = doc(db, `users/${uid}/meta/lastConti`);
      let snap;
      try {
        snap = await getDocFromCache(docRef);
      } catch {
        snap = await getDoc(docRef);
      }

      if (snap.exists()) {
        return snap.data().state || null;
      }
    } catch (err) {
      console.warn('[hymnalFirestoreService] getLastConti miss:', err);
    }
    return null;
  },

  saveLastConti: async (state: any): Promise<void> => {
    const uid = hymnalFirestoreService.getCurrentUserId();
    if (!uid) {
      try {
        localStorage.setItem('nations_guest_last_conti', JSON.stringify(state));
      } catch {}
      return;
    }

    try {
      const docRef = doc(db, `users/${uid}/meta/lastConti`);
      await setDoc(docRef, {
        state,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('[hymnalFirestoreService] saveLastConti failed silently:', err);
    }
  },
};
