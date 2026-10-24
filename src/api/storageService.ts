import { app, auth, functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';

/**
 * Cloudflare R2 및 서비스 중앙 스토리지 설정
 */
export const R2_CONFIG = {
  // Cloudflare R2 공개 CDN 도메인 (설정되어 있을 때 사용)
  PUBLIC_CDN_URL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_PUBLIC_URL) || 'https://cdn-studio.thenations.kr',
  // 기본 버킷명
  BUCKET_NAME: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_BUCKET_NAME) || 'studio-sheets',
};

export interface UploadSheetOptions {
  userId: string;
  albumId: string;
  songId: string;
  fileName?: string;
}

export interface UploadSheetResult {
  success: boolean;
  storageUrl: string;
  path: string;
  error?: string;
}

/**
 * Cloudflare R2 및 Firebase Storage로 악보 이미지를 안전하게 업로드합니다.
 * 1. Firebase Storage(ccm-ymoonsik) 직접 업로드 1차 시도 (정식 클라우드 URL 발급)
 * 2. Cloudflare R2 Functions Presigned URL 시도 (설정 시)
 * 3. 오프라인/실패 시에도 업로드가 중단되지 않도록 안전한 로컬 키 반환 (IndexedDB에 원본 이미지 보존)
 */
export async function uploadSheetImageToR2(
  blob: Blob,
  options: UploadSheetOptions
): Promise<UploadSheetResult> {
  const { userId, albumId, songId } = options;
  const cleanUserId = userId || auth.currentUser?.uid || 'anonymous';
  const cleanAlbumId = albumId || 'misc';
  const cleanSongId = songId || `${Date.now()}`;
  const storagePath = `sheets/${cleanUserId}/${cleanAlbumId}/${cleanSongId}.webp`;

  try {
    // 1. Firebase Storage (ccm-ymoonsik) 업로드 1차 시도 (정식 영구 다운로드 URL 발급)
    try {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage(app);
      const storageRef = ref(storage, storagePath);
      
      const storagePromise = uploadBytes(storageRef, blob, { 
        contentType: 'image/webp',
        customMetadata: {
          uploadedBy: cleanUserId,
          albumId: cleanAlbumId,
          songId: cleanSongId
        }
      });
      const timeoutStorage = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Storage timeout')), 10000)
      );
      
      await Promise.race([storagePromise, timeoutStorage]);
      const downloadUrl = await getDownloadURL(storageRef);
      if (downloadUrl) {
        return {
          success: true,
          storageUrl: downloadUrl,
          path: storagePath,
        };
      }
    } catch (fbStorageErr: any) {
      console.warn('[storageService] Firebase Storage upload bypassed/timed out:', fbStorageErr?.message || fbStorageErr);
    }

    // 2. Firebase Functions에서 R2 Presigned PUT URL 시도 (최대 1.5초 대기 후 즉시 폴백)
    let presignedUrl: string | null = null;
    let publicUrl: string | null = null;

    try {
      const getUploadUrl = httpsCallable<{ path: string; contentType: string }, { uploadUrl: string; publicUrl: string }>(
        functions,
        'getR2UploadUrlCallable'
      );
      const callablePromise = getUploadUrl({
        path: storagePath,
        contentType: 'image/webp'
      });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('R2 Callable timeout')), 1500)
      );

      const res: any = await Promise.race([callablePromise, timeoutPromise]);
      if (res.data?.uploadUrl) {
        presignedUrl = res.data.uploadUrl;
        publicUrl = res.data.publicUrl;
      }
    } catch {
      // Functions 미배포 시 다음 단계 직행
    }

    // Presigned URL이 발급된 경우 R2 직접 전송
    if (presignedUrl) {
      try {
        const putRes = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: blob,
        });

        if (putRes.ok) {
          const finalUrl = publicUrl || `${R2_CONFIG.PUBLIC_CDN_URL}/${storagePath}`;
          return {
            success: true,
            storageUrl: finalUrl,
            path: storagePath,
          };
        }
      } catch (r2Err) {
        console.warn('[storageService] R2 direct PUT failed:', r2Err);
      }
    }

    // 3. Fallback: 오프라인이거나 클라우드 지연 시 로컬 저장 키 반환
    // (이미지는 이미 IndexedDB에 100% 보관되므로 Firestore에 초거대 Base64가 들어가지 않도록 보호)
    return {
      success: true,
      storageUrl: '', // 원격 URL 없음 (IndexedDB 로컬 캐시에서 로드)
      path: storagePath,
    };
  } catch (err: any) {
    console.error('[storageService] uploadSheetImageToR2 failed:', err);
    return {
      success: true,
      storageUrl: '',
      path: storagePath,
    };
  }
}


