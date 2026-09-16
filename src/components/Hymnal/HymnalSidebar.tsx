import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal } from '../../stores/HymnalProvider';
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
  Plus
} from 'lucide-react';
import { hymnalApi } from '../../api/hymnalApi';
import { logActivity } from '../../utils/logger';
import { TooltipIcon } from '../TooltipIcon';

export const HymnalSidebar: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null);
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
    setShowAllTooltips
  } = useHymnal();

  useEffect(() => {
    if (editingAlbum) {
      setAlbumNameInput(editingAlbum.name);
    }
  }, [editingAlbum]);

  const isAuthenticated = !!localStorage.getItem('gdrive_token');

  // 대량 앨범 업로드 처리
  const handleAlbumUpload = async (isHymnal: boolean = false, targetAlbum?: Album) => {
    if (!isAuthenticated) {
      alert('악보를 추가하려면 구글 계정으로 로그인해야 합니다. 왼쪽 사이드바 상단에서 로그인해 주세요.');
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
      // 신규 추가된 파일들만 선별하여 구글 드라이브 업로드 수행 (데이터베이스 json 수정 안함)
      const newSongs = await hymnalApi.batchUploadImagesToGDrive(filesToUpload, albumName, (processed, total) => {
        setUploadProgress({ processed, total });
      }, albumId);

      // 3. 앨범 목록 업데이트
      if (!albums.find(a => a.id === albumId)) {
        const newAlbums = [...albums, { id: albumId, name: albumName }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 즉각적인 UI 반영 (구글 드라이브 검색 색인 지연 우회)
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      alert(`${filesToUpload.length}개의 신규 악보 업로드가 완료되었습니다! (중복된 ${files.length - filesToUpload.length}개 파일 건너뜀)`);
      logActivity('앨범 추가', `새 앨범 업로드: ${filesToUpload.length}곡`);
      
      // 5. 노래 목록을 실시간 드라이브 파일 스캔을 통해 완전 리로드 (지연 실행)
      setTimeout(() => fetchSongs(), 3000);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
      setUploadProgress(null);
    }
  };

  // 낱개 파일 추가 처리
  const handleSingleFileUpload = async () => {
    if (!isAuthenticated) {
      alert('악보를 추가하려면 구글 계정으로 로그인해야 합니다. 왼쪽 사이드바 상단에서 로그인해 주세요.');
      return;
    }
    try {
      const files = await hymnalApi.selectMultipleFiles();
      if (!files || files.length === 0) return;

      // 1. 이미 등록된 곡(미분류) 목록을 대조하여 중복 업로드 필터링
      const miscSongs = songs.filter(s => s.albumId === 'misc');
      const existingTitles = new Set(miscSongs.map(s => s.title));

      const filesToUpload = files.filter(file => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) return false;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        return !existingTitles.has(fileName);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 모든 파일이 이미 미분류에 등록되어 있어 업로드를 건너뜁니다.');
        return;
      }

      setIsSyncing(true);
      
      // 2. 신규 악보만 구글 드라이브에 업로드 (Albums/미분류 폴더에 저장됨)
      const newSongs = await hymnalApi.uploadSingleImagesToGDrive(filesToUpload, (processed, total) => {
        // progress callback
      });

      // 3. 앨범 목록 연동 (미분류 카테고리 1회 활성화)
      if (!albums.find(a => a.id === 'misc')) {
        const newAlbums = [...albums, { id: 'misc', name: '미분류' }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 즉각적인 UI 반영 (구글 드라이브 검색 색인 지연 시간 우회)
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      alert(`${filesToUpload.length}개의 신규 파일 업로드가 완료되었습니다! (중복 ${files.length - filesToUpload.length}개 건너뜀)`);
      logActivity('악보 추가', `미분류 낱개 악보 추가: ${filesToUpload.length}곡`);
      
      // 5. 완벽한 백그라운드 동기화는 약간의 지연 후 실행
      setTimeout(() => fetchSongs(), 3000);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 앨범 목록 섹션 */}
      <div>
        <div className="text-[11px] font-medium text-[#8C877D] px-1 mb-1.5 flex items-center justify-between">
          <span>앨범목록</span>
          <span className="text-[10px] text-[#8C877D]">{albums.filter(a => a.id !== 'hymnal' && a.id !== 'misc').length + 3}</span>
        </div>
        
        <div className="space-y-0.5">
          {/* 앨범 버튼 (+글자 삭제, 아이콘 유지) - 모바일 숨김 */}
          <button 
            onClick={() => handleAlbumUpload(false)}
            disabled={isSyncing}
            className="w-full hidden md:flex items-center gap-2 px-2.5 py-2 mb-1 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all group disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left font-medium">앨범</span>
            <TooltipIcon text="새로운 폴더를 통째로 업로드하여 새 앨범을 만듭니다." />
          </button>

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
          </div>

          {/* 새찬송가 */}
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
          </div>

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
          </div>

          {/* 그 외 개별 커스텀 앨범 목록 */}
          {albums.filter(album => album.id !== 'hymnal' && album.id !== 'misc').map((album) => (
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

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAlbum(album);
                  setShowAlbumModal(true);
                }}
                className="p-1 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#DED8CE]/60 rounded-md transition-all opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
                title="앨범 설정"
              >
                <MoreVertical className="w-3.5 h-3.5 stroke-[1.8px]" />
              </button>
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
          {/* 앨범에 추가 */}
          <button 
            onClick={handleSingleFileUpload}
            disabled={isSyncing}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all group disabled:opacity-50 cursor-pointer"
          >
            <FilePlus className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left">앨범에 추가</span>
            <TooltipIcon text="기기 내부 악보 파일을 선택해 앨범에 추가합니다." />
          </button>

          {/* 찬송가 추가 - 모바일 숨김 */}
          <button 
            onClick={() => handleAlbumUpload(true)}
            disabled={isSyncing}
            className="w-full hidden md:flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-normal text-[#4A4741] hover:bg-[#F3EFE9] transition-all group disabled:opacity-50 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
            <span className="flex-1 text-left">찬송가 추가</span>
            <TooltipIcon text="찬송가 악보 폴더를 선택하여 업로드합니다 (최초 1회)" />
          </button>
        </div>

        {/* 악보 삭제 안내 - 모바일 숨김 */}
        <div className="pt-1.5 hidden md:block">
          <div className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-normal text-[#8C877D] bg-[#F3EFE9]/50 border border-[#E8E2D9]">
            <span className="flex-1 text-left text-[#D97757] font-medium">+ 악보 삭제 안내</span>
            <TooltipIcon text="우측 악보 화면에서 상세편집 버튼을 눌러 개별 악보를 지울 수 있습니다." />
          </div>
        </div>
      </div>

      {/* 진행률 표시기 */}
      {uploadProgress && (
        <div className="p-3 bg-[#2C2B29] text-white rounded-xl shadow-lg border border-[#4A4844] animate-in fade-in slide-in-from-bottom-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-medium text-[#FAF9F5]">업로드 진행 중</span>
            <span className="text-xs font-bold text-[#EBE5DC]">{Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#4A4844] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#D97757] transition-all duration-300"
              style={{ width: `${(uploadProgress.processed / uploadProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-[#A3A19B] mt-1.5 text-center">
            {uploadProgress.processed} / {uploadProgress.total} 개 완료
          </p>
        </div>
      )}

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
    </div>
  );
};
