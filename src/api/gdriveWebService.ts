// src/api/gdriveWebService.ts
import { imageCache } from '../utils/imageCache';
import { auth, googleProvider } from './firebaseConfig';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

const GAPI_CLIENT_ID = '21582961373-3tb1ja43c31vsfpjepnvthiq5qle8krp.apps.googleusercontent.com';

// ✅ 로컬 개발 전용 구글 계정 우회 플래그 (배포 시 false로 변경)
export const IS_LOCAL_DEV = false;

// 구글 API 초기화 상태
let isGapiLoaded = false;
let isGsiLoaded = false;
let tokenClient: any = null;
// OAuth 토큰 캐시 및 로컬 스토리지 자동 세션 복원
let accessToken: string | null = (() => {
  try {
    const cachedToken = localStorage.getItem('gdrive_token');
    const cachedExpiresAt = localStorage.getItem('gdrive_token_expires_at');
    if (cachedToken && cachedExpiresAt) {
      const expiresAt = parseInt(cachedExpiresAt, 10);
      if (expiresAt > Date.now()) {
        console.log('[gdriveWebService] Found valid cached token. Restoring session.');
        return cachedToken;
      }
    }
  } catch (e) {}
  return null;
})();

// gapi.client에 토큰을 주입하는 헬퍼 (gapi 로드 후 호출해야 함)
const applyTokenToGapiClient = (token: string) => {
  try {
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
      console.log('[gdriveWebService] gapi.client token applied.');
    }
  } catch (e) {
    console.warn('[gdriveWebService] Failed to apply token to gapi.client:', e);
  }
};

// 토큰 401/403 유효성 상실 시 자가 치유(Self-Healing) 핸들러
const handleAuthExpired = () => {
  console.warn('[gdriveWebService] Auth token expired or invalid (401/403). Clearing cache.');
  accessToken = null;
  try {
    localStorage.removeItem('gdrive_token');
    localStorage.removeItem('gdrive_token_expires_at');
  } catch (e) {}
  
  // 사용자 제스처 없는 강제 팝업 요청을 제거하여 브라우저 팝업 차단(Popup Blocker)을 완벽 차단합니다.
  // 대신 사용자가 수동 로그인 버튼을 누르게 유도하여 웹 표준 보안을 확보합니다.
};

// 401 에러 인터셉트 및 Bearer 토큰 자동 주입 기능이 내장된 gdriveFetch
const gdriveFetch = async (url: string, options: RequestInit = {}, retries = 2): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  const mergedOptions: RequestInit = {
    ...options,
    headers
  };

  let response = await fetch(url, mergedOptions);
  
  // 403 Rate Limit 발생 시 지수 백오프 재시도 (최대 2회)
  if (response.status === 403 && retries > 0) {
    console.warn(`[gdriveWebService] 403 Rate Limit hit for ${url}. Retrying...`);
    await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
    return gdriveFetch(url, options, retries - 1);
  }

  if (response.status === 401) {
    handleAuthExpired();
    throw new Error('Unauthorized or expired token');
  }
  return response;
};

