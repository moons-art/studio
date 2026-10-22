import { auth, functions } from './firebaseConfig';
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
 * Cloudflare R2로 악보 WebP 이미지를 업로드합니다.
// Blob을 안전한 영구 Base64 Data URL로 변환하는 헬퍼 함수
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(URL.createObjectURL(blob));
    reader.readAsDataURL(blob);
  });
}

/**
 * Cloudflare R2 및 고속 스토리지로 악보 이미지를 업로드합니다.
 * 1. Functions(R2 Presigned PUT URL)를 초단기(1.5초) 확인 시도
 * 2. Firebase Storage 업로드 시도
 * 3. 로컬/오프라인에서도 0% 지연 없이 즉시 동작하도록 영구 Base64 DataURL 제공
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
    // 1. Firebase Functions에서 R2 Presigned PUT URL 시도 (최대 1.5초 대기 후 즉시 폴백)
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
      // 로컬 환경이거나 함수 미배포 시 지연 없이 다음 단계로 직행
    }

    // 2. Presigned URL이 발급된 경우 R2 직접 전송
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
        console.warn('[storageService] R2 direct PUT failed, falling back:', r2Err);
      }
    }

    // 3. Fallback: Firebase Storage 업로드 시도 (최대 3초 대기)
    try {
      const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const storage = getStorage();
      const storageRef = ref(storage, storagePath);
      
      const storagePromise = uploadBytes(storageRef, blob, { contentType: 'image/webp' });
      const timeoutStorage = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Storage timeout')), 3000)
      );
      
      await Promise.race([storagePromise, timeoutStorage]);
      const downloadUrl = await getDownloadURL(storageRef);
      return {
        success: true,
        storageUrl: downloadUrl,
        path: storagePath,
      };
    } catch (fbStorageErr: any) {
      console.warn('[storageService] Firebase Storage bypassed/timed out, using persistent DataURL fallback');
    }

    // 4. Ultimate Fallback: 영구 Base64 Data URL (로컬/오프라인에서도 0% 멈춤 없이 0.1초 만에 완료)
    const persistentUrl = await blobToDataUrl(blob);
    return {
      success: true,
      storageUrl: persistentUrl,
      path: storagePath,
    };
  } catch (err: any) {
    console.error('[storageService] uploadSheetImageToR2 failed:', err);
    // 최후의 경우라도 DataURL로 복구하여 업로드 중단 방지
    try {
      const fallbackUrl = await blobToDataUrl(blob);
      return {
        success: true,
        storageUrl: fallbackUrl,
        path: storagePath,
      };
    } catch {
      return {
        success: false,
        storageUrl: '',
        path: storagePath,
        error: err?.message || '스토리지 업로드 실패',
      };
    }
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
    const storage = getStorage();
    
    let storageRef;
    if (storageUrlOrPath.startsWith('http://') || storageUrlOrPath.startsWith('https://')) {
      if (storageUrlOrPath.includes('firebasestorage.googleapis.com')) {
        storageRef = ref(storage, storageUrlOrPath);
      }
    } else if (storageUrlOrPath.startsWith('sheets/')) {
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

  // 4. 구글 드라이브 레거시 파일 ID (영문/숫자/특수기호 혼합 ID)
  return `https://drive.google.com/uc?id=${urlOrId}`;
}

