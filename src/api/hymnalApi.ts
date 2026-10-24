import { hymnalFirestoreService } from './hymnalFirestoreService';
import { resolveSheetImageUrl } from './storageService';
import { gdriveWebService } from './gdriveWebService';

export const hymnalApi = {
  /**
   * 앨범 목록 조회 (Firestore 캐시 우선 + 하위 호환)
   */
  getSettings: async () => {
    try {
      const albums = await hymnalFirestoreService.getAlbums();
      if (albums && albums.length > 0) {
        return { albums };
      }

      // 레거시 드라이브에 저장된 설정이 있는지 시도 (기존 유저 마이그레이션)
      if (gdriveWebService.getAccessToken()) {
        try {
          const driveData = await gdriveWebService.downloadJsonFile('settings.json');
          if (driveData && driveData.albums) {
            const mapped = driveData.albums.map((a: any) =>
              a.id === 'misc' ? { ...a, name: '미분류' } : a
            );
            await hymnalFirestoreService.saveAlbums(mapped);
            return { albums: mapped };
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[hymnalApi] getSettings error, using defaults:', e);
    }

    return {
      albums: [
        { id: 'hymnal', name: '새찬송가', type: 'system' },
        { id: 'misc', name: '미분류', type: 'system' }
      ]
    };
  },

  /**
   * 앨범 목록 저장
   */
  saveSettings: async (settings: any) => {
    try {
      const albums = settings?.albums || [];
      const ok = await hymnalFirestoreService.saveAlbums(albums);
      return { success: ok };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 전체 악보 목록 조회 (찬송가 645곡 정적 로드 + Firestore 유저 악보 로컬 캐시 병합)
   */
  getSongs: async () => {
    try {
      // 1. 기본 찬송가 645곡 무조건 로드 (/data/hymnal_default.json) - Firestore Read 비용 0원
      let defaultHymnalSongs: any[] = [];
      try {
        const defaultResponse = await fetch('/data/hymnal_default.json');
        if (defaultResponse.ok) {
          defaultHymnalSongs = await defaultResponse.json();
        }
      } catch (err) {
        console.warn('[hymnalApi] Failed to fetch hymnal_default.json:', err);
      }

      // 2. Firestore에서 유저 악보 데이터 로드 (Offline Persistence 로컬 캐시 적용)
      const userSongs = await hymnalFirestoreService.getUserSongs();

      // 3. 구글 드라이브 실시간 스캔 & 자동 마이그레이션 브릿지
      // (기존 구글 드라이브 폴더에 보관 중인 악보 파일들을 자동 감지하여 화면 및 새 DB로 100% 복원)
      const gdriveToken = gdriveWebService.getAccessToken();
      if (gdriveToken && gdriveToken !== 'offline_token') {
        try {
          const settings = await hymnalApi.getSettings();
          const activeAlbums = settings.albums || [];
          const nonHymnalAlbums = activeAlbums.filter((a: any) => a.id !== 'hymnal');

          // 1) music_data.json 부가 메타데이터가 있다면 다운로드
          let driveMusicData: any[] = [];
          try {
            const mData = await gdriveWebService.downloadJsonFile('music_data.json');
            if (Array.isArray(mData)) driveMusicData = mData;
          } catch {}

          // 2) 각 앨범의 구글 드라이브 폴더 실시간 스캔
          const existingIds = new Set(userSongs.map((s: any) => s.id));
          const existingFileIds = new Set(userSongs.map((s: any) => (s as any).fileId).filter(Boolean));

          for (const album of nonHymnalAlbums) {
            const folderName = (album.id === 'misc' || album.name === '기타앨범' || album.name === '기타악보' || album.name === '미분류') 
              ? '미분류' 
              : album.name;

            try {
              const files = await gdriveWebService.listFolderFiles(folderName);
              if (Array.isArray(files) && files.length > 0) {
                for (let index = 0; index < files.length; index++) {
                  const file = files[index];
                  const songId = `${album.id}-${file.id}`;
                  
                  // 이미 존재하는 곡이면 스킵
                  if (existingIds.has(songId) || existingFileIds.has(file.id)) continue;

                  const title = file.name.replace(/\.[^/.]+$/, "");
                  const meta = driveMusicData.find((s: any) => s.id === songId || s.title === title || s.fileId === file.id);
                  const numMatch = file.name.match(/\d+/);
                  const number = meta?.number || (numMatch ? parseInt(numMatch[0], 10) : index + 1);

                  const recoveredSong = {
                    id: songId,
                    title: meta?.title || title,
                    number: number,
                    albumId: album.id,
                    type: 'image',
                    fileId: file.id,
                    filePath: file.id,
                    storageUrl: file.id,
                    lyrics: meta?.lyrics || '',
                    code: meta?.code || '',
                    meter: meta?.meter || '',
                    category: meta?.category || '',
                    songForm: meta?.songForm || '',
                    searchTokens: [title, meta?.title].filter(Boolean)
                  };

                  userSongs.push(recoveredSong);
                  existingIds.add(songId);
                  existingFileIds.add(file.id);

                  // 백그라운드로 Firestore 및 IndexedDB에 영구 저장 (자가 복구)
                  hymnalFirestoreService.saveUserSong(recoveredSong).catch(() => {});
                }
              }
            } catch (scanErr) {
              console.warn(`[hymnalApi] Failed to scan Google Drive folder: ${folderName}`, scanErr);
            }
          }
        } catch (migErr) {
          console.warn('[hymnalApi] Google Drive scan & migration bridge error:', migErr);
        }
      }

      // 찬송가 645곡 중 유저가 수정한 메타데이터(유튜브, 송폼 등)가 있으면 병합
      const userSongMap = new Map<string, any>();
      userSongs.forEach((s) => userSongMap.set(s.id, s));

      const mergedHymnalSongs = defaultHymnalSongs.map((hSong) => {
        const custom = userSongMap.get(hSong.id);
        if (custom) {
          userSongMap.delete(hSong.id); // 찬송가에서 처리된 곡은 맵에서 제거
          return { ...hSong, ...custom };
        }
        return hSong;
      });

      // 나머지 커스텀 악보들
      const customSongs = Array.from(userSongMap.values());

      return [...mergedHymnalSongs, ...customSongs];
    } catch (e) {
      console.error('[hymnalApi] getSongs failed, falling back to static hymnal:', e);
      try {
        const defaultResponse = await fetch('/data/hymnal_default.json');
        if (defaultResponse.ok) {
          return await defaultResponse.json();
        }
      } catch {}
      return [];
    }
  },

  /**
   * 앨범 추가
   */
  addAlbum: async (album: any) => {
    const settings = await hymnalApi.getSettings();
    const newAlbum = {
      id: album.id || `album-${Date.now()}`,
      name: album.name,
      path: album.path || '',
      type: 'custom'
    };
    settings.albums = settings.albums || [];
    const existingIdx = settings.albums.findIndex((a: any) => a.id === newAlbum.id);
    if (existingIdx !== -1) {
      settings.albums[existingIdx] = newAlbum;
    } else {
      settings.albums.push(newAlbum);
    }
    const saveResult = await hymnalApi.saveSettings(settings);
    if (!saveResult.success) return saveResult;
    return { success: true, album: newAlbum };
  },

  /**
   * 앨범 수정
   */
  updateAlbum: async (album: any) => {
    const settings = await hymnalApi.getSettings();
    const idx = settings.albums.findIndex((a: any) => a.id === album.id);
    if (idx !== -1) {
      settings.albums[idx] = album;
      const saveResult = await hymnalApi.saveSettings(settings);
      if (!saveResult.success) return saveResult;
      return { success: true };
    }
    return { success: false, error: '앨범을 찾을 수 없습니다.' };
  },

  /**
   * 앨범 삭제
   */
  deleteAlbum: async (id: string) => {
    try {
      const settings = await hymnalApi.getSettings();
      settings.albums = settings.albums.filter((a: any) => a.id !== id);
      const saveResult = await hymnalApi.saveSettings(settings);
      return saveResult;
    } catch (e: any) {
      console.error('[hymnalApi] deleteAlbum failed:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * 곡 정보 수정/추가 (Firestore 저장)
   */
  updateSong: async (song: any) => {
    try {
      const ok = await hymnalFirestoreService.saveUserSong(song);
      return { success: ok };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 곡 완전 삭제 (DB, 로컬 IndexedDB 캐시, 원격 스토리지 및 구글 드라이브 일괄 영구 삭제)
   */
  deleteSong: async (songId: string, shouldDeleteOriginal?: boolean, fileId?: string, storageUrl?: string) => {
    try {
      // 1. Firestore 및 로컬 IndexedDB 메타데이터 / localStorage 백업 삭제
      const ok = await hymnalFirestoreService.deleteUserSong(songId);

      // 2. 브라우저 로컬 고화질 이미지 Blob 완전 삭제 (IndexedDB music-sheets-v2)
      try {
        const { imageCache } = await import('../utils/imageCache');
        if (songId) await imageCache.removeImage(songId);
        if (fileId && fileId !== songId) await imageCache.removeImage(fileId);
      } catch (e) {
        console.warn('[hymnalApi] 로컬 이미지 캐시 삭제 중 경고:', e);
      }

      // 3. 원격 클라우드 스토리지(Firebase Storage & Cloudflare R2) 원본 파일 영구 삭제
      const targetStorageUrl = storageUrl || fileId || songId;
      if (targetStorageUrl) {
        try {
          const { deleteSheetImage } = await import('./storageService');
          await deleteSheetImage(targetStorageUrl);
        } catch (e) {
          console.warn('[hymnalApi] 원격 스토리지 파일 삭제 중 경고:', e);
        }
      }

      // 4. 구글 드라이브 레거시 파일 삭제 시도 (구글 드라이브 연동 파일인 경우)
      if (shouldDeleteOriginal && fileId && !fileId.startsWith('song_') && !fileId.startsWith('http')) {
        try {
          if ((window as any).gapi?.client?.drive?.files?.delete) {
            await (window as any).gapi.client.drive.files.delete({ fileId });
            console.log('[hymnalApi] 구글 드라이브 원본 파일 삭제 완료:', fileId);
          }
        } catch (gdriveErr) {
          console.warn('[hymnalApi] 구글 드라이브 파일 삭제 실패:', gdriveErr);
        }
      }

      return { success: ok };
    } catch (e: any) {
      console.error('[hymnalApi] deleteSong error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * 저장된 콘티 목록 조회 (Firestore 캐시 우선)
   */
  getSavedContis: async () => {
    try {
      const contis = await hymnalFirestoreService.getSavedContis();
      if (contis && contis.length > 0) {
        return contis;
      }

      // 레거시 드라이브에 저장된 콘티가 있다면 마이그레이션
      if (gdriveWebService.getAccessToken()) {
        try {
          const driveData = await gdriveWebService.downloadJsonFile('saved_contis.json');
          if (Array.isArray(driveData) && driveData.length > 0) {
            console.log(`[hymnalApi] Migrating ${driveData.length} contis from Google Drive to Firestore...`);
            for (const c of driveData) {
              await hymnalFirestoreService.saveConti(c);
            }
            return driveData;
          }
        } catch {}
      }
      return [];
    } catch (e) {
      console.error('[hymnalApi] getSavedContis error:', e);
      return [];
    }
  },

  /**
   * 콘티 저장 (Firestore 저장)
   */
  saveConti: async (conti: any) => {
    try {
      const ok = await hymnalFirestoreService.saveConti(conti);
      return { success: ok };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 콘티 삭제 (Firestore 삭제)
   */
  deleteSavedConti: async (id: string) => {
    try {
      const ok = await hymnalFirestoreService.deleteSavedConti(id);
      return { success: ok };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 이미지 주소 해석 (Cloudflare R2, CDN, 구글 드라이브 하위 호환)
   */
  resolveImagePath: (fileIdOrUrl: string) => {
    return resolveSheetImageUrl(fileIdOrUrl);
  },

  resizeWindow: (width: number, height: number) => {
    console.log(`[WebApp] resizeWindow ignored.`);
  },

  openExternal: (url: string) => {
    window.open(url, '_blank');
  },

  writeClipboard: (text: string) => {
    navigator.clipboard.writeText(text).catch(err => console.error(err));
  },

  processImages: async (args: any) => {
    return { processed: 0 };
  },

  pdfProgressCallback: null as ((data: any) => void) | null,

  onProgress: (callback: any) => {
    return () => {};
  },

  onPDFProgress: (callback: (data: any) => void) => {
    hymnalApi.pdfProgressCallback = callback;
    return () => {
      hymnalApi.pdfProgressCallback = null;
    };
  },

  /**
   * PDF 생성 및 다운로드 (jsPDF 기반 동적 렌더링 유지)
   */
  generatePDF: async ({ title, type, items, songs, footer }: { title: string, type: 'leader' | 'congregation', items: any[], songs?: any[], footer?: string }) => {
    try {
      const finalSongs = (songs && songs.length > 0) ? songs : await hymnalApi.getSongs();
      const progress = (msg: string, percent: number) => {
        if (hymnalApi.pdfProgressCallback) {
          hymnalApi.pdfProgressCallback({ msg, percent });
        }
      };

      // 1. PDF Blob 생성 (jsPDF 기반 동적 렌더링 유지)
      const { generateMobilePDF } = await import('../utils/pdfGenerator');
      const pdfBlob = await generateMobilePDF(title, type, items, finalSongs, progress, footer);

      progress('PDF 생성 완료!', 95);
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const typeStr = type === 'leader' ? '인도자' : '회중';
      const fileName = `[모바일]_${title}_${typeStr}_${dateStr}.pdf`;

      // 브라우저 직접 다운로드 URL 생성
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

      // 구글 드라이브 로그인이 유지된 상태라면 드라이브 백업도 병행
      let webViewLink = downloadUrl;
      if (gdriveWebService.getAccessToken()) {
        try {
          const uploadResult = await gdriveWebService.uploadPdfFile(fileName, pdfBlob);
          if (uploadResult?.webViewLink) webViewLink = uploadResult.webViewLink;
        } catch {}
      }

      progress('완료되었습니다!', 100);
      return { success: true, url: webViewLink, fileId: fileName };
    } catch (e: any) {
      console.error('[hymnalApi] generatePDF error:', e);
      return { success: false, message: e.message || 'PDF 생성 실패' };
    }
  },

  selectFileForConti: () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        if (e.target.files && e.target.files.length > 0) {
          resolve(e.target.files[0]);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  },

  selectFolderForAlbum: (): Promise<File[]> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.webkitdirectory = true;
      (input as any).directory = true;
      input.multiple = true;
      input.onchange = (e: any) => {
        resolve(e.target.files ? Array.from(e.target.files) : []);
      };
      input.click();
    });
  },

  selectMultipleFiles: (): Promise<File[]> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e: any) => {
        resolve(e.target.files ? Array.from(e.target.files) : []);
      };
      input.click();
    });
  },

  /**
   * 폴더 단위 이미지 일괄 압축 및 Cloudflare R2 / 스토리지 업로드
   * (기존 WebP 압축 파이프라인 및 인터페이스 100% 유지 + AI 악보정보 분석 지원)
   */
  batchUploadImagesToGDrive: async (
    files: File[],
    albumName: string,
    onProgress: (processed: number, total: number) => void,
    albumId?: string
  ) => {
    const { compressImageToWebP, uploadImageToR2 } = await import('../utils/imageProcessor');
    const uploadedSongs: any[] = [];
    let processedCount = 0;
    const CHUNK_SIZE = 4;
    const finalAlbumId = albumId || (albumName === '새찬송가' ? 'hymnal' : (albumName === '미분류' ? 'misc' : albumName));

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (file) => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) {
          processedCount++;
          onProgress(processedCount, files.length);
          return;
        }
        try {
          // 기존 초경량 WebP 압축 로직 그대로 실행
          const compressedBlob = await compressImageToWebP(file, 0.75);
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const songId = `song_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

          // 1. IndexedDB에 초경량 고화질 WebP 영구 보관 (용량 무제한, 즉시 로드)
          const { imageCache } = await import('../utils/imageCache');
          await imageCache.saveImage(songId, compressedBlob);

          // 2. Firebase Storage / 원격 스토리지 업로드 시도 (원격 URL 확보 시 연동)
          let finalStorageUrl = songId;
          try {
            const { storageUrl } = await uploadImageToR2(compressedBlob, {
              albumId: finalAlbumId,
              songId,
              fileName: `${fileName}.webp`,
            });
            if (storageUrl && !storageUrl.startsWith('data:')) {
              finalStorageUrl = storageUrl;
            }
          } catch (r2Err) {
            console.warn('[hymnalApi] Remote upload bypassed, using local cached storage:', r2Err);
          }

          const numMatch = fileName.match(/\d+/);
          const number = numMatch ? parseInt(numMatch[0], 10) : uploadedSongs.length + 1;

          const searchTokens: string[] = [fileName];

          const newSong = {
            id: songId,
            title: fileName,
            number: number,
            albumId: finalAlbumId,
            type: 'image',
            filePath: finalStorageUrl,
            storageUrl: finalStorageUrl,
            fileId: songId, // imageCache 고속 조회 키
            fileSize: compressedBlob.size, // 실제 WebP 파일 바이트 크기
            code: '',
            meter: '',
            category: '',
            songForm: '',
            lyrics: '',
            isManual: false,
            searchTokens
          };

          // Firestore에 악보 메타데이터 저장 (초경량 메타데이터로 100% 성공)
          await hymnalFirestoreService.saveUserSong(newSong);
          uploadedSongs.push(newSong);
        } catch (err) {
          console.error(`Failed to upload ${file.name}`, err);
        }
        processedCount++;
        onProgress(processedCount, files.length);
      }));
    }
    return uploadedSongs;
  },

  /**
   * 단일/다중 악보 파일 업로드 (기본 미분류)
   */
  uploadSingleImagesToGDrive: async (
    files: File[],
    onProgress: (processed: number, total: number) => void
  ) => {
    return hymnalApi.batchUploadImagesToGDrive(files, '미분류', onProgress, 'misc');
  },

  /**
   * 엑셀 파일(.xlsx) 다운로드 (악보 제목, 가사, 코드, 박자, 번호, 분류 편집용)
   */
  exportExcel: async ({ mode, albumName }: { mode: string; albumName?: string }) => {
    try {
      const XLSX = await import('xlsx');
      const songs = await hymnalApi.getSongs();
      const targetSongs = mode === 'all' ? songs : songs.filter((s: any) => s.albumId === mode);

      if (targetSongs.length === 0) {
        alert('내보낼 악보가 없습니다.');
        return { success: false, error: '악보 없음' };
      }

      const cleanAlbumName = albumName || (mode === 'all' ? '전체악보' : (mode === 'misc' ? '미분류' : mode));

      // 엑셀 시트 데이터 생성 (사용자가 편집하기 쉬운 표준 한글 컬럼)
      // 1. 송폼 제거 (콘티에서 실시간 지정)
      // 2. 앨범ID 대신 앱에 표시되는 앨범 이름 및 주의 문구 표기
      const excelRows = targetSongs.map((s: any, idx: number) => ({
        '악보ID(수정금지)': s.id || '',
        '번호': s.number || idx + 1,
        '곡제목': s.title || '',
        '코드': s.code || '',
        '박자': s.meter || '',
        '분류': s.category || '',
        '가사': s.lyrics || '',
        '앨범명 (주의: 반드시 해당 앨범에 업로드하세요)': cleanAlbumName
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      worksheet['!cols'] = [
        { wch: 24 }, // 악보ID(수정금지)
        { wch: 8 },  // 번호
        { wch: 30 }, // 곡제목
        { wch: 10 }, // 코드
        { wch: 10 }, // 박자
        { wch: 14 }, // 분류
        { wch: 50 }, // 가사
        { wch: 42 }, // 앨범명 (주의: 반드시 해당 앨범에 업로드하세요)
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '악보목록');

      XLSX.writeFile(workbook, `[네이션스스튜디오]_${cleanAlbumName}_악보데이터.xlsx`);
      return { success: true };
    } catch (e: any) {
      console.error('[hymnalApi] exportExcel error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * 엑셀 파일(.xlsx, .xls, .csv) 업로드하여 악보 제목/가사/코드 일괄 갱신
   * @param targetAlbumId 업로드 대상 특정 앨범 ID
   */
  importExcel: async (targetAlbumId?: string) => {
    return new Promise<{ success: boolean; count?: number; error?: string }>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx, .xls, .csv';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) {
          resolve({ success: false, error: '선택된 파일이 없습니다.' });
          return;
        }

        try {
          const XLSX = await import('xlsx');
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

          if (!rows || rows.length === 0) {
            resolve({ success: false, error: '엑셀에 데이터가 없습니다.' });
            return;
          }

          // 기존 곡 목록을 조회하여 기존 이미지 경로, 앨범 등 안전 보존
          const currentSongs = await hymnalApi.getSongs();

          let count = 0;
          for (const row of rows) {
            const id = row['악보ID(수정금지)'] || row['id'] || row['ID'];
            const title = row['곡제목'] || row['title'] || row['제목'];
            const number = parseInt(row['번호'] || row['number'] || '0', 10);
            const code = row['코드'] || row['code'] || '';
            const meter = row['박자'] || row['meter'] || '';
            const category = row['분류'] || row['category'] || '';
            const lyrics = row['가사'] || row['lyrics'] || '';

            // 기존 곡이 있으면 정보 유지
            const existingSong = id ? currentSongs.find((s: any) => s.id === id) : null;
            const albumId = targetAlbumId || existingSong?.albumId || row['앨범ID'] || row['albumId'] || 'misc';

            if (id || title) {
              const songData: any = {
                id: id || `song_${Date.now()}_${count}`,
                title: title || existingSong?.title || '무제',
                number: number || existingSong?.number || count + 1,
                code: code !== undefined ? code : (existingSong?.code || ''),
                meter: meter !== undefined ? meter : (existingSong?.meter || ''),
                category: category !== undefined ? category : (existingSong?.category || ''),
                lyrics: lyrics !== undefined ? lyrics : (existingSong?.lyrics || ''),
                albumId,
                filePath: existingSong?.filePath || '',
                fileId: existingSong?.fileId || '',
                storageUrl: existingSong?.storageUrl || '',
                crop: existingSong?.crop || null,
                youtubeVideos: existingSong?.youtubeVideos || [],
                updatedAt: new Date().toISOString()
              };

              await hymnalFirestoreService.saveUserSong(songData);
              count++;
            }
          }

          resolve({ success: true, count });
        } catch (err: any) {
          console.error('[hymnalApi] importExcel failed:', err);
          resolve({ success: false, error: err?.message || '엑셀 파일 처리 오류' });
        }
      };
      input.click();
    });
  },

  // 하위 호환 메서드
  exportCSV: async ({ mode }: { mode: string }) => {
    return hymnalApi.exportExcel({ mode });
  },

  importCSV: async (targetAlbumId?: string) => {
    return hymnalApi.importExcel(targetAlbumId);
  },

  syncGDrive: async (albumId: string) => {
    return { success: true, uploaded: 0, skipped: 0 };
  },
};