export interface GoogleUserProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export const fetchUserProfile = async (token: string): Promise<GoogleUserProfile | null> => {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (!data.id && !data.sub) return null;
    const profile = {
      id: data.id || data.sub,
      name: data.name || '',
      email: data.email || '',
      picture: data.picture || ''
    };
    localStorage.setItem('offline_user_profile', JSON.stringify(profile));
    return profile;
  } catch {
    const cached = localStorage.getItem('offline_user_profile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  }
};


export const initGoogleApi = (onInit: () => void) => {
  if (IS_LOCAL_DEV) {
    console.log('[gdriveWebService] 🛠️ Local dev mode: Bypassing Google API init & Auth');
    isGapiLoaded = true;
    isGsiLoaded = true;
    accessToken = 'mock_local_token_123';
    setTimeout(() => {
      window.dispatchEvent(new Event('gdrive_authenticated'));
      onInit();
    }, 300);
    return;
  }

  let hasError = false;

  const handleError = (error: any) => {
    console.error('[Google API Init Error]', error);
    if (!hasError) {
      hasError = true;
      const offlineProfile = localStorage.getItem('offline_user_profile');
      if (offlineProfile) {
        console.log('[gdriveWebService] Offline mode detected, using cached profile.');
        accessToken = 'offline_token'; // 오프라인 식별용 더미 토큰
        setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 300);
      } else {
        // 에러 메시지 노출 후 로딩 해제
        alert('구글 API 초기화 중 오류가 발생했습니다. 구글 드라이브 동기화 기능이 제한될 수 있습니다. \n에러: ' + (error?.message || error || '알 수 없음'));
      }
      onInit(); // 무한 로딩 상태를 풀기 위해 콜백 강제 실행
    }
  };

  // 세션 복원 및 백그라운드 갱신 자동화 (무중단 영구 세션화)
  const restoreOrRefreshSession = () => {
    try {
      const cachedToken = localStorage.getItem('gdrive_token');
      const cachedExpiresAt = localStorage.getItem('gdrive_token_expires_at');
      
      if (cachedToken && cachedExpiresAt) {
        const expiresAt = parseInt(cachedExpiresAt, 10);
        if (expiresAt > Date.now()) {
          // 1. 토큰이 유효한 경우 즉시 복원 및 gapi.client에 주입
          accessToken = cachedToken;
          applyTokenToGapiClient(cachedToken); // ✅ 핵심: gapi.client에 토큰 주입
          console.log('[gdriveWebService] Restored valid cached token and applied to gapi.client.');
          setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 300);
          return;
        } else {
          // 만료된 토큰 갱신 시도 (Silent Refresh)
          console.log('[gdriveWebService] Cached token expired. Attempting silent refresh...');
          if (tokenClient) {
            try {
              tokenClient.requestAccessToken({ prompt: 'none' });
              return; // 콜백에서 완료됨
            } catch (e) {
              console.warn('[gdriveWebService] Silent refresh failed', e);
            }
          }
          // 실패 시 삭제
          localStorage.removeItem('gdrive_token');
          localStorage.removeItem('gdrive_token_expires_at');
          accessToken = null;
          console.log('[gdriveWebService] Cached token cleared.');
        }
      }
      
      // 2. 캐시된 토큰이 없거나 만료된 경우 조용히 대기
      console.log('[gdriveWebService] No valid cached token. Awaiting user click to authenticate.');
    } catch (e) {
      console.error('[gdriveWebService] Silent refresh error:', e);
    }
  };

  // 1. Google API (gapi) 로드
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onerror = () => handleError('Google API 스크립트 로드 실패 (네트워크 또는 보안 설정 차단)');
  gapiScript.onload = () => {
    try {
      window.gapi.load('client', () => {
        // 백그라운드에서 초기화 진행 (UI 블로킹 방지)
        window.gapi.client.init({
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        }).then(() => {
          // drive v3 클라이언트를 명시적 강제 로드
          return window.gapi.client.load('drive', 'v3');
        }).catch(err => {
          console.warn('[gdriveWebService] Background gapi init warning:', err);
        });

        // 즉시 로드 완료 처리하여 로그인 버튼을 빨리 활성화함
        isGapiLoaded = true;
        if (isGsiLoaded && !hasError) {
          restoreOrRefreshSession(); // ✅ 토큰을 gapi.client에 먼저 주입
          onInit();                  // ✅ 그 다음 Provider 초기화
        }
      });
    } catch (loadErr) {
      handleError(loadErr);
    }
  };
  document.body.appendChild(gapiScript);

  // 2. Google Identity Services (GSI) 로드
  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  gsiScript.onerror = () => handleError('Google GSI 스크립트 로드 실패 (네트워크 또는 보안 설정 차단)');
  gsiScript.onload = () => {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GAPI_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: (response: any) => {
          if (response.error !== undefined) {
            console.error('GSI auth error:', response);
            return;
          }
          accessToken = response.access_token;
          applyTokenToGapiClient(response.access_token); // ✅ 핵심: 신규 토큰도 gapi.client에 즉시 주입

          // 로컬 스토리지에 토큰 및 만료 절대시간(1시간) 저장
          try {
            const expiresAt = Date.now() + (response.expires_in * 1000);
            localStorage.setItem('gdrive_token', response.access_token);
            localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
          } catch (e) {}

          console.log('[gdriveWebService] Successfully authenticated with Google Drive.');
          window.dispatchEvent(new Event('gdrive_authenticated'));
        },
      });
      isGsiLoaded = true;
      if (isGapiLoaded && !hasError) {
        restoreOrRefreshSession(); // ✅ 토큰을 gapi.client에 먼저 주입
        onInit();                  // ✅ 그 다음 Provider 초기화
      }
    } catch (gsiErr) {
      handleError(gsiErr);
    }
  };
  document.body.appendChild(gsiScript);
};

// 구글 인증 성공 시 백그라운드에서 Nations Solution 최상위 및 앱별 기본 폴더(Studio, Bible) 확인 및 생성
if (typeof window !== 'undefined') {
  window.addEventListener('gdrive_authenticated', () => {
    setTimeout(() => {
      gdriveWebService.ensureNationsFolders().catch(() => {});
    }, 1000);
  });
}

