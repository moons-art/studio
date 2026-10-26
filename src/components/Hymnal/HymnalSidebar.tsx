import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal, type Album } from '../../stores/HymnalProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, 
  UploadCloud,
  FilePlus,
  FolderUp,
  Settings,
  HelpCircle,
  FolderPlus,
  Trash2,
  Check,
  MoreVertical,
  Plus,
  X,
  Download,
  Upload,
  Eraser
} from 'lucide-react';
import { hymnalApi } from '../../api/hymnalApi';
import { logActivity } from '../../utils/logger';
import { TooltipIcon } from '../TooltipIcon';
import { getIsHymnalVisible, getUserPlan } from '../../utils/adminConfig';
import { auth } from '../../api/firebaseConfig';

export const HymnalSidebar: React.FC = () => {
  const uploadStartTimeRef = useRef<number | null>(null);
  const [albumNameInput, setAlbumNameInput] = useState('');
  const { 
    albums,
    setAlbums,
    songs,
    setSongs,
    activeAlbumId, 
    setActiveAlbumId,
    editingAlbum,
    setEditingAlbum,
    showAlbumModal,
    setShowAlbumModal,
    isSyncing,
    setIsSyncing,
    fetchSongs,
    deleteAlbum,
    updateAlbum,
    showAllTooltips,
    setShowAllTooltips,
    exportCSV,
    importCSV,
    uploadProgress,
    setUploadProgress
  } = useHymnal();

  useEffect(() => {
    if (editingAlbum) {
      setAlbumNameInput(editingAlbum.name);
    }
  }, [editingAlbum]);

  // 찬송가 사이드바 노출 상태 및 사용자 플랜 (관리자 대시보드와 실시간 연동)
  const [isHymnalVisible, setIsHymnalVisible] = useState(getIsHymnalVisible());
  const [userPlan, setUserPlan] = useState(getUserPlan());
  const [showAlbumSelectModal, setShowAlbumSelectModal] = useState(false);
  const [albumModalAction, setAlbumModalAction] = useState<'add_song' | 'excel_download' | 'excel_upload'>('add_song');

  // 앨범별 곡 수 실시간 집계
  const albumSongCountMap = useMemo(() => {
    const map = new Map<string, number>();
    let totalCount = 0;
    songs.forEach((s) => {
      // 찬송가가 비활성화된 경우 찬송가(hymnal) 곡은 전체 수에서도 제외
      if (!isHymnalVisible && (s.albumId === 'hymnal' || (!s.albumId && s.id?.startsWith('hymnal_')))) {
        return;
      }
      totalCount++;
      const aId = s.albumId || 'misc';
      map.set(aId, (map.get(aId) || 0) + 1);
    });
    map.set('all', totalCount);
    return map;
  }, [songs, isHymnalVisible]);

  useEffect(() => {
    const handleConfigChange = () => {
      setIsHymnalVisible(getIsHymnalVisible());
      setUserPlan(getUserPlan());
    };
    window.addEventListener('admin_config_changed', handleConfigChange);
    return () => window.removeEventListener('admin_config_changed', handleConfigChange);
  }, []);

  // 악보 업로드 중 페이지 이탈(새로고침 / 탭 닫기) 방지
  useEffect(() => {
    if (!isSyncing && !uploadProgress) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '악보 업로드가 진행 중입니다. 페이지를 벗어나면 작업이 중단됩니다.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSyncing, uploadProgress]);

  const isFreeUser = userPlan === 'free';

  const isAuthenticated = !!(auth.currentUser || localStorage.getItem('gdrive_token') || localStorage.getItem('nations_recent_login_provider') || localStorage.getItem('offline_user_profile'));

  // 앨범 비우기 (앨범은 유지하고 해당 앨범 안의 곡들만 모두 삭제)
  const handleClearAlbum = async (albumId: string, albumName: string) => {
    const albumSongs = songs.filter(s => s.albumId === albumId);
    if (albumSongs.length === 0) {
      alert(`'${albumName}' 앨범에 등록된 곡이 없습니다.`);
      return;
    }

    if (!confirm(`'${albumName}' 앨범에 속한 모든 악보(${albumSongs.length}곡)를 비우시겠습니까?\n(앨범은 그대로 유지되고 악보들만 삭제됩니다.)`)) {
      return;
    }

    // 1. 낙관적 UI 업데이트 (해당 앨범 곡 즉시 필터링)
    setSongs(prev => prev.filter(s => s.albumId !== albumId));

    // 2. 백그라운드에서 해당 곡들 순차 삭제
    for (const song of albumSongs) {
      const targetFileId = (song as any)?.fileId;
      const targetStorageUrl = (song as any)?.storageUrl || (song as any)?.filePath;
      hymnalApi.deleteSong(song.id, true, targetFileId, targetStorageUrl).catch(e => {
        console.error('[HymnalSidebar] clearAlbum song delete failed:', e);
      });
    }

    logActivity('앨범 비우기', `'${albumName}' 앨범의 악보 ${albumSongs.length}곡 비움`);
  };

  // 앨범 삭제 (앨범 자체와 포함된 곡들 삭제)
  const handleDeleteAlbumDirect = async (albumId: string, albumName: string) => {
    if (!confirm(`'${albumName}' 앨범과 포함된 모든 악보를 삭제하시겠습니까?\n(삭제 후 복구되지 않습니다.)`)) {
      return;
    }
    await deleteAlbum(albumId);
    logActivity('앨범 삭제', `'${albumName}' 앨범 삭제`);
  };

  // 대량 앨범 업로드 처리
  const handleAlbumUpload = async (isHymnal: boolean = false, targetAlbum?: Album) => {
    if (!isAuthenticated) {
      alert('악보를 추가하려면 먼저 로그인해야 합니다. 왼쪽 사이드바 상단에서 로그인해 주세요.');
      return;
    }
    try {
      const files = await hymnalApi.selectFolderForAlbum();
      if (!files || files.length === 0) return;
      
      const albumName = targetAlbum ? targetAlbum.name : (isHymnal ? '새찬송가' : prompt('업로드할 앨범 이름을 입력해주세요:', '새 앨범'));
      if (!albumName) return;

      const albumId = targetAlbum ? targetAlbum.id : (isHymnal ? 'hymnal' : albumName);

      // 1. 이미 해당 앨범에 등록된 곡들의 파일명(타이틀) Set 생성
      const targetAlbumSongs = songs.filter(s => s.albumId === albumId);
      const existingTitles = new Set(targetAlbumSongs.map(s => s.title));

      // 2. 선택한 폴더 내 파일 중 이미 등록된 파일명을 가진 파일 제외 (중복 건너뛰기)
      const filesToUpload = files.filter(file => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) return false;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        return !existingTitles.has(fileName);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 폴더의 모든 악보가 이미 앨범에 등록되어 있어 업로드를 건너뜁니다.');
        return;
      }

      setIsSyncing(true);
      uploadStartTimeRef.current = Date.now();
      setUploadProgress({ processed: 0, total: filesToUpload.length });

      // 신규 추가된 파일들만 선별하여 구글 드라이브 업로드 수행 (데이터베이스 json 수정 안함)
      const newSongs = await hymnalApi.batchUploadImagesToGDrive(filesToUpload, albumName, (processed, total) => {
        setUploadProgress({ processed, total });
      }, albumId);

      // 3. 앨범 목록 업데이트
      if (!albums.find(a => a.id === albumId)) {
        const newAlbums = [...albums, { id: albumId, name: albumName }];
        setAlbums(newAlbums);
        await hymnalApi.saveSettings({ albums: newAlbums });
        try {
          const { gdriveWebService } = await import('../../api/gdriveWebService');
          if (gdriveWebService.getAccessToken()) {
            await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
          }
        } catch {}
      }

      // 4. 즉각적인 UI 반영 (구글 드라이브 검색 색인 지연 우회)
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      await fetchSongs();
      setActiveAlbumId(albumId);

      alert(`${filesToUpload.length}개의 신규 악보 업로드가 완료되었습니다! (중복된 ${files.length - filesToUpload.length}개 파일 건너뜀)`);
      logActivity('앨범 추가', `새 앨범 업로드: ${filesToUpload.length}곡`);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
      setUploadProgress(null);
      uploadStartTimeRef.current = null;
    }
  };

  // 낱개 파일 추가 처리 (선택된 앨범으로 업로드)
  const handleSingleFileUpload = async (targetAlbum?: { id: string; name: string }) => {
    const targetAlbumId = targetAlbum?.id || 'misc';
    const targetAlbumName = targetAlbum?.name || '미분류';

    try {
      const files = await hymnalApi.selectMultipleFiles();
      if (!files || files.length === 0) return;

      // 1. 이미지 파일 선별 (중복 파일이라도 사용자 업로드 허용)
      const filesToUpload = files.filter(file => {
        return file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 파일 중 이미지(.jpg, .png, .webp) 악보가 없습니다.');
        return;
      }

      setIsSyncing(true);
      uploadStartTimeRef.current = Date.now();
      // 진행바를 즉시 화면에 띄우기 위해 0/N 초기 상태 즉시 세팅
      setUploadProgress({ processed: 0, total: filesToUpload.length });
      
      // 2. 신규 악보 WebP 압축 및 R2 / Firestore 업로드
      const newSongs = await hymnalApi.batchUploadImagesToGDrive(
        filesToUpload, 
        targetAlbumName, 
        (processed, total) => {
          setUploadProgress({ processed, total });
        },
        targetAlbumId
      );

      // 100% 완료 상태 유지 후 UI 피드백 제공
      setUploadProgress({ processed: filesToUpload.length, total: filesToUpload.length });
      await new Promise(r => setTimeout(r, 600));

      // 3. 대상 앨범으로 뷰 자동 이동 및 노래 목록 즉시 동기화
      setActiveAlbumId(targetAlbumId);
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      await fetchSongs();
      setActiveAlbumId(targetAlbumId);

      alert(`[${targetAlbumName}]에 ${newSongs?.length || filesToUpload.length}개의 신규 악보가 안전하게 저장되었습니다!`);
      logActivity('악보 추가', `${targetAlbumName} 악보 추가: ${filesToUpload.length}곡`);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
      setUploadProgress(null);
      uploadStartTimeRef.current = null;
    }
  };

  const calculateEstimatedSeconds = () => {
    if (!uploadProgress || uploadProgress.total === 0) return 0;
    const remaining = uploadProgress.total - uploadProgress.processed;
    if (remaining <= 0) return 0;

    if (uploadStartTimeRef.current && uploadProgress.processed > 0) {
      const elapsed = (Date.now() - uploadStartTimeRef.current) / 1000;
      const perItem = elapsed / uploadProgress.processed;
      return Math.max(1, Math.round(remaining * perItem));
    }
    return Math.max(1, remaining * 1);
  };

  const handleOpenAlbumModal = (action: 'add_song' | 'excel_download' | 'excel_upload') => {
    setAlbumModalAction(action);
    setShowAlbumSelectModal(true);
  };

  const handleAlbumSelectConfirm = (album: { id: string; name: string }) => {
    setShowAlbumSelectModal(false);
    if (albumModalAction === 'add_song') {
      handleSingleFileUpload(album);
    } else if (albumModalAction === 'excel_download') {
      exportCSV(album.id, album.name);
    } else if (albumModalAction === 'excel_upload') {
      importCSV(album.id, album.name);
    }
  };

  const isUploading = isSyncing || !!uploadProgress;

  return (
    <div className="space-y-4">
      {/* 앨범 목록 섹션 */}
      <div>
        <div className="text-[11px] font-medium text-[#8C877D] px-1 mb-1.5 flex items-center justify-between">
          <span>앨범목록</span>
          <span className="text-[10px] text-[#8C877D]">
            {isFreeUser 
              ? (isHymnalVisible ? 2 : 1) 
              : (albums.filter(a => a.id !== 'hymnal' && a.id !== 'misc').length + 1 + (isHymnalVisible ? 1 : 0))
            }
          </span>
        </div>
        
        <div className="space-y-0.5">
          {/* 앨범 버튼: 프리 사용자 또는 업로드 중에는 비활성화 */}
          <div className="relative group/addalbum mb-1">
            <button 
              onClick={() => {
                if (isFreeUser || isUploading) return;
                handleAlbumUpload(false);
              }}
              disabled={isFreeUser || isUploading}
              className={`w-full hidden md:flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all ${
                (isFreeUser || isUploading)
                  ? 'opacity-60 bg-[#F5F2EB]/50 text-[#8C877D] cursor-not-allowed' 
                  : 'text-[#4A4741] hover:bg-[#F3EFE9] cursor-pointer'
              }`}
            >
              <Plus className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
              <span className="flex-1 text-left font-medium">앨범</span>
              
              {/* 세점 아이콘 (마우스 호버 시 이유 표시) */}
              <div 
                className="p-1 rounded-md text-[#8C877D] hover:text-[#2B2927] transition-colors relative"
                title="Free 플랜은 기본 1개 앨범만 이용 가능합니다. SOLO / TEAM 플랜으로 업그레이드 시 앨범 라이브러리를 무제한 생성할 수 있습니다."
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* 프리 사용자 안내 말풍선 (메뉴 아래쪽에 노출되도록 top-full mt-2 적용) */}
            {isFreeUser && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover/addalbum:block z-50 w-56 p-2.5 bg-neutral-900 text-white text-[11px] rounded-xl shadow-xl leading-relaxed pointer-events-none animate-in fade-in zoom-in-95">
                <p className="font-bold text-[#E28A6D] mb-0.5">SOLO / TEAM 플랜 전용 기능</p>
                <p className="text-neutral-300">
                  Free 플랜은 기본 앨범 1개만 이용 가능합니다. SOLO / TEAM 플랜 업그레이드 시 앨범 라이브러리를 무제한 추가할 수 있습니다.
                </p>
              </div>
            )}
          </div>

          {/* 전체 */}
          <div 
            onClick={() => setActiveAlbumId('all')}
            className={`
              group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150
              ${activeAlbumId === 'all' 
                ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                : 'hover:bg-[#F3EFE9] text-[#4A4741]'}
            `}
          >
            <div className={`
              w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors
              ${activeAlbumId === 'all' ? 'bg-[#524E48] border-[#524E48]' : 'border-[#C2BBB0] bg-white'}
            `}>
              {activeAlbumId === 'all' && <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />}
            </div>
            <span className="flex-1 text-xs tracking-tight truncate leading-tight">전체</span>
            <span className="text-[10px] font-semibold text-[#8C877D] ml-auto shrink-0 bg-[#E8E2D8]/60 px-1.5 py-0.5 rounded-md">
              {albumSongCountMap.get('all') || 0}
            </span>
          </div>

          {/* 새찬송가 (사이드바에서 완전히 가려주고, 대시보드에서 ON 시에만 열림) */}
          {isHymnalVisible && (
            <div 
              onClick={() => setActiveAlbumId('hymnal')}
              className={`
                group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150
                ${activeAlbumId === 'hymnal' 
                  ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                  : 'hover:bg-[#F3EFE9] text-[#4A4741]'}
              `}
            >
              <div className={`
                w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors
                ${activeAlbumId === 'hymnal' ? 'bg-[#524E48] border-[#524E48]' : 'border-[#C2BBB0] bg-white'}
              `}>
                {activeAlbumId === 'hymnal' && <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />}
              </div>
              <span className="flex-1 text-xs tracking-tight truncate leading-tight">새찬송가</span>
              <span className="text-[10px] font-semibold text-[#8C877D] ml-auto shrink-0 bg-[#E8E2D8]/60 px-1.5 py-0.5 rounded-md">
                {albumSongCountMap.get('hymnal') || 0}
              </span>
            </div>
          )}

          {/* 미분류 */}
          <div 
            onClick={() => setActiveAlbumId('misc')}
            className={`
              group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150
              ${activeAlbumId === 'misc' 
                ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                : 'hover:bg-[#F3EFE9] text-[#4A4741]'}
            `}
          >
            <div className={`
              w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors
              ${activeAlbumId === 'misc' ? 'bg-[#524E48] border-[#524E48]' : 'border-[#C2BBB0] bg-white'}
            `}>
              {activeAlbumId === 'misc' && <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />}
            </div>
            <span className="flex-1 text-xs tracking-tight truncate leading-tight">미분류</span>
            <span className="text-[10px] font-semibold text-[#8C877D] ml-auto shrink-0 bg-[#E8E2D8]/60 px-1.5 py-0.5 rounded-md">
              {albumSongCountMap.get('misc') || 0}
            </span>

            {/* 미분류 앨범 비우기 버튼 */}
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                handleClearAlbum('misc', '미분류');
              }}
              className="p-1 hover:bg-[#DED8CE]/80 text-[#8C877D] hover:text-[#C96442] rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100 shrink-0"
              title="'미분류' 앨범 비우기 (악보만 모두 삭제)"
            >
              <Eraser className="w-3.5 h-3.5 stroke-[1.8px]" />
            </button>
          </div>

          {/* 그 외 개별 커스텀 앨범 목록 (프리 사용자는 미분류 1개만 보이고 커스텀 앨범 숨김) */}
          {!isFreeUser && albums.filter(album => album.id !== 'hymnal' && album.id !== 'misc').map((album) => (
            <div 
              key={album.id}
              onClick={() => setActiveAlbumId(album.id)}
              className={`
                group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150
                ${activeAlbumId === album.id 
                  ? 'bg-[#EBE5DC] text-[#2B2927] font-medium' 
                  : 'hover:bg-[#F3EFE9] text-[#4A4741]'}
              `}
            >
              <div className={`
                w-4 h-4 shrink-0 rounded-full border flex items-center justify-center transition-colors
                ${activeAlbumId === album.id ? 'bg-[#524E48] border-[#524E48]' : 'border-[#C2BBB0] bg-white'}
              `}>
                {activeAlbumId === album.id && <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />}
              </div>
              
              <span className="flex-1 text-xs tracking-tight truncate leading-tight">
                {album.name}
              </span>

              <span className="text-[10px] font-semibold text-[#8C877D] ml-auto mr-1 shrink-0 bg-[#E8E2D8]/60 px-1.5 py-0.5 rounded-md">
                {albumSongCountMap.get(album.id) || 0}
              </span>

              {/* 심플 퀵 액션 버튼들 (앨범 비우기 & 앨범 삭제 & 상세설정) */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {/* 앨범 비우기 (Eraser) */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearAlbum(album.id, album.name);
                  }}
                  className="p-1 hover:bg-[#DED8CE]/80 text-[#8C877D] hover:text-[#C96442] rounded-md transition-colors cursor-pointer"
                  title={`'${album.name}' 앨범 비우기 (악보만 모두 삭제)`}
                >
                  <Eraser className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                {/* 앨범 삭제 (Trash2) */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAlbumDirect(album.id, album.name);
                  }}
                  className="p-1 hover:bg-[#FAF0EB] text-[#8C877D] hover:text-red-600 rounded-md transition-colors cursor-pointer"
                  title={`'${album.name}' 앨범 완전 삭제`}
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>

                {/* 상세 설정 (MoreVertical) */}
                <button 
                  disabled={isUploading}
                  onClick={(e) => {
                    if (isUploading) return;
                    e.stopPropagation();
                    setEditingAlbum(album);
                    setShowAlbumModal(true);
                  }}
                  className="p-1 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#DED8CE]/60 rounded-md transition-colors cursor-pointer"
                  title="앨범 이름 수정 및 추가 설정"
                >
                  <MoreVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 악보추가 섹션 */}
      <div className="pt-2 border-t border-[#F0EBE1]">
        <div className="text-[11px] font-medium text-[#8C877D] px-1 mb-1.5">
          악보추가
        </div>

        <div className="space-y-0.5">
          {/* 앨범에 추가 (누르면 앨범 선택 팝업 먼저 노출) */}
          <button 
            type="button"
            onClick={() => handleOpenAlbumModal('add_song')}
            disabled={isUploading}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all group ${
              isUploading
                ? 'opacity-40 text-neutral-400 bg-neutral-100/50 cursor-not-allowed'
                : 'text-[#4A4741] hover:bg-[#F3EFE9] cursor-pointer'
            }`}
          >
            <FilePlus className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left">앨범에 추가</span>
            <TooltipIcon text={isUploading ? "악보 업로드가 진행 중입니다." : "악보를 추가할 앨범을 선택하여 이미지를 등록합니다."} />
          </button>

          {/* 업로드 진행 표시기: 업로드 중... 검은 얇은 가로바, %, 예상 초, 검은색 이동 점, 처리된 수/총악보수 */}
          {uploadProgress && (
            <div className="mx-1 my-1.5 p-2.5 bg-[#FAF9F5] border border-[#E8E2D9] rounded-xl shadow-2xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between text-neutral-900 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                  <span className="text-[11px] font-bold text-black tracking-tight">업로드 중...</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800">
                  {/* 처리된 수 / 총악보수 강조 표시 */}
                  <span className="font-extrabold text-black bg-neutral-100 px-1.5 py-0.5 rounded-md border border-neutral-300 text-[11px] tracking-tight">
                    {uploadProgress.processed} / {uploadProgress.total}
                  </span>
                  <span className="font-bold text-black text-[11px]">
                    {Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%
                  </span>
                </div>
              </div>

              {/* 검은 얇은 가로바 & 검은색 점으로 이동하는 바 */}
              <div className="relative w-full h-[2.5px] bg-neutral-200 rounded-full my-2">
                {/* 검은 얇은 가로 채움 바 */}
                <div 
                  className="h-full bg-black rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, (uploadProgress.processed / uploadProgress.total) * 100)}%` }}
                />
                {/* 검은색 점 (이동 닷) */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-black rounded-full shadow-xs transition-all duration-300 ease-out flex items-center justify-center pointer-events-none"
                  style={{ left: `${Math.min(100, Math.max(0, (uploadProgress.processed / uploadProgress.total) * 100))}%` }}
                >
                  <div className="w-0.5 h-0.5 bg-white rounded-full opacity-80" />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#8C877D] mt-1 px-0.5">
                <span className="font-medium text-neutral-700">
                  {uploadProgress.processed} / {uploadProgress.total} 악보 완료
                </span>
                <span className="text-[#8C877D]">
                  예상 {calculateEstimatedSeconds()}초 남음
                </span>
              </div>

              {/* 진행바 아래 설명글: 앱을 끄거나 로그아웃하면 중단됩니다. 검은색 작은 글자 */}
              <div className="mt-2 pt-1.5 border-t border-neutral-200/60 flex items-center justify-center gap-1 text-[10px] font-bold text-black tracking-tight select-none">
                <span>앱을 끄거나 로그아웃하면 중단됩니다.</span>
              </div>
            </div>
          )}

          {/* 구분선 */}
          <div className="my-1 border-t border-[#F0EBE1]" />

          {/* 앨범 엑셀 다운로드 (세점) */}
          <button 
            type="button"
            onClick={() => handleOpenAlbumModal('excel_download')}
            disabled={isUploading}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all group ${
              isUploading
                ? 'opacity-40 text-neutral-400 bg-neutral-100/50 cursor-not-allowed'
                : 'text-[#4A4741] hover:bg-[#F3EFE9] cursor-pointer'
            }`}
          >
            <Download className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left">앨범 엑셀 다운로드</span>
            <TooltipIcon text={isUploading ? "업로드 중에는 엑셀 다운로드가 제한됩니다." : "선택한 앨범의 악보정보를 일괄 다운로드합니다."} />
          </button>

          {/* 앨범 엑셀 업로드 (세점) */}
          <button 
            type="button"
            onClick={() => handleOpenAlbumModal('excel_upload')}
            disabled={isUploading}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal transition-all group ${
              isUploading
                ? 'opacity-40 text-neutral-400 bg-neutral-100/50 cursor-not-allowed'
                : 'text-[#4A4741] hover:bg-[#F3EFE9] cursor-pointer'
            }`}
          >
            <Upload className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left">앨범 엑셀 업로드</span>
            <TooltipIcon text={isUploading ? "업로드 중에는 엑셀 업로드가 제한됩니다." : "선택한 앨범에 악보정보를 일괄 업로드합니다."} />
          </button>
        </div>
      </div>

      {/* 앨범 설정 모달 */}
      {createPortal(
        <AnimatePresence>
          {showAlbumModal && editingAlbum && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowAlbumModal(false)}
                className="absolute inset-0 bg-[#2B2927]/40 backdrop-blur-xs" 
              />
              <motion.div 
                initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }}
                className="relative w-full max-w-sm bg-[#FBF9F7] rounded-2xl shadow-xl overflow-hidden border border-[#EBE6DF]"
              >
                {/* Header */}
                <div className="px-5 py-4 border-b border-[#F0EBE1] bg-[#F8F6F1] flex items-center justify-between">
                  <h3 className="font-serif text-base font-bold text-[#2B2927]">
                    앨범 설정
                  </h3>
                  <button 
                    onClick={() => setShowAlbumModal(false)}
                    className="p-1 hover:bg-[#ECE7DF] rounded-lg text-[#8C877D] hover:text-[#2B2927] cursor-pointer transition-colors"
                  >
                    <Settings className="w-4 h-4 stroke-[1.5px]" />
                  </button>
                </div>
                
                <div className="p-5 space-y-4">
                  {/* 앨범 이름 수정 */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#8C877D] uppercase tracking-wider">앨범 이름 수정</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={albumNameInput}
                        onChange={(e) => setAlbumNameInput(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-[#E5E0D8] rounded-xl text-xs font-normal text-[#2B2927] focus:outline-none focus:border-[#524E48] transition-all min-w-0"
                      />
                      <button 
                        onClick={async () => {
                          if (!albumNameInput.trim()) return;
                          if (albumNameInput !== editingAlbum.name) {
                            const oldName = editingAlbum.name;
                            updateAlbum({ ...editingAlbum, name: albumNameInput });
                            const { gdriveWebService } = await import('../../api/gdriveWebService');
                            try {
                              await gdriveWebService.renameFolder(`CEUM_Album_${oldName}`, `CEUM_Album_${albumNameInput}`);
                            } catch(e) { console.log('Folder rename skipped or failed', e); }
                            alert('앨범 이름이 성공적으로 수정되었습니다.');
                            setShowAlbumModal(false);
                          }
                        }}
                        className="px-4 py-2 bg-[#524E48] text-white rounded-xl text-xs font-medium hover:bg-[#3D3A36] transition-all whitespace-nowrap cursor-pointer shadow-2xs"
                      >
                        저장
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-[#F0EBE1] w-full" />

                  {/* 메뉴 버튼들 */}
                  <div className="space-y-2">
                    <button 
                      onClick={() => {
                        alert('빈 폴더에 추가 하고 싶은 악보들을 넣고 업로드 버튼을 누르세요');
                        handleAlbumUpload(false, editingAlbum);
                        setShowAlbumModal(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-white hover:bg-[#F3EFE9] border border-[#E5E0D8] text-[#4A4741] rounded-xl transition-all group text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center">
                        <FolderPlus className="w-4 h-4 text-[#D97757] stroke-[1.8px]" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-medium text-[#2B2927]">기존 앨범에 악보 추가</span>
                        <span className="text-[10px] text-[#8C877D] truncate">이 앨범에 새 악보들을 병합합니다</span>
                      </div>
                    </button>

                    {/* 엑셀로 악보 제목/가사/코드 일괄 편집 */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button 
                        type="button"
                        onClick={() => {
                          exportCSV(editingAlbum.id, editingAlbum.name);
                        }}
                        className="flex items-center justify-center gap-1.5 p-2.5 bg-white hover:bg-[#F3EFE9] border border-[#E5E0D8] text-[#2C2B29] rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                        title="이 앨범의 악보 목록(제목, 가사 등)을 엑셀로 다운로드"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>엑셀 다운로드</span>
                      </button>

                      <button 
                        type="button"
                        onClick={async () => {
                          await importCSV(editingAlbum.id, editingAlbum.name);
                          setShowAlbumModal(false);
                        }}
                        className="flex items-center justify-center gap-1.5 p-2.5 bg-white hover:bg-[#F3EFE9] border border-[#E5E0D8] text-[#2C2B29] rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                        title="편집한 엑셀 파일(.xlsx, .csv)을 업로드하여 악보 정보 일괄 갱신"
                      >
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>엑셀 업로드</span>
                      </button>
                    </div>
                    
                    {/* 앨범 비우기 */}
                    <button 
                      onClick={() => {
                        handleClearAlbum(editingAlbum.id, editingAlbum.name);
                        setShowAlbumModal(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-white hover:bg-[#FAF9F5] border border-[#E5E0D8] text-[#4A4741] rounded-xl transition-all group text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center">
                        <Eraser className="w-4 h-4 text-[#C96442] stroke-[1.8px]" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-medium text-[#2B2927]">앨범 비우기</span>
                        <span className="text-[10px] text-[#8C877D] truncate">앨범은 유지하고 안의 악보들만 모두 삭제합니다</span>
                      </div>
                    </button>

                    {/* 앨범 완전 삭제 */}
                    <button 
                      onClick={() => {
                        if (confirm('<주의!> 구글드라이브의 해당 폴더와 파일이 삭제 되어 복구되지 않습니다.\n정말로 삭제하시겠습니까?')) {
                          deleteAlbum(editingAlbum.id);
                          setShowAlbumModal(false);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-[#F7EEE9] hover:bg-[#F2DFD5] border border-[#F0DCD3] text-[#D97757] rounded-xl transition-all group text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-white border border-[#F0DCD3] flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-[#D97757] stroke-[1.8px]" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-medium text-[#D97757]">앨범 삭제하기</span>
                        <span className="text-[10px] text-[#D97757]/80 truncate">이 앨범과 모든 악보를 삭제합니다</span>
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 앨범 선택 - 심플 팝업 모달 (검은색 글자) */}
      {showAlbumSelectModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-300 text-neutral-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h3 className="text-base font-bold text-neutral-900 tracking-tight">
                {albumModalAction === 'add_song' && '악보를 추가할 앨범 선택'}
                {albumModalAction === 'excel_download' && '엑셀 다운로드 앨범 선택'}
                {albumModalAction === 'excel_upload' && '엑셀 업로드 대상 앨범 선택'}
              </h3>
              <button 
                onClick={() => setShowAlbumSelectModal(false)}
                className="p-1 text-neutral-400 hover:text-black rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-neutral-900" />
              </button>
            </div>

            {/* 팝업 설명 문구 */}
            {albumModalAction === 'excel_upload' ? (
              <div className="mt-2.5 mb-4 p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs text-neutral-700 space-y-1.5">
                <div className="flex items-start gap-1.5 font-medium text-neutral-800 leading-snug">
                  <span className="text-[#D97757] font-bold shrink-0">1.</span>
                  <span>먼저 악보를 앨범에 올리면 엑셀이 생성됩니다.</span>
                </div>
                <div className="flex items-start gap-1.5 font-medium text-neutral-800 leading-snug">
                  <span className="text-[#D97757] font-bold shrink-0">2.</span>
                  <span>앨범에서 엑셀을 다운로드 합니다.</span>
                </div>
                <div className="flex items-start gap-1.5 font-medium text-neutral-800 leading-snug">
                  <span className="text-[#D97757] font-bold shrink-0">3.</span>
                  <span>다운로드한 엑셀을 편집한후 다시 업로드 합니다.</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-600 mt-2.5 mb-4 leading-relaxed">
                {albumModalAction === 'add_song' && '파일 제목을 찬양이름으로 수정하여 올리세요'}
                {albumModalAction === 'excel_download' && '선택한 앨범의 악보 정보를 엑셀로 다운로드합니다.'}
              </p>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">

              {/* 미분류 앨범 (기본) */}
              <button
                type="button"
                onClick={() => handleAlbumSelectConfirm({ id: 'misc', name: '미분류' })}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all text-left cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-neutral-900"></div>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">미분류</div>
                    <div className="text-[11px] text-neutral-500">기본 악보 보관함</div>
                  </div>
                </div>
                <span className="text-xs font-bold text-neutral-900 group-hover:translate-x-0.5 transition-transform">
                  선택 →
                </span>
              </button>

              {/* 찬송가 앨범 (관리자가 ON 했을 때만 노출) */}
              {isHymnalVisible && (
                <button
                  type="button"
                  onClick={() => handleAlbumSelectConfirm({ id: 'hymnal', name: '새찬송가' })}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all text-left cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-neutral-900"></div>
                    <div>
                      <div className="text-sm font-bold text-neutral-900">새찬송가</div>
                      <div className="text-[11px] text-neutral-500">찬송가 앨범</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-neutral-900 group-hover:translate-x-0.5 transition-transform">
                    선택 →
                  </span>
                </button>
              )}

              {/* 커스텀 앨범들 (프리 유저가 아닐 때 선택 가능) */}
              {!isFreeUser && albums.filter(a => a.id !== 'hymnal' && a.id !== 'misc').map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleAlbumSelectConfirm({ id: a.id, name: a.name })}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-all text-left cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-neutral-900"></div>
                    <div className="text-sm font-bold text-neutral-900 truncate max-w-[180px]">
                      {a.name}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-neutral-900 group-hover:translate-x-0.5 transition-transform">
                    선택 →
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 pt-3 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAlbumSelectModal(false)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