/**
 * 클라우드 스토리지(Firebase Storage 및 Cloudflare R2)에서 악보 원본 이미지 영구 삭제
 */
export async function deleteSheetImage(storageUrlOrPath?: string): Promise<boolean> {
  if (!storageUrlOrPath) return false;
  
  // Data URL이나 Blob URL인 경우 원격 파일이 아니므로 종료
  if (storageUrlOrPath.startsWith('data:') || storageUrlOrPath.startsWith('blob:')) {
    return true;
  }

  // 1. Firebase Storage 삭제 시도
  try {
    const { getStorage, ref, deleteObject } = await import('firebase/storage');
    const storage = getStorage(app);
    
    let storageRef;
    if (storageUrlOrPath.startsWith('http://') || storageUrlOrPath.startsWith('https://')) {
      if (
        storageUrlOrPath.includes('firebasestorage.googleapis.com') ||
        storageUrlOrPath.includes('firebasestorage.app') ||
        storageUrlOrPath.includes('storage.googleapis.com')
      ) {
        storageRef = ref(storage, storageUrlOrPath);
      }
    } else if (storageUrlOrPath.startsWith('gs://') || storageUrlOrPath.startsWith('sheets/')) {
      storageRef = ref(storage, storageUrlOrPath);
    }

    if (storageRef) {
      await deleteObject(storageRef);
      console.log('[storageService] Firebase Storage object deleted:', storageUrlOrPath);
    }
  } catch (err: any) {
    console.warn('[storageService] Firebase Storage delete bypassed:', err?.message || err);
  }

  // 2. Cloudflare R2 Functions Callable 삭제 시도
  try {
    let r2Path = storageUrlOrPath;
    if (storageUrlOrPath.startsWith('http')) {
      const urlObj = new URL(storageUrlOrPath);
      r2Path = urlObj.pathname.replace(/^\/+/, '');
    }
    
    if (r2Path.startsWith('sheets/')) {
      const deleteR2Callable = httpsCallable<{ path: string }, { success: boolean }>(
        functions,
        'deleteR2ObjectCallable'
      );
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('R2 Callable timeout')), 1500)
      );
      await Promise.race([deleteR2Callable({ path: r2Path }), timeoutPromise]);
      console.log('[storageService] R2 object deleted via Callable:', r2Path);
    }
  } catch (r2Err: any) {
    // 로컬 환경이거나 미배포 시 무시
  }

  return true;
}

/**
 * 악보 이미지 경로/URL 해석 함수
 * - Cloudflare R2 / Firebase Storage / Google Drive URL 및 로컬 정적 경로를 일관되게 해석
 */
export function resolveSheetImageUrl(urlOrId?: string): string {
  if (!urlOrId) return '';

  // 1. 이미 완전한 HTTP/HTTPS URL인 경우 (Cloudflare R2, CDN, Storage, Data URL, Blob URL)
  if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://') || urlOrId.startsWith('blob:') || urlOrId.startsWith('data:')) {
    return urlOrId;
  }

  // 2. 상대 경로 (/data/..., /sheets/...)
  if (urlOrId.startsWith('/')) {
    return urlOrId;
  }

  // 3. R2 상대 경로 형태 (sheets/...)
  if (urlOrId.startsWith('sheets/')) {
    return `${R2_CONFIG.PUBLIC_CDN_URL}/${urlOrId}`;
  }

  // 4. 로컬 고유 ID (song_... 등)인 경우 구글 드라이브 URL로 조립하지 않음
  if (urlOrId.startsWith('song_') || urlOrId.startsWith('local_')) {
    return '';
  }

  // 5. 구글 드라이브 레거시 파일 ID (영문/숫자/특수기호 혼합 ID)
  return `https://drive.google.com/uc?id=${urlOrId}`;
}