export const gdriveWebService = {
  // 토큰 반환
  getAccessToken: () => accessToken,

  // 로그인 요청
  login: async (): Promise<boolean> => {
    if (IS_LOCAL_DEV) {
      console.log('[gdriveWebService] 🛠️ Local dev mode: Bypassing login popup');
      accessToken = 'mock_local_token_123';
      setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 100);
      return true;
    }

    // 이미 복원된 유효 토큰 세션이 있다면 구글 팝업 생략하고 성공 처리
    if (accessToken && accessToken !== 'offline_token') {
      return true;
    }

    try {
      // 1. 구글 드라이브 및 프로필 스코프 지정
      googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
      googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
      googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
      googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');

      // 2. Firebase Auth 팝업 로그인 실행 (origin_mismatch 원천 차단)
      const userCredential = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(userCredential);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('구글 드라이브 연동을 위한 액세스 토큰을 획득하지 못했습니다.');
      }

      accessToken = token;
      applyTokenToGapiClient(token);

      // 토큰 및 만료 절대시간(1시간) 로컬스토리지 저장
      try {
        const expiresAt = Date.now() + 3600 * 1000;
        localStorage.setItem('gdrive_token', token);
        localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
      } catch (e) {}

      // 사용자 프로필 로컬 캐싱
      try {
        const profile: GoogleUserProfile = {
          id: userCredential.user.uid,
          name: userCredential.user.displayName || '',
          email: userCredential.user.email || '',
          picture: userCredential.user.photoURL || ''
        };
        localStorage.setItem('offline_user_profile', JSON.stringify(profile));
      } catch (e) {}

      console.log('[gdriveWebService] Successfully authenticated with Google Drive via Firebase Auth popup.');
      window.dispatchEvent(new Event('gdrive_authenticated'));
      return true;
    } catch (err: any) {
      console.warn('[gdriveWebService] Firebase signInWithPopup error:', err);
      // 사용자가 팝업을 직접 닫은 경우 조용히 취소
      if (err?.code === 'auth/popup-closed-by-user') {
        return false;
      }

      // 만약 GSI tokenClient fallback이 가능하면 시도
      if (tokenClient) {
        console.log('[gdriveWebService] Attempting fallback to GSI tokenClient...');
        return new Promise<boolean>((resolve) => {
          tokenClient.callback = (response: any) => {
            if (response.error !== undefined) {
              console.error('[gdriveWebService] GSI auth error callback:', response.error);
              alert('구글 인증 실패: ' + response.error);
              resolve(false);
              return;
            }

            accessToken = response.access_token;
            applyTokenToGapiClient(response.access_token);
            try {
              const expiresAt = Date.now() + (response.expires_in * 1000);
              localStorage.setItem('gdrive_token', response.access_token);
              localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
            } catch (e) {}

            console.log('[gdriveWebService] Successfully authenticated with Google Drive via fallback');
            window.dispatchEvent(new Event('gdrive_authenticated'));
            resolve(true);
          };

          try {
            tokenClient.requestAccessToken();
          } catch (e) {
            resolve(false);
          }
        });
      }

      alert('구글 로그인 오류: ' + (err?.message || err));
      return false;
    }
  },

  // 로그아웃 요청
  logout: async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    accessToken = null;
    try {
      localStorage.removeItem('gdrive_token');
      localStorage.removeItem('gdrive_token_expires_at');
      localStorage.removeItem('offline_user_profile');
    } catch (e) {}
  },

  // -----------------------------------------
  // Nations Solution Master Hierarchy & Folder Methods
  // -----------------------------------------
  
  // 폴더 ID 인메모리 캐시 (불필요한 중복 검색 방지)
  _folderIdCache: new Map<string, string>(),

  // 진행 중인 폴더 생성/조회 작업 비동기 Promise 맵 (동시 호출 락 - Mutex / 레이스 컨디션 원천 차단)
  _folderPromiseMap: new Map<string, Promise<string>>(),

  // 특정 폴더의 모든 자식 파일 및 폴더를 1000개 제한 없이 페이지네이션 순회하여 전체 조회
  _fetchAllFolderChildren: async (folderId: string): Promise<any[]> => {
    if (!accessToken) return [];
    const allFiles: any[] = [];
    let pageToken: string | null = null;
    do {
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&spaces=drive&fields=nextPageToken,files(id,name,mimeType,parents)&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }
      const res = await gdriveFetch(url);
      if (!res.ok) break;
      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        allFiles.push(...data.files);
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return allFiles;
  },

  // 특정 폴더(duplicateFolderId)의 모든 내용물을 masterFolderId로 완벽 통합(Merge) 후 중복 폴더는 휴지통으로 이동
  _mergeFolderContents: async (masterFolderId: string, duplicateFolderId: string): Promise<number> => {
    if (!accessToken || masterFolderId === duplicateFolderId) return 0;
    let movedCount = 0;
    try {
      // 1. 마스터 폴더 내의 기존 항목들 목록 전체 조회
      const masterItems = await gdriveWebService._fetchAllFolderChildren(masterFolderId);
      const masterItemMap = new Map<string, any>();
      masterItems.forEach((item: any) => masterItemMap.set(item.name, item));

      // 2. 소스/중복 폴더 내의 모든 항목 목록 전체 조회 (페이지네이션 포함)
      const dupItems = await gdriveWebService._fetchAllFolderChildren(duplicateFolderId);

      // 3. 각 항목 처리
      for (const item of dupItems) {
        const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
        const existingMasterItem = masterItemMap.get(item.name);

        if (isFolder && existingMasterItem && existingMasterItem.mimeType === 'application/vnd.google-apps.folder') {
          // 동일 이름의 폴더가 이미 마스터 안에 있다면 -> 재귀적으로 그 하위 내용물을 합침!
          const childMoved = await gdriveWebService._mergeFolderContents(existingMasterItem.id, item.id);
          movedCount += childMoved;
        } else {
          // 파일이거나 마스터에 없는 폴더인 경우 -> 마스터 폴더로 이동 (부모 변경)
          const moveRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${masterFolderId}&removeParents=${duplicateFolderId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (moveRes.ok) {
            movedCount++;
            console.log(`[gdriveWebService] Moved child item '${item.name}' to master folder ${masterFolderId}`);
          }
        }
      }

      // 4. 내용물이 완전히 비워진 중복/기존 폴더는 안전하게 휴지통으로 이동
      await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${duplicateFolderId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });
      console.log(`[gdriveWebService] Successfully merged (${movedCount} items) and trashed folder ${duplicateFolderId} into ${masterFolderId}`);
      return movedCount;
    } catch (e) {
      console.warn(`[gdriveWebService] Error in _mergeFolderContents:`, e);
      return movedCount;
    }
  },

  // 전체 드라이브 계층 구조 순회하며 모든 중복 폴더(Nations Solution, Nations Studio, Nations Bible, Albums 등) 자동 정리
  cleanAllDuplicateFolders: async (): Promise<void> => {
    if (!accessToken || accessToken === 'offline_token') return;
    try {
      console.log('[gdriveWebService] Scanning for duplicate folders to consolidate...');
      // 1. 루트의 'Nations Solution' 중복 정리
      const qRoot = encodeURIComponent(`name='Nations Solution' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const resRoot = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}&spaces=drive&fields=files(id,name,createdTime)&orderBy=createdTime`);
      if (resRoot.ok) {
        const solutionFolders = (await resRoot.json()).files || [];
        if (solutionFolders.length > 1) {
          const masterSolution = solutionFolders[0];
          for (let i = 1; i < solutionFolders.length; i++) {
            await gdriveWebService._mergeFolderContents(masterSolution.id, solutionFolders[i].id);
          }
        }
      }

      // 마스터 Nations Solution ID 획득
      const solutionId = await gdriveWebService.getNationsRootFolderId();

      // 2. Nations Solution 내부의 'Nations Studio' 및 'Nations Bible' 중복 정리
      for (const subName of ['Nations Studio', 'Nations Bible']) {
        const qSub = encodeURIComponent(`name='${subName}' and '${solutionId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const resSub = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qSub}&spaces=drive&fields=files(id,name,createdTime)&orderBy=createdTime`);
        if (resSub.ok) {
          const subFolders = (await resSub.json()).files || [];
          if (subFolders.length > 1) {
            const masterSub = subFolders[0];
            for (let i = 1; i < subFolders.length; i++) {
              await gdriveWebService._mergeFolderContents(masterSub.id, subFolders[i].id);
            }
          }
        }
      }

      // 3. Nations Studio 내부의 'Albums' 및 'PDF_Library' 중복 정리
      const studioId = await gdriveWebService.getAppFolderId('Nations Studio');
      for (const studioSub of ['Albums', 'PDF_Library']) {
        const qStd = encodeURIComponent(`name='${studioSub}' and '${studioId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const resStd = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qStd}&spaces=drive&fields=files(id,name,createdTime)&orderBy=createdTime`);
        if (resStd.ok) {
          const stdFolders = (await resStd.json()).files || [];
          if (stdFolders.length > 1) {
            const masterStd = stdFolders[0];
            for (let i = 1; i < stdFolders.length; i++) {
              await gdriveWebService._mergeFolderContents(masterStd.id, stdFolders[i].id);
            }
          }
        }
      }

      // 4. Nations Studio 직속의 비정상 항목 (New Folder, Drive ID 형태의 잘못된 파일 등) 자동 정리
      const studioItems = await gdriveWebService._fetchAllFolderChildren(studioId);
      for (const item of studioItems) {
        const isDriveId = /^[a-zA-Z0-9_-]{28,45}$/.test(item.name);
        const isGenericName = item.name.toLowerCase() === 'new folder' || item.name.toLowerCase() === '새 폴더' || item.name.toLowerCase() === 'untitled';

        if (isGenericName || isDriveId) {
          console.log(`[gdriveWebService] Trashing invalid item in Nations Studio: '${item.name}' (${item.id})`);
          await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true })
          }).catch(console.warn);
        }
      }

      // 5. Albums 폴더 내부의 비정상/레거시 항목 ('기타악보', '13m2eb...', 'New Folder' 등) 자동 병합 및 정리
      const albumsFolderId = await gdriveWebService.getStudioSubFolderId('Albums');
      const miscFolderId = await gdriveWebService.getOrCreateFolder('미분류', albumsFolderId);
      const albumItems = await gdriveWebService._fetchAllFolderChildren(albumsFolderId);

      for (const item of albumItems) {
        const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
        const isDriveId = /^[a-zA-Z0-9_-]{28,45}$/.test(item.name);
        const isGenericName = item.name.toLowerCase() === 'new folder' || item.name.toLowerCase() === '새 폴더' || item.name.toLowerCase() === 'untitled';
        const isLegacyMisc = item.name === '기타악보' || item.name === '기타앨범' || item.name === 'CEUM_ccm_data';

        if (isLegacyMisc || (isFolder && isDriveId) || (isFolder && isGenericName)) {
          console.log(`[gdriveWebService] Consolidating and trashing invalid/legacy album folder: '${item.name}' (${item.id}) -> 미분류`);
          await gdriveWebService._mergeFolderContents(miscFolderId, item.id);
        }
      }

      // 캐시 초기화
      gdriveWebService._folderIdCache.clear();
      console.log('[gdriveWebService] All duplicate and invalid folders in hierarchy cleaned and unified.');
    } catch (e) {
      console.warn('[gdriveWebService] Error in cleanAllDuplicateFolders:', e);
    }
  },

  // 이름 및 부모 폴더 ID로 폴더를 조회하여 ID 반환 (없으면 null 반환)
  getFolderId: async (folderName: string, parentFolderId?: string): Promise<string | null> => {
    if (!accessToken) return null;
    const cacheKey = `${parentFolderId || 'root'}_${folderName}`;
    if (gdriveWebService._folderIdCache.has(cacheKey)) {
      return gdriveWebService._folderIdCache.get(cacheKey)!;
    }

    try {
      let queryStr = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      if (parentFolderId) {
        queryStr += ` and '${parentFolderId}' in parents`;
      }
      const q = encodeURIComponent(queryStr);
      const res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,createdTime)&orderBy=createdTime`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const files = data.files;
      if (files && files.length > 0) {
        // 중복 폴더가 발견되었을 경우 자가 치유(Merge & Trash)
        if (files.length > 1) {
          console.warn(`[gdriveWebService] Multiple duplicate folders found for '${folderName}' (${files.length} found). Auto-merging...`);
          const masterId = files[0].id;
          for (let i = 1; i < files.length; i++) {
            gdriveWebService._mergeFolderContents(masterId, files[i].id).catch(console.error);
          }
        }
        const id = files[0].id;
        gdriveWebService._folderIdCache.set(cacheKey, id);
        return id;
      }
      return null;
    } catch (err) {
      console.error(`[gdriveWebService] getFolderId failed for ${folderName}`, err);
      return null;
    }
  },

  // 이름과 부모 폴더로 폴더를 찾고, 없으면 생성 후 ID 반환 (Mutex / In-Flight Promise 락 적용)
  getOrCreateFolder: async (folderName: string, parentFolderId?: string): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    // 비정상/빈 폴더명 또는 Drive ID가 폴더명으로 넘어오는 오류 원천 차단 (New Folder 생성 방지)
    if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
      throw new Error('[gdriveWebService] getOrCreateFolder: folderName cannot be empty');
    }
    const cleanName = folderName.trim();
    if (cleanName.toLowerCase() === 'new folder' || cleanName.toLowerCase() === '새 폴더' || cleanName.toLowerCase() === 'untitled') {
      throw new Error(`[gdriveWebService] getOrCreateFolder: Rejected creating generic folder '${cleanName}'`);
    }
    if (/^[a-zA-Z0-9_-]{28,45}$/.test(cleanName)) {
      console.error(`[gdriveWebService] getOrCreateFolder: Rejected folderName resembling Drive ID: '${cleanName}'`);
      throw new Error(`[gdriveWebService] getOrCreateFolder: Invalid folderName '${cleanName}'`);
    }

    const cacheKey = `${parentFolderId || 'root'}_${cleanName}`;
    
    // 1. 이미 캐시된 폴더 ID가 있으면 즉시 반환
    if (gdriveWebService._folderIdCache.has(cacheKey)) {
      return gdriveWebService._folderIdCache.get(cacheKey)!;
    }

    // 2. 현재 동일한 폴더에 대한 검색/생성 작업이 진행 중이면 해당 Promise를 공유 대기 (Race Condition 차단)
    if (gdriveWebService._folderPromiseMap.has(cacheKey)) {
      return gdriveWebService._folderPromiseMap.get(cacheKey)!;
    }

    const taskPromise = (async () => {
      try {
        // 기존 폴더 검색
        const existingId = await gdriveWebService.getFolderId(folderName, parentFolderId);
        if (existingId) {
          gdriveWebService._folderIdCache.set(cacheKey, existingId);
          return existingId;
        }

        // 신규 폴더 생성
        const metadata: any = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        };
        if (parentFolderId) {
          metadata.parents = [parentFolderId];
        }

        const createRes = await gdriveFetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metadata)
        });

        if (!createRes.ok) throw new Error(`Failed to create folder ${folderName}`);
        const createdFolder = await createRes.json();
        const newId = createdFolder.id;
        gdriveWebService._folderIdCache.set(cacheKey, newId);
        return newId;
      } finally {
        gdriveWebService._folderPromiseMap.delete(cacheKey);
      }
    })();

    gdriveWebService._folderPromiseMap.set(cacheKey, taskPromise);
    return taskPromise;
  },

  // 1. 최상위 마스터 폴더 'Nations Solution'
  getNationsRootFolderId: async (): Promise<string> => {
    return gdriveWebService.getOrCreateFolder('Nations Solution');
  },

  // 2. 앱별 독립 폴더 (Nations Studio, Nations Bible, Nations Vote 등)
  getAppFolderId: async (appName: 'Nations Studio' | 'Nations Bible' | 'Nations Vote' | string): Promise<string> => {
    const rootId = await gdriveWebService.getNationsRootFolderId();
    return gdriveWebService.getOrCreateFolder(appName, rootId);
  },

  // 3. Nations Studio 내부 서브 폴더 (Albums, PDF_Library 등)
  getStudioSubFolderId: async (subFolderName: string): Promise<string> => {
    const studioId = await gdriveWebService.getAppFolderId('Nations Studio');
    return gdriveWebService.getOrCreateFolder(subFolderName, studioId);
  },

  // 4. 악보 앨범 폴더 (Nations Solution > Nations Studio > Albums > <albumName>)
  // * 신규 표준 경로를 최우선으로 생성/조회하고 레거시 폴더는 migrateCeumToNations를 통해 안전 이전
  getAlbumFolderId: async (albumName: string): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');

    // 신규 구조: Nations Studio > Albums > <albumName>
    const albumsParentId = await gdriveWebService.getStudioSubFolderId('Albums');
    const folderDisplay = (albumName === 'misc' || albumName === '기타앨범' || albumName === '기타악보' || albumName === '미분류') ? '미분류' : albumName;
    return gdriveWebService.getOrCreateFolder(folderDisplay, albumsParentId);
  },

  // 5. 기본 폴더 구조 일괄 확인 및 사전 자동 생성 (Nations Solution > Nations Studio, Nations Bible)
  _isEnsuringNationsFolders: false,
  ensureNationsFolders: async (): Promise<void> => {
    if (!accessToken || accessToken === 'offline_token') return;
    if (gdriveWebService._isEnsuringNationsFolders) return;
    gdriveWebService._isEnsuringNationsFolders = true;
    try {
      // 0. 기존 중복 폴더가 있다면 우선 일괄 병합 및 정리
      await gdriveWebService.cleanAllDuplicateFolders();

      // 1. 최상위 마스터 폴더 'Nations Solution' 단일 생성/확인
      const rootId = await gdriveWebService.getNationsRootFolderId();
      // 2. 하위 앱별 폴더 'Nations Studio' 및 'Nations Bible' 순차 생성 (동시성 겹침 방지)
      const studioId = await gdriveWebService.getAppFolderId('Nations Studio');
      await gdriveWebService.getAppFolderId('Nations Bible');
      // 3. 스튜디오 내부 서브폴더 'Albums' 및 'PDF_Library' 순차 생성
      await gdriveWebService.getStudioSubFolderId('Albums');
      await gdriveWebService.getStudioSubFolderId('PDF_Library');
      console.log('[gdriveWebService] Nations Solution & Nations Bible folder hierarchy verified/created.');
    } catch (e) {
      console.warn('[gdriveWebService] Error ensuring Nations folders:', e);
    } finally {
      gdriveWebService._isEnsuringNationsFolders = false;
    }
  },

  // 파일 다운로드 (JSON) - Nations Studio 폴더 우선 검색 및 루트 Fallback
  downloadJsonFile: async (fileName: string) => {
    const cacheKey = `gdrive_json_cache_${fileName}`;
    if (!accessToken || accessToken === 'offline_token') {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      throw new Error('Not authenticated and no cache');
    }
    
    try {
      // 1. Nations Studio 폴더 내부에서 파일 우선 검색
      let targetFileId: string | null = null;
      try {
        const studioId = await gdriveWebService.getAppFolderId('Nations Studio');
        const qStudio = encodeURIComponent(`name='${fileName}' and '${studioId}' in parents and trashed=false`);
        const resStudio = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qStudio}&spaces=drive&fields=files(id,name)`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (resStudio.ok) {
          const studioData = await resStudio.json();
          if (studioData.files && studioData.files.length > 0) {
            targetFileId = studioData.files[0].id;
          }
        }
      } catch (e) {
        console.warn('[gdriveWebService] Error searching in Nations Studio, will fallback to root', e);
      }

      // 2. 하위 호환 Fallback: 전체 드라이브(기존 루트)에서 검색
      if (!targetFileId) {
        const qRoot = encodeURIComponent(`name='${fileName}' and trashed=false`);
        const resRoot = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}&spaces=drive&fields=files(id,name)`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (resRoot.ok) {
          const rootData = await resRoot.json();
          if (rootData.files && rootData.files.length > 0) {
            targetFileId = rootData.files[0].id;
          }
        }
      }
      
      if (!targetFileId) {
        return null; // 파일 없음
      }
      
      // 3. 파일 내용 가져오기
      const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${targetFileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      
      if (!response.ok) throw new Error('Failed to download file');
      const data = await response.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch (err) {
      console.warn(`[gdriveWebService] Failed to download JSON ${fileName}, falling back to cache`, err);
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      throw err;
    }
  },

  // JSON 업로드 (multipart/related) - Nations Studio 폴더에 저장
  uploadJsonFile: async (fileName: string, data: any) => {
    if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
      throw new Error('[gdriveWebService] uploadJsonFile: fileName cannot be empty');
    }
    const cleanFileName = fileName.trim();
    if (/^[a-zA-Z0-9_-]{28,45}$/.test(cleanFileName)) {
      console.error(`[gdriveWebService] uploadJsonFile: Rejected fileName resembling Drive ID: '${cleanFileName}'`);
      throw new Error(`[gdriveWebService] uploadJsonFile: Invalid fileName '${cleanFileName}'`);
    }

    const cacheKey = `gdrive_json_cache_${cleanFileName}`;
    localStorage.setItem(cacheKey, JSON.stringify(data)); // 선제적 캐시 갱신
    if (!accessToken || accessToken === 'offline_token') {
      console.warn(`[gdriveWebService] Offline mode, saved ${cleanFileName} locally. Will sync later.`);
      return;
    }

    const studioFolderId = await gdriveWebService.getAppFolderId('Nations Studio');

    // 1. Nations Studio 내에 파일이 이미 있는지 검색 (또는 루트 파일)
    let existingFileId: string | null = null;
    const qStudio = encodeURIComponent(`name='${fileName}' and '${studioFolderId}' in parents and trashed=false`);
    const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qStudio}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }

    if (!existingFileId) {
      // 기존 루트 파일 검색 (하위 호환 갱신)
      const qRoot = encodeURIComponent(`name='${fileName}' and trashed=false`);
      const searchRootRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (searchRootRes.ok) {
        const rootData = await searchRootRes.json();
        if (rootData.files && rootData.files.length > 0) {
          existingFileId = rootData.files[0].id;
        }
      }
    }

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (existingFileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    const metadata: any = { name: fileName, mimeType: 'application/json' };
    if (!existingFileId) {
      metadata.parents = [studioFolderId]; // 새 파일은 무조건 Nations Studio 폴더 안에 생성
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) +
      close_delim;

    const uploadRes = await gdriveFetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Upload failed:', errText);
      throw new Error(`Upload failed: ${errText}`);
    }
    return uploadRes.json();
  },

  // -----------------------------------------
  // Bible Sync Methods (Nations Bible Folder)
  // -----------------------------------------
  listBibleFiles: async () => {
    if (!accessToken) throw new Error('Not authenticated');
    // 1. Nations Bible 폴더 우선
    const bibleFolderId = await gdriveWebService.getAppFolderId('Nations Bible');
    
    let q = encodeURIComponent(`'${bibleFolderId}' in parents and mimeType='text/plain' and trashed=false`);
    let res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) return data.files;
    }

    // 2. 하위 호환: 기존 CEUM_Bible_Data 폴더 폴백
    const legacyFolderId = await gdriveWebService.getFolderId('CEUM_Bible_Data');
    if (legacyFolderId) {
      q = encodeURIComponent(`'${legacyFolderId}' in parents and mimeType='text/plain' and trashed=false`);
      res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.files || [];
      }
    }

    return [];
  },

  downloadBibleFile: async (fileId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Failed to download bible');
    return await response.text();
  },

  deleteBibleFile: async (fileId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Failed to delete bible file');
  },

  uploadBibleFile: async (fileName: string, textData: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const folderId = await gdriveWebService.getAppFolderId('Nations Bible');

    const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
    const files = searchData.files;

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    const metadata: any = { name: fileName, mimeType: 'text/plain' };

    if (files && files.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`;
      method = 'PATCH';
    } else {
      metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      textData +
      close_delim;

    const uploadRes = await gdriveFetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!uploadRes.ok) throw new Error('Bible upload failed');
    return uploadRes.json();
  },

  // 이미지 파일 (미디어) Blob 다운로드 및 캐싱 연동
  getFileBlob: async (fileId: string): Promise<Blob | null> => {
    if (!fileId) return null;
    
    // 1. 로컬 캐시 조회
    const cachedBlob = await imageCache.getImage(fileId);
    if (cachedBlob && cachedBlob.size > 0) {
      console.log(`[Cache Hit] Loaded score from local database: ${fileId} (${cachedBlob.size} bytes)`);
      return cachedBlob;
    } else if (cachedBlob && cachedBlob.size === 0) {
      console.warn(`[Cache Corrupted] Cached blob is empty (0 bytes). Invalidating cache for: ${fileId}`);
    }
    
    // 2. 캐시 미스 시 구글 드라이브 다운로드
    if (!accessToken) return null;
    try {
      console.log(`[Cache Miss] Downloading score from Google Drive: ${fileId}`);
      const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) return null;
      
      // 스트림 소모(Consumption) 버그를 완벽히 막기 위해 일단 ArrayBuffer로 완전히 메모리에 적재합니다.
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const safeBlob = new Blob([buffer], { type: contentType });
      
      // 3. 로컬 캐시 저장 (백그라운드에서 비동기로 실행하여 로딩 속도 단축)
      imageCache.saveImage(fileId, safeBlob).catch(e => console.error(e));
      
      return safeBlob;
    } catch (e) {
      console.error('Failed to get file blob from drive', e);
      return null;
    }
  },

  // 이미지 파일 (미디어) Blob URL 반환 (사파리 흰화면 버그를 완전히 방지하기 위해 Data URL로 변환)
  downloadImageBlob: async (fileId: string): Promise<string | null> => {
    const blob = await gdriveWebService.getFileBlob(fileId);
    if (blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    return null;
  },

  // 특정 폴더 내의 이미지 파일 목록 실시간 조회 및 이름순 정렬
  listFolderFiles: async (folderName: string): Promise<any[]> => {
    const cacheKey = `gdrive_folder_cache_${folderName}`;
    if (!accessToken || accessToken === 'offline_token') {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    }
    try {
      let cleanAlbumName = folderName;
      if (cleanAlbumName.startsWith('CEUM_Album_')) {
        cleanAlbumName = cleanAlbumName.replace('CEUM_Album_', '');
      } else if (cleanAlbumName === 'CEUM_ccm_data') {
        cleanAlbumName = 'misc';
      }
      const folderId = await gdriveWebService.getAlbumFolderId(cleanAlbumName);
      
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (mimeType='image/webp' or mimeType='image/jpeg' or mimeType='image/png')`);
      const res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,createdTime)&pageSize=1000`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      const files = data.files || [];
      // 한국어 자모음 및 숫자(자연 정렬) 기준 오름차순 정렬
      const sortedFiles = files.sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
      localStorage.setItem(cacheKey, JSON.stringify(sortedFiles));
      return sortedFiles;
    } catch (err) {
      console.warn(`[gdriveWebService] listFolderFiles for folder '${folderName}' failed, using cache`, err);
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    }
  },

  // 하위 호환성 유지용 listCcmFiles 메소드
  listCcmFiles: async (): Promise<any[]> => {
    return gdriveWebService.listFolderFiles('CEUM_ccm_data');
  },

  renameFolder: async (oldName: string, newName: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    try {
      const q = encodeURIComponent(`name='${oldName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) return false;
      const searchData = await searchRes.json();
      const folders = searchData.files;

      if (folders && folders.length > 0) {
        const folderId = folders[0].id;
        const updateRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: newName })
        });
        return updateRes.ok;
      }
    } catch (err) {
      console.error('Rename folder failed', err);
    }
    return false;
  },

  // PDF 파일 업로드 및 공유 링크 생성
  uploadPdfFile: async (fileName: string, pdfBlob: Blob): Promise<{ id: string; webViewLink: string }> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    // Nations Studio/PDF_Library 폴더 자동 생성 및 ID 조회
    const folderId = await gdriveWebService.getStudioSubFolderId('PDF_Library');

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/pdf'
    };

    const boundary = '-------314159265358979323846';
    
    // RFC 규격 및 구글 업로드 API 스펙에 맞추어 multipart 바디 조립 (각 파트 개행 준수)
    const part1Str = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/pdf\r\n\r\n`;
      
    const part2Str = `\r\n--${boundary}--`;

    // Blob 데이터를 ArrayBuffer로 읽기
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(pdfBlob);
    });

    const uInt8Array = new Uint8Array(arrayBuffer);
    const encoder = new TextEncoder();
    const part1 = encoder.encode(part1Str);
    const part2 = encoder.encode(part2Str);

    // 전체 바디 합치기
    const body = new Uint8Array(part1.length + uInt8Array.length + part2.length);
    body.set(part1, 0);
    body.set(uInt8Array, part1.length);
    body.set(part2, part1.length + uInt8Array.length);

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const uploadRes = await gdriveFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`PDF Upload failed: ${errText}`);
    }

    const createdFile = await uploadRes.json();
    const fileId = createdFile.id;

    // 공유 권한 부여 (anyone reader)
    await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    // 파일 정보 조회로 webViewLink 가져오기
    const fileInfoRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const fileInfo = await fileInfoRes.json();

    return {
      id: fileId,
      webViewLink: fileInfo.webViewLink
    };
  }
};

// 브라우저 콘솔 및 디버깅/수동 실행을 위한 전역 객체 바인딩
if (typeof window !== 'undefined') {
  (window as any).gdriveWebService = gdriveWebService;
}
