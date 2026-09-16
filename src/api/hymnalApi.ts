import { gdriveWebService } from './gdriveWebService';

export const hymnalApi = {
  getSettings: async () => {
    try {
      const data = await gdriveWebService.downloadJsonFile('settings.json');
      if (data && data.albums) {
        // 기존 '기타앨범'을 '미분류'로 자동 동기화
        data.albums = data.albums.map((a: any) => a.id === 'misc' ? { ...a, name: '미분류' } : a);
        return data;
      }
      throw new Error('No settings');
    } catch (e) {
      return { 
        albums: [
          { id: 'hymnal', name: '새찬송가', type: 'system' },
          { id: 'misc', name: '미분류', type: 'system' }
        ] 
      };
    }
  },
  
  saveSettings: async (settings: any) => {
    try {
      await gdriveWebService.uploadJsonFile('settings.json', settings);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  getSongs: async () => {
    let baseSongs: any[] = [];
    try {
      // 1. settings.json에서 등록된 앨범 리스트 조회
      const settings = await hymnalApi.getSettings();
      const activeAlbums = settings.albums || [];

      // 2. 기본 찬송가 645곡 무조건 로드 (/data/hymnal_default.json)
      let defaultHymnalSongs: any[] = [];
      try {
        const defaultResponse = await fetch('/data/hymnal_default.json');
        if (defaultResponse.ok) {
          defaultHymnalSongs = await defaultResponse.json();
        }
      } catch (err) {
        console.warn('[hymnalApi] Failed to fetch hymnal_default.json:', err);
      }

      // 3. 구글 드라이브 music_data.json 다운로드 (커스텀 악보 및 부가 메타데이터)
      let driveMusicData: any[] = [];
      try {
        const data = await gdriveWebService.downloadJsonFile('music_data.json');
        if (Array.isArray(data)) {
          driveMusicData = data;
        }
      } catch (err: any) {
        if (!err?.message?.includes('Not authenticated')) {
          console.warn('[hymnalApi] Failed to download music_data.json:', err.message);
        }
      }

      // 드라이브 데이터에 hymnal 곡이 있으면 사용하되, 없거나 부족하면 defaultHymnalSongs(645곡)로 복원
      const driveHymnalSongs = driveMusicData.filter((s: any) => s.albumId === 'hymnal');
      let hymnalSongs = driveHymnalSongs.length >= 600 ? driveHymnalSongs : defaultHymnalSongs;

      if (hymnalSongs.length < 600 && defaultHymnalSongs.length > 0) {
        const existingIds = new Set(hymnalSongs.map((s: any) => s.id));
        const missingDefaults = defaultHymnalSongs.filter((s: any) => !existingIds.has(s.id));
        hymnalSongs = [...hymnalSongs, ...missingDefaults];
      }

      // 찬송가 드라이브 폴더 ('Albums/새찬송가') 실시간 스캔 및 이미지 파일 ID 매핑
      let hymnalDriveFiles: any[] = [];
      try {
        hymnalDriveFiles = await gdriveWebService.listFolderFiles('새찬송가');
      } catch (driveErr) {
        console.warn('[hymnalApi] Failed to scan 새찬송가 folder', driveErr);
      }

      // 찬송가 정적 곡 목록에 실시간 스캔된 구글 파일 ID를 매핑
      const hymnalFileMap = new Map<number, string>();
      hymnalDriveFiles.forEach((file: any) => {
        const numMatch = file.name.match(/\d+/);
        if (numMatch) {
          const fileNum = parseInt(numMatch[0], 10);
          hymnalFileMap.set(fileNum, file.id);
        }
      });

      const mappedHymnalSongs = hymnalSongs.map((song: any) => {
        const driveFileId = hymnalFileMap.get(song.number);
        return {
          ...song,
          ...(driveFileId ? { fileId: driveFileId } : {})
        };
      });

      // 4. 활성화된 앨범 중 'hymnal'을 제외한 모든 앨범의 구글 드라이브 실시간 스캔 병렬 처리
      const nonHymnalAlbums = activeAlbums.filter((a: any) => a.id !== 'hymnal');
      
      const scanPromises = nonHymnalAlbums.map(async (album: any) => {
        const folderName = (album.id === 'misc' || album.name === '기타앨범' || album.name === '기타악보' || album.name === '미분류') 
          ? '미분류' 
          : album.name;
        try {
          const files = await gdriveWebService.listFolderFiles(folderName);
          return files.map((file: any, index: number) => {
            const title = file.name.replace(/\.[^/.]+$/, ""); // 확장자 제거
            const songId = `${album.id}-${file.id}`;
            const existingSong = driveMusicData.find((s: any) => s.id === songId);
            return {
              id: songId,
              title: existingSong?.title || title,
              lyrics: existingSong?.lyrics || '',
              number: existingSong?.number || index + 1,
              code: existingSong?.code || '',
              meter: existingSong?.meter || '',
              category: existingSong?.category || '',
              youtubeVideos: existingSong?.youtubeVideos || [],
              albumId: album.id,
              type: 'image',
              fileId: file.id,
              searchTokens: [existingSong?.title || title]
            };
          });
        } catch (e) {
          console.warn(`[hymnalApi] Failed to scan album folder: ${folderName}`, e);
          return [];
        }
      });

      const scannedAlbumSongs = await Promise.all(scanPromises);
      const combinedScanned = scannedAlbumSongs.flat();

      // 5. 드라이브에 저장된 기타 곡들 중 실시간 스캔에 잡히지 않았으나 music_data.json에 남아있는 유효한 곡 병합
      const scannedIds = new Set(combinedScanned.map((s: any) => s.id));
      const otherDriveSongs = driveMusicData.filter((s: any) => s.albumId !== 'hymnal' && !scannedIds.has(s.id));

      // 6. 매핑 완료된 찬송가 데이터와 드라이브 실시간 스캔 곡 데이터를 병합
      return [...mappedHymnalSongs, ...combinedScanned, ...otherDriveSongs];
    } catch (e) {
      console.error('[hymnalApi] Failed in getSongs real-time merge process', e);
      try {
        const defaultResponse = await fetch('/data/hymnal_default.json');
        if (defaultResponse.ok) {
          return await defaultResponse.json();
        }
      } catch (err) {}
      return [];
    }
  },

  addAlbum: async (album: any) => {
    const settings = await hymnalApi.getSettings();
    const newAlbum = { ...album, id: `album-${Date.now()}`, type: 'custom' };
    settings.albums = settings.albums || [];
    settings.albums.push(newAlbum);
    const saveResult = await hymnalApi.saveSettings(settings);
    if (!saveResult.success) return saveResult;
    return { success: true, album: newAlbum };
  },

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

  deleteAlbum: async (id: string) => {
    try {
      const settings = await hymnalApi.getSettings();
      const targetAlbum = settings.albums.find((a: any) => a.id === id);
      
      settings.albums = settings.albums.filter((a: any) => a.id !== id);
      const saveResult = await hymnalApi.saveSettings(settings);
      if (!saveResult.success) return saveResult;

      // 구글 드라이브에서 실제 폴더 및 하위 파일 영구 삭제 (복구 불가)
      if (targetAlbum && targetAlbum.id !== 'hymnal' && targetAlbum.id !== 'misc') {
        try {
          const folderId = await gdriveWebService.getAlbumFolderId(targetAlbum.name);
          if (folderId && (window as any).gapi?.client?.drive) {
            await (window as any).gapi.client.drive.files.delete({
              fileId: folderId
            });
            console.log(`[hymnalApi] Successfully deleted physical Drive folder: ${targetAlbum.name} (${folderId})`);
          }
        } catch (delErr) {
          console.warn('[hymnalApi] Drive folder delete failed:', delErr);
        }
      }
      return { success: true };
    } catch (e: any) {
      console.error('[hymnalApi] deleteAlbum failed:', e);
      return { success: false, error: e.message };
    }
  },

  updateSong: async (song: any) => {
    let baseSongs: any[] = [];
    try {
      baseSongs = await gdriveWebService.downloadJsonFile('music_data.json') || [];
    } catch(e) {}

    const idx = baseSongs.findIndex((s: any) => s.id === song.id);
    if (idx !== -1) {
      baseSongs[idx] = { ...baseSongs[idx], ...song };
    } else {
      baseSongs.push(song);
    }
    
    try {
      await gdriveWebService.uploadJsonFile('music_data.json', baseSongs);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  deleteSong: async (songId: string, shouldDeleteOriginal?: boolean, fileId?: string) => {
    try {
      let baseSongs: any[] = [];
      try {
        baseSongs = await gdriveWebService.downloadJsonFile('music_data.json') || [];
      } catch(e) {}

      const songToDelete = baseSongs.find((s: any) => s.id === songId);
      const targetFileId = fileId || songToDelete?.fileId;

      const newSongs = baseSongs.filter((s: any) => s.id !== songId);
      await gdriveWebService.uploadJsonFile('music_data.json', newSongs);

      if (shouldDeleteOriginal && targetFileId) {
        try {
          await window.gapi.client.drive.files.delete({ fileId: targetFileId });
        } catch (e) {
          console.warn('[hymnalApi] 구글 드라이브 파일 삭제 실패:', e);
        }
      }

      if (targetFileId) {
        try {
          const { imageCache } = await import('../utils/imageCache');
          await imageCache.removeImage(targetFileId);
        } catch (e) {
          console.warn('[hymnalApi] 로컬 캐시 삭제 실패:', e);
        }
      }

      return { success: true };
    } catch (e: any) {
      console.error('[hymnalApi] deleteSong error:', e);
      return { success: false, error: e.message };
    }
  },

  getSavedContis: async () => {
    try {
      const data = await gdriveWebService.downloadJsonFile('saved_contis.json');
      return data || [];
    } catch (e) {
      return [];
    }
  },

  saveConti: async (conti: any) => {
    try {
      const contis = await hymnalApi.getSavedContis();
      const idx = contis.findIndex((c: any) => c.id === conti.id);
      if (idx !== -1) {
        contis[idx] = { ...contis[idx], ...conti, updatedAt: new Date().toISOString() };
      } else {
        contis.push({ ...conti, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      await gdriveWebService.uploadJsonFile('saved_contis.json', contis);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  deleteSavedConti: async (id: string) => {
    try {
      let contis = await hymnalApi.getSavedContis();
      contis = contis.filter((c: any) => c.id !== id);
      await gdriveWebService.uploadJsonFile('saved_contis.json', contis);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  resolveImagePath: (fileId: string) => {
    return `https://drive.google.com/uc?id=${fileId}`;
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

  // PDF 생성 진행 콜백 보관
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

  generatePDF: async ({ title, type, items, songs, footer }: { title: string, type: 'leader' | 'congregation', items: any[], songs?: any[], footer?: string }) => {
    try {
      const finalSongs = (songs && songs.length > 0) ? songs : await hymnalApi.getSongs();
      const progress = (msg: string, percent: number) => {
        if (hymnalApi.pdfProgressCallback) {
          hymnalApi.pdfProgressCallback({ msg, percent });
        }
      };

      // 1. PDF Blob 생성 (jsPDF 기반 동적 렌더링)
      const { generateMobilePDF } = await import('../utils/pdfGenerator');
      const pdfBlob = await generateMobilePDF(title, type, items, finalSongs, progress, footer);

      // 2. 구글 드라이브 업로드
      progress('구글 드라이브 업로드 중...', 90);
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const typeStr = type === 'leader' ? '인도자' : '회중';
      const fileName = `[모바일]_${title}_${typeStr}_${dateStr}.pdf`;

      const uploadResult = await gdriveWebService.uploadPdfFile(fileName, pdfBlob);
      
      progress('생성 완료!', 100);
      return { success: true, url: uploadResult.webViewLink, fileId: uploadResult.id };
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

  batchUploadImagesToGDrive: async (
    files: File[], 
    albumName: string, 
    onProgress: (processed: number, total: number) => void,
    albumId?: string
  ) => {
    const { compressImageToWebP, uploadImageToGDrive } = await import('../utils/imageProcessor');
    const folderId = await gdriveWebService.getAlbumFolderId(albumName);

    const uploadedSongs: any[] = [];
    let processedCount = 0;
    const CHUNK_SIZE = 5;

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
          const compressedBlob = await compressImageToWebP(file, 0.75);
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const fileId = await uploadImageToGDrive(compressedBlob, `${fileName}.webp`, folderId);

          const numMatch = fileName.match(/\d+/);
          const number = numMatch ? parseInt(numMatch[0], 10) : uploadedSongs.length + 1;
          const finalAlbumId = albumId || (albumName === '새찬송가' ? 'hymnal' : albumName);

          uploadedSongs.push({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: fileName,
            number: number,
            albumId: finalAlbumId,
            type: 'image',
            fileId: fileId,
            searchTokens: [fileName]
          });
        } catch (err) {
          console.error(`Failed to upload ${file.name}`, err);
        }
        processedCount++;
        onProgress(processedCount, files.length);
      }));
    }
    return uploadedSongs;
  },

  uploadSingleImagesToGDrive: async (
    files: File[], 
    onProgress: (processed: number, total: number) => void
  ) => {
    const { compressImageToWebP, uploadImageToGDrive } = await import('../utils/imageProcessor');
    const uploadedSongs: any[] = [];
    let processedCount = 0;
    const CHUNK_SIZE = 5;

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
          const compressedBlob = await compressImageToWebP(file, 0.75);
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const fileId = await uploadImageToGDrive(compressedBlob, `${fileName}.webp`);

          uploadedSongs.push({
            id: `misc-${fileId}`,
            title: fileName,
            albumId: 'misc',
            type: 'image',
            fileId: fileId,
            searchTokens: [fileName]
          });
        } catch (err) {
          console.error(`Failed to upload ${file.name}`, err);
        }
        processedCount++;
        onProgress(processedCount, files.length);
      }));
    }
    return uploadedSongs;
  },

  exportCSV: async ({ mode }: { mode: string }) => {
    try {
      const songs = await hymnalApi.getSongs();
      const targetSongs = mode === 'all' ? songs : songs.filter((s: any) => s.albumId === mode);
      
      const header = ['id', 'number', 'title', 'code', 'meter', 'category', 'albumId', 'lyrics'];
      const rows = targetSongs.map((s: any) => [
        `"${(s.id || '').toString().replace(/"/g, '""')}"`,
        `"${s.number || ''}"`,
        `"${(s.title || '').replace(/"/g, '""')}"`,
        `"${(s.code || '').replace(/"/g, '""')}"`,
        `"${(s.meter || '').replace(/"/g, '""')}"`,
        `"${(s.category || '').replace(/"/g, '""')}"`,
        `"${(s.albumId || '').replace(/"/g, '""')}"`,
        `"${(s.lyrics || '').replace(/"/g, '""')}"`,
      ].join(','));
      
      const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nations_songs_${mode}_${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  importCSV: async () => {
    return new Promise<{ success: boolean; count?: number; error?: string }>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) {
          resolve({ success: false, error: '선택된 파일이 없습니다.' });
          return;
        }
        try {
          const text = await file.text();
          const lines = text.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
          if (lines.length < 2) {
            resolve({ success: false, error: 'CSV 데이터가 부족합니다.' });
            return;
          }
          const baseSongs = (await gdriveWebService.downloadJsonFile('music_data.json')) || [];
          let count = 0;
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c: string) => c.replace(/^"|"$/g, '').trim());
            if (cols.length >= 3) {
              const [id, number, title, code, meter, category, albumId, lyrics] = cols;
              const existingIdx = baseSongs.findIndex((s: any) => s.id === id || s.title === title);
              const songData = {
                id: id || `csv-${Date.now()}-${i}`,
                number: parseInt(number, 10) || i,
                title,
                code: code || '',
                meter: meter || '',
                category: category || '',
                albumId: albumId || 'misc',
                lyrics: lyrics || ''
              };
              if (existingIdx !== -1) {
                baseSongs[existingIdx] = { ...baseSongs[existingIdx], ...songData };
              } else {
                baseSongs.push(songData);
              }
              count++;
            }
          }
          await gdriveWebService.uploadJsonFile('music_data.json', baseSongs);
          resolve({ success: true, count });
        } catch (err: any) {
          resolve({ success: false, error: err.message });
        }
      };
      input.click();
    });
  },

  syncGDrive: async (albumId: string) => {
    try {
      const settings = await hymnalApi.getSettings();
      const album = settings.albums.find((a: any) => a.id === albumId);
      if (!album) return { success: false, message: '앨범을 찾을 수 없습니다.' };
      
      const files = await gdriveWebService.listFolderFiles(album.name);
      return { success: true, uploaded: 0, skipped: files.length };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  },
};
