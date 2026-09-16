import React, { useState, useEffect } from 'react';
import type { HymnalSong } from '../../types/hymnal';
import { useHymnal } from '../../stores/HymnalProvider';
import { 
  Search, 
  List, 
  ImageIcon, 
  RefreshCw, 
  Settings, 
  X, 
  Edit2, 
  Trash2, 
  ZoomIn, 
  ZoomOut,
  Music,
  FolderOpen,
  Plus,
  Layout,
  Library,
  RotateCcw,
  PlayCircle as Youtube,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  HelpCircle
} from 'lucide-react';
import { logActivity } from '../../utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { SavedContisModal } from './SavedContisModal';
import { hymnalApi } from '../../api/hymnalApi';
import { TooltipIcon } from '../TooltipIcon';

const DriveImage = ({ fileId, alt, className }: { fileId: string, alt?: string, className?: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    let currentBlobUrl: string | null = null;
    
    if (!fileId) {
      setSrc(null);
      return;
    }
    
    // Check if it's already a full URL or local path
    if (fileId.startsWith('http') || fileId.startsWith('/')) {
      setSrc(fileId);
      return;
    }

    setSrc(null); // 곡이 바뀌면 이전 이미지를 즉시 지워서 로딩 상태 표시
    setIsError(false);

    import('../../api/gdriveWebService').then(({ gdriveWebService }) => {
      gdriveWebService.downloadImageBlob(fileId).then(blobUrl => {
        if (active) {
          if (blobUrl) {
            setSrc(blobUrl);
            currentBlobUrl = blobUrl;
          } else {
            setIsError(true);
          }
        } else if (blobUrl) {
          // 컴포넌트 언마운트 후 다운로드 완료된 경우 즉시 해제 (메모리 누수 방지)
          URL.revokeObjectURL(blobUrl);
        }
      }).catch(() => {
        if (active) setIsError(true);
      });
    });
    
    return () => { 
      active = false; 
    };
  }, [fileId]);

  if (isError) {
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center bg-[#FAF9F5] border border-dashed border-[#E7E5DF] rounded-2xl p-8 text-center text-[#6A6864]">
        <ImageIcon className="w-10 h-10 text-[#A3A19B] mb-3 stroke-[1.5px]" />
        <p className="font-serif font-bold text-[#2C2B29] mb-1">로그아웃 또는 오프라인 상태입니다</p>
        <p className="text-xs text-[#6A6864]">구글 계정이 연결되어 있지 않거나 인터넷 연결이 없어 새 악보를 다운받을 수 없습니다.</p>
        <p className="text-[11px] text-[#A3A19B] mt-2">(로그인 상태에서 한 번 이상 열어본 악보는 기기에 캐시되어 오프라인에서도 즉시 열립니다.)</p>
      </div>
    );
  }

  if (!src) return <div className="w-full h-48 flex items-center justify-center bg-[#FAF9F5] text-[#A3A19B] font-medium text-xs">악보 불러오는 중...</div>;
  
  return <img src={src} alt={alt} className={className} draggable={false} />;
};

export const HymnalModule: React.FC = () => {
    const { 
      filteredSongs, 
      searchQuery, 
      setSearchQuery, 
      selectedSongId, 
      setSelectedSongId, 
      setSongs,
      fetchSongs,
      albums,
      activeAlbumId,
      setActiveAlbumId,
      showAlbumModal,
      setShowAlbumModal,
      showBuilder,
      setShowBuilder,
      editingAlbum,
      setEditingAlbum,
      processingProgress,
      processImages,
      updateAlbum,
      addAlbum,
      updateAlbumPath,
      deleteAlbum,
      contiItems,
      addToConti,
      setIsEditorOpen,
      isLibraryOpen,
      setIsLibraryOpen,
      savedContis,
      loadSavedConti,
      deleteSavedConti,
      clearConti
    } = useHymnal();
  
    // --- 글로벌 진행 바 추가 ---
    const GlobalProgress = () => {
      if (!processingProgress) return null;
      const percent = Math.round((processingProgress.processed / (processingProgress.total || 1)) * 100);
      
      return (
        <div className="fixed bottom-6 right-6 z-[200] w-72 bg-white rounded-2xl shadow-xl border border-[#E7E5DF] p-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-[#2C2B29] uppercase tracking-wider">데이터 처리 중...</span>
            <span className="text-xs font-bold text-[#C96442]">{percent}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#F5F3ED] rounded-full overflow-hidden border border-[#E7E5DF]">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              className="h-full bg-[#C96442] rounded-full"
            />
          </div>
          <p className="text-[9px] text-[#A3A19B] font-medium mt-2 text-center">({processingProgress.processed} / {processingProgress.total} 완료)</p>
        </div>
      );
    };

  // --- 로컬 전용 UI 상태 ---
  const [albumInput, setAlbumInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedLyrics, setEditedLyrics] = useState('');
  const [editedNumber, setEditedNumber] = useState(0);
  const [editedCode, setEditedCode] = useState('');
  const [editedMeter, setEditedMeter] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [isDeleteOriginal, setIsDeleteOriginal] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.6);
  const [editedVideos, setEditedVideos] = useState<{name: string, url: string, isShared?: boolean}[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [showYoutubePlayer, setShowYoutubePlayer] = useState(false);
  const [isListOpen, setIsListOpen] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  // 검색어나 앨범이 변경되면 리스트 표시 개수 초기화
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, activeAlbumId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 400;
    if (bottom && visibleCount < filteredSongs.length) {
      setVisibleCount(prev => prev + 50);
    }
  };

  // 유튜브 URL 추출 헬퍼
  const getYoutubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}?enablejsapi=1&origin=${window.location.origin}` : null;
  };

  const addEditedVideo = () => {
    setEditedVideos([...editedVideos, { name: '', url: '', isShared: true }]);
  };
  const removeEditedVideo = (index: number) => {
    setEditedVideos(editedVideos.filter((_, i) => i !== index));
  };
  const updateEditedVideo = (index: number, field: 'name' | 'url' | 'isShared', value: any) => {
    const newVideos = [...editedVideos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setEditedVideos(newVideos);
  };

  const selectedSong = filteredSongs.find(s => s.id === selectedSongId) as HymnalSong | undefined;
  const activeAlbum = albums.find(a => a.id === activeAlbumId);

  const handleAddCurrentToConti = () => {
    if (selectedSongId) {
      addToConti(selectedSongId);
    }
  };

  // 초기 설정
  useEffect(() => {
    if (editingAlbum) {
      setAlbumInput(editingAlbum.name);
    } else {
      setAlbumInput('');
    }
  }, [editingAlbum, showAlbumModal]);

  // 유튜브 플레이어 상태에 따른 창 크기 자동 조절
  useEffect(() => {
    console.log('[HymnalModule] showYoutubePlayer changed:', showYoutubePlayer);
    if (showYoutubePlayer) {
      // 유튜브 열릴 때 가로 확장 (1200 -> 1800)
      console.log('[HymnalModule] Requesting window expand (1800x960)');
      hymnalApi.resizeWindow(1800, 960);
    } else {
      // 유튜브 닫힐 때 원래 크기로 복구
      console.log('[HymnalModule] Requesting window shrink (1200x800)');
      hymnalApi.resizeWindow(1200, 800);
    }
  }, [showYoutubePlayer]);

  // 곡 변경 시 줌 초기화 (60%를 기본값으로)
  useEffect(() => {
    setZoomScale(0.6);
    setIsEditing(false);
    setIsDeleteOriginal(false); // 삭제 옵션 초기화
    setShowYoutubePlayer(false); // 곡 변경 시 플레이어 닫기
    setActiveVideoIndex(0); // 첫 번째 영상으로 초기화
  }, [selectedSongId]);

  // --- 편집 모드 핸들러 ---
  const handleUpdateSong = async () => {
    if (!selectedSongId) return;
    
    if (!confirm('수정된 정보를 저장하시겠습니까?')) return;
    
    // 1. 낙관적 UI 업데이트 (즉시 화면에 반영)
    const updatedData = {
      title: editedTitle,
      lyrics: editedLyrics,
      number: editedNumber,
      code: editedCode,
      meter: editedMeter,
      category: editedCategory,
      youtubeVideos: editedVideos
    };

    setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, ...updatedData } : s));
    setIsEditing(false);

    // 2. 백그라운드에서 조용히 API 수정 진행
    hymnalApi.updateSong({ id: selectedSongId, ...updatedData }).then(result => {
      if (!result.success) {
        console.error('[HymnalModule] 백그라운드 수정 실패:', result.error);
      }
    });
  };

  const startEditing = () => {
    if (selectedSong) {
      setEditedTitle(selectedSong.title);
      setEditedLyrics(selectedSong.lyrics);
      setEditedNumber(selectedSong.number);
      setEditedCode(selectedSong.code || '');
      setEditedMeter(selectedSong.meter || '');
      setEditedCategory(selectedSong.category || '');
      setEditedVideos(selectedSong.youtubeVideos || []);
      setIsEditing(true);
      setIsDeleteOriginal(false);
    }
  };

  const handleDeleteSong = async () => {
    if (!selectedSongId) return;
    
    const warningMsg = '정말로 이 악보를 삭제하시겠습니까? PC 원본 파일 및 구글 드라이브 파일도 함께 삭제됩니다.';
      
    if (!confirm(warningMsg)) return;

    // 1. 낙관적 UI 업데이트 (즉시 화면에서 제거)
    const targetFileId = selectedSong?.fileId;
    const targetSongId = selectedSongId;
    
    setSongs(prev => prev.filter(s => s.id !== targetSongId));
    setSelectedSongId(null);
    setIsEditing(false);

    // 2. 백그라운드에서 조용히 API 삭제 진행
    hymnalApi.deleteSong(targetSongId, true, targetFileId).then(result => {
      if (!result.success) {
        console.error('[HymnalModule] 백그라운드 삭제 실패:', result.error);
        // 필요하다면 실패 시 alert 띄우고 fetchSongs()로 롤백 가능
      }
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#FAF9F5]">
      {/* 2단: 검색 및 곡 목록 (Middle Column) */}
      <AnimatePresence>
        {isListOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "fit-content", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-[#E7E5DF] flex flex-col bg-[#FAF9F5] shrink-0 overflow-hidden relative"
          >
            <div className="w-[22vw] min-w-[260px] max-w-[320px] flex flex-col h-full">
              <div className="p-5 pb-3">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-[#D97757] stroke-[1.8px] shrink-0" />
                    <h2 className="font-serif text-lg font-bold text-[#2C2B29] tracking-tight truncate">
                      {activeAlbumId === 'all' ? '전체 찬양' : activeAlbum?.name}
                    </h2>
                  </div>
                </div>

                <div className="relative group">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A3A19B] stroke-[1.5px] group-focus-within:text-[#C96442] transition-colors" />
                  <input 
                    type="text"
                    placeholder="제목, 가사, 번호 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 transition-all shadow-2xs text-[#2C2B29] placeholder:text-[#A3A19B]"
                  />
                </div>
              </div>

              <div 
                className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-6"
                onScroll={handleScroll}
              >
                {filteredSongs.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-2 py-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider">곡 목록</p>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10px] bg-white border border-[#E7E5DF] px-2 py-0.5 rounded-full text-[#A3A19B] font-semibold">{filteredSongs.length}</span>
                        <TooltipIcon text="악보이미지를 처음 볼때와 캐쉬를 삭제한 후, 약간의 로딩시간이 있습니다. 다음부터는 속도가 빨라집니다." />
                      </div>
                    </div>
                    {filteredSongs.slice(0, visibleCount).map((song) => (
                      <button
                        key={song.id}
                        onClick={() => setSelectedSongId(song.id)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all group cursor-pointer text-left ${
                          selectedSongId === song.id 
                            ? 'bg-white text-[#2C2B29] shadow-xs border border-[#F1D3C6] ring-1 ring-[#FAF0EB]' 
                            : 'hover:bg-white/80 hover:shadow-2xs text-[#6A6864] hover:text-[#2C2B29] border border-transparent hover:border-[#E7E5DF]'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors shrink-0 ${
                          selectedSongId === song.id ? 'bg-[#C96442] text-white shadow-2xs' : 'bg-[#F5F3ED] text-[#A3A19B] group-hover:bg-[#FAF0EB] group-hover:text-[#C96442]'
                        }`}>
                          {song.number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold truncate leading-tight">{song.title}</p>
                            {song.category && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-[#F5F3ED] text-[#6A6864] rounded-md font-medium border border-[#E7E5DF] shrink-0">
                                {song.category}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#A3A19B] font-normal truncate mt-0.5">{song.lyrics}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                     <List className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3 stroke-[1.5px]" />
                     <p className="text-xs text-[#A3A19B] font-medium italic">검색 결과가 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3단: 악보 뷰어 영역 (Main Content) */}
      <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
        {/* List Toggle Button */}
        <button 
          onClick={() => setIsListOpen(!isListOpen)}
          onMouseEnter={() => setIsListOpen(!isListOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-16 bg-white border border-l-0 border-[#E7E5DF] rounded-r-xl shadow-2xs z-30 flex items-center justify-center text-[#A3A19B] hover:text-[#C96442] transition-all hover:bg-[#FAF0EB]/40 cursor-pointer group"
          title={isListOpen ? "곡 목록 접기" : "곡 목록 펴기 (마우스 올리면 동작)"}
        >
          {isListOpen ? <ChevronLeftIcon className="w-3.5 h-3.5 stroke-[1.5px]" /> : <ChevronRightIcon className="w-3.5 h-3.5 stroke-[1.5px]" />}
        </button>

        <AnimatePresence mode="wait">
          {!selectedSongId ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-[#A3A19B] bg-[#FAF9F5]"
            >
              <div className="w-20 h-20 bg-white rounded-3xl border border-[#E7E5DF] shadow-xs flex items-center justify-center mb-6">
                <ImageIcon className="w-8 h-8 text-[#A3A19B] stroke-[1.5px]" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2C2B29] mb-1.5 tracking-tight">찬양 악보 뷰어</h3>
              <p className="text-xs font-medium text-[#6A6864]">왼쪽 목록에서 곡을 선택하여 악보를 확인하세요.</p>
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              className="h-full w-full flex flex-col bg-[#FAF9F5]"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {/* Viewer Header */}
              <div className="px-8 py-5 border-b border-[#E7E5DF] flex items-start justify-between bg-white z-10 shadow-2xs">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-3 w-full">
                      {/* 1행: 번호 + 제목 */}
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editedNumber.toString()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setEditedNumber(val ? parseInt(val, 10) : 0);
                          }}
                          className="w-20 h-10 px-3 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 text-[#2C2B29] shadow-2xs shrink-0 text-center"
                          placeholder="번호"
                        />
                        <input 
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="flex-1 h-10 px-3.5 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 text-[#2C2B29] shadow-2xs"
                          placeholder="곡 제목"
                        />
                      </div>
                      
                      {/* 2행: 분류 + 코드 + 박자 | 취소 + 저장 + 삭제옵션 */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <input 
                          type="text"
                          value={editedCategory}
                          onChange={(e) => setEditedCategory(e.target.value)}
                          className="w-28 h-10 px-3 py-2 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold text-[#2C2B29] shadow-2xs shrink-0"
                          placeholder="분류 (태그)"
                        />
                        <input 
                          type="text"
                          value={editedCode}
                          onChange={(e) => setEditedCode(e.target.value)}
                          className="w-20 h-10 px-3 py-2 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold text-[#2C2B29] shadow-2xs uppercase shrink-0 text-center"
                          placeholder="코드"
                        />
                        <input 
                          type="text"
                          value={editedMeter}
                          onChange={(e) => setEditedMeter(e.target.value)}
                          className="w-20 h-10 px-3 py-2 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold text-[#2C2B29] shadow-2xs shrink-0 text-center"
                          placeholder="박자"
                        />
                        
                        <div className="flex items-center gap-2 ml-1">
                          <button 
                            onClick={() => setIsEditing(false)}
                            className="h-10 px-4 bg-[#F5F3ED] text-[#6A6864] rounded-xl text-xs font-semibold hover:bg-[#ECEAE4] transition-all shrink-0 cursor-pointer"
                          >
                            취소
                          </button>
                          <button 
                            onClick={handleUpdateSong}
                            className="h-10 px-5 bg-[#C96442] text-white rounded-xl text-xs font-semibold shadow-2xs hover:bg-[#B55434] transition-all shrink-0 cursor-pointer"
                          >
                            저장 완료
                          </button>
                        </div>

                        <div className="flex-1 flex items-center justify-end gap-3 min-w-fit border-l border-[#E7E5DF] pl-3 ml-2">
                           <button 
                             onClick={handleDeleteSong}
                             className="h-10 px-3.5 bg-[#FAF0EB] text-[#C96442] hover:bg-[#FAF0EB]/80 border border-[#F1D3C6] rounded-xl transition-all flex items-center gap-1.5 font-semibold text-xs shrink-0 cursor-pointer"
                           >
                             <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
                             <span>악보 삭제</span>
                           </button>
                        </div>
                      </div>

                      {/* 3행: 유튜브 영상 리스트 영역 */}
                      <div className="bg-[#FAF9F5] p-3 rounded-2xl border border-dashed border-[#E7E5DF]">
                        <div className="flex items-center justify-between mb-2.5 px-1">
                          <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider flex items-center gap-1.5">
                            <Youtube className="w-3.5 h-3.5 text-[#C96442]" />
                            영상 리스트
                          </p>
                          <button 
                            onClick={addEditedVideo}
                            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E7E5DF] hover:border-[#F1D3C6] hover:text-[#C96442] text-[#6A6864] rounded-lg text-[10px] font-semibold transition-all shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            영상 추가
                          </button>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            {editedVideos.map((video, idx) => (
                              <div key={idx} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <label className="flex items-center gap-1 px-2 py-1.5 bg-white border border-[#E7E5DF] rounded-xl text-[11px] font-medium text-[#4A4741] cursor-pointer shrink-0 select-none hover:border-[#D97757]" title="찬양팀 공유 악보에 영상 표시">
                                  <input 
                                    type="checkbox"
                                    checked={video.isShared !== false}
                                    onChange={(e) => updateEditedVideo(idx, 'isShared', e.target.checked)}
                                    className="w-3.5 h-3.5 rounded accent-[#D97757] cursor-pointer"
                                  />
                                  <span>공유</span>
                                </label>
                                <input 
                                  type="text"
                                  value={video.name}
                                  onChange={(e) => updateEditedVideo(idx, 'name', e.target.value)}
                                  className="w-28 h-9 px-3 py-1.5 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold text-[#2C2B29] shadow-2xs"
                                  placeholder="이름 (예: 라이브)"
                                />
                                <input 
                                  type="text"
                                  value={video.url}
                                  onChange={(e) => updateEditedVideo(idx, 'url', e.target.value)}
                                  className="flex-1 h-9 px-3 py-1.5 bg-white border border-[#E7E5DF] rounded-xl text-xs font-semibold text-[#2C2B29] shadow-2xs"
                                  placeholder="유튜브 URL"
                               />
                                <button 
                                  onClick={() => removeEditedVideo(idx)}
                                  className="h-9 w-9 flex items-center justify-center hover:bg-[#FAF0EB] text-[#A3A19B] hover:text-[#C96442] rounded-xl transition-colors shrink-0 cursor-pointer"
                                  title="영상 삭제"
                                >
                                  <Trash2 className="w-3.5 h-3.5 stroke-[1.5px]" />
                                </button>
                              </div>
                            ))}
                           {editedVideos.length === 0 && (
                             <p className="text-[10px] text-[#A3A19B] text-center py-2 font-medium italic">연결된 영상이 없습니다.</p>
                           )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-5 flex-wrap">
                        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C2B29] tracking-tight shrink-0">
                          {selectedSong?.number}. {selectedSong?.title}
                        </h2>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleAddCurrentToConti}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer"
                          >
                            <Plus className="w-4 h-4 stroke-[1.8px]" />
                            <span>콘티 담기</span>
                          </button>
                          {/* 상세 편집 - 모바일 숨김 */}
                          <button 
                            onClick={startEditing}
                            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 stroke-[1.8px] text-[#6E6A63]" />
                            <span>상세 편집</span>
                          </button>
                          {selectedSong?.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                            <button 
                              onClick={() => setShowYoutubePlayer(!showYoutubePlayer)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#C96442] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer"
                            >
                              <Youtube className="w-3.5 h-3.5" />
                              <span>{showYoutubePlayer ? '영상 닫기' : `영상 보기 (${selectedSong.youtubeVideos.length})`}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex gap-1.5 flex-wrap">
                          {selectedSong?.meter && <span className="px-2 py-0.5 bg-[#F5F3ED] text-[#6A6864] rounded-lg text-[10px] font-semibold border border-[#E7E5DF]">{selectedSong.meter}</span>}
                          {selectedSong?.code && <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C96442] rounded-lg text-[10px] font-bold border border-[#F1D3C6]">{selectedSong.code} KEY</span>}
                          {selectedSong?.category && <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#78350F] rounded-lg text-[10px] font-semibold border border-[#FDE68A]">{selectedSong.category}</span>}
                        </div>
                        <p className="text-[11px] font-medium text-[#A3A19B] flex items-center gap-1.5 pl-0.5">
                          <FolderOpen className="w-3 h-3 stroke-[1.5px]" />
                          {albums.find(a => selectedSong?.id.startsWith(`${a.id}-`))?.name || '앨범 미지정'}
                          {selectedSong?.isManual && <span className="ml-1.5 text-[#C96442] font-semibold">[수동 수정됨]</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Viewer Main Body */}
              <div className="flex-1 flex overflow-hidden bg-[#FAF9F5]">
                <div className="flex-1 overflow-auto p-8 custom-scrollbar relative min-w-[600px]">
                  {isEditing && (
                  <div className="mb-6 max-w-4xl mx-auto">
                    <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider mb-2 pl-1">가사 편집</p>
                    <textarea 
                      value={editedLyrics}
                      onChange={(e) => setEditedLyrics(e.target.value)}
                      className="w-full h-36 px-5 py-3.5 bg-white border border-[#E7E5DF] rounded-2xl text-xs leading-relaxed focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 text-[#2C2B29] font-serif shadow-2xs"
                      placeholder="가사를 입력해 주세요..."
                    />
                  </div>
                )}
                
                <div 
                  className="bg-white shadow-md border border-[#E7E5DF] rounded-2xl mx-auto overflow-hidden transform-gpu origin-top"
                  style={{ 
                    width: `${850 * zoomScale}px`,
                    height: 'fit-content'
                  }}
                >
                    <DriveImage 
                      fileId={selectedSong?.fileId || selectedSong?.filePath || ''} 
                      alt={selectedSong?.title}
                      className="w-full h-auto block" 
                    />
                  </div>
                </div>

                {/* Youtube Player Side Panel */}
                <AnimatePresence>
                  {showYoutubePlayer && selectedSong?.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                    <motion.div 
                      key="youtube-player"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "55vw", minWidth: "125px", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="h-full bg-white border-l border-[#E7E5DF] flex flex-col shadow-xl relative z-30 shrink"
                    >
                      <div className="w-full min-w-[125px] max-w-[900px] flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b border-[#E7E5DF] flex items-center justify-between bg-[#FAF9F5] shrink-0">
                          <div className="flex items-center gap-2">
                             <Youtube className="w-4 h-4 text-[#C96442]" />
                             <span className="font-serif text-xs font-bold text-[#2C2B29]">찬양 영상 라이브러리</span>
                          </div>
                          <button onClick={() => setShowYoutubePlayer(false)} className="p-1 hover:bg-[#F5F3ED] rounded-lg cursor-pointer"><X className="w-4 h-4 text-[#A3A19B] stroke-[1.5px]" /></button>
                        </div>

                        {/* Video Playlist */}
                        <div className="p-3 bg-[#FAF9F5] flex flex-col gap-1.5 overflow-y-auto max-h-[30%] custom-scrollbar min-h-[100px] shrink-0 border-b border-[#E7E5DF]">
                          <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider px-1 mb-1">영상 선택</p>
                          {selectedSong.youtubeVideos.map((video, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActiveVideoIndex(idx)}
                              className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all border cursor-pointer ${
                                activeVideoIndex === idx 
                                  ? 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] shadow-2xs font-semibold' 
                                  : 'bg-white text-[#6A6864] border-[#E7E5DF] hover:border-[#DDD9D0]'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                activeVideoIndex === idx ? 'bg-[#C96442] text-white' : 'bg-[#F5F3ED] text-[#A3A19B]'
                              }`}>
                                <span className="text-[9px] font-bold">{idx + 1}</span>
                              </div>
                              <span className="text-xs truncate flex-1 text-left">{video.name || `영상 ${idx + 1}`}</span>
                            </button>
                          ))}
                        </div>

                        {/* Player Container */}
                        <div className="bg-[#2C2B29] flex items-center justify-center overflow-hidden w-full aspect-video shrink-0">
                          {selectedSong.youtubeVideos[activeVideoIndex]?.url && getYoutubeEmbedUrl(selectedSong.youtubeVideos[activeVideoIndex].url) ? (
                            <iframe 
                              key={selectedSong.youtubeVideos[activeVideoIndex].url}
                              width="100%" 
                              height="100%" 
                              src={`${getYoutubeEmbedUrl(selectedSong.youtubeVideos[activeVideoIndex].url)}&autoplay=1`}
                              title="YouTube video player" 
                              frameBorder="0" 
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                              allowFullScreen
                              className="aspect-video"
                            ></iframe>
                          ) : (
                            <div className="text-center p-8">
                              <p className="text-xs font-medium text-[#A3A19B]">올바른 유튜브 링크가 아닙니다.</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="p-3 bg-[#FAF9F5] flex-1">
                           <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider mb-1">현재 재생 중</p>
                           <p className="text-xs font-semibold text-[#2C2B29] truncate">{selectedSong.youtubeVideos[activeVideoIndex]?.name || selectedSong.title}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating Zoom Controls */}
                <div 
                  className="absolute bottom-8 left-1/2 z-20 transition-all duration-300"
                  style={{ 
                    transform: `translateX(calc(-50% - ${
                      (showYoutubePlayer && selectedSong?.youtubeVideos?.length ? 27.5 : 0)
                      + (isListOpen ? 0 : 0)
                    }vw${
                      (showYoutubePlayer && selectedSong?.youtubeVideos?.length ? ' - 0px' : '')
                    }))` 
                  }}
                >
                  <div className="flex items-center bg-white/95 text-[#2C2B29] rounded-full shadow-lg p-1.5 gap-1 backdrop-blur-md border border-[#E7E5DF]">
                    <button 
                      onClick={() => setZoomScale(Math.max(zoomScale - 0.2, 0.4))}
                      className="p-1.5 hover:bg-[#F5F3ED] rounded-full transition-colors cursor-pointer text-[#6A6864] hover:text-[#2C2B29]"
                      title="축소"
                    >
                      <ZoomOut className="w-4 h-4 stroke-[1.5px]" />
                    </button>
                    <div className="px-2.5 min-w-[44px] text-center border-x border-[#E7E5DF]">
                      <span className="text-xs font-semibold">{Math.round(zoomScale * 100)}%</span>
                    </div>
                    <button 
                      onClick={() => setZoomScale(Math.min(zoomScale + 0.2, 3))}
                      className="p-1.5 hover:bg-[#F5F3ED] rounded-full transition-colors cursor-pointer text-[#6A6864] hover:text-[#2C2B29]"
                      title="확대"
                    >
                      <ZoomIn className="w-4 h-4 stroke-[1.5px]" />
                    </button>
                    <button 
                      onClick={() => setZoomScale(0.6)}
                      className="ml-1 px-3 py-1 bg-[#F5F3ED] hover:bg-[#ECEAE4] text-[#2C2B29] rounded-full text-[10px] font-semibold transition-all border border-[#E7E5DF] cursor-pointer"
                    >
                      기본
                    </button>
                  </div>
                </div>
              </div>

              {/* Old Floating Zoom Controls 위치 (삭제됨) */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Modals (Provider 상태 사용) --- */}
      

      {/* 데이터 빌더 모달 */}
      <AnimatePresence>
        {showBuilder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !processingProgress && setShowBuilder(false)}
              className="absolute inset-0 bg-[#2C2B29]/40 backdrop-blur-xs" 
            />
            <motion.div 
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 border border-[#E7E5DF]"
            >
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E7E5DF]">
                <div className="space-y-1">
                  <h3 className="font-serif text-2xl font-bold text-[#2C2B29] tracking-tight">데이터 빌더 시스템</h3>
                  <p className="text-xs font-medium text-[#6A6864]">
                    이미지 파일을 분석하여 데이터를 자동 생성합니다.
                  </p>
                </div>
                {!processingProgress && (
                  <button onClick={() => setShowBuilder(false)} className="p-2 hover:bg-[#F5F3ED] rounded-full transition-colors text-[#A3A19B] hover:text-[#2C2B29] cursor-pointer">
                    <X className="w-5 h-5 stroke-[1.5px]" />
                  </button>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-[#FAF9F5] p-5 rounded-2xl border border-[#E7E5DF]">
                  <label className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider mb-3 block pl-0.5">분석 및 빌드 대상 앨범</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {albums.map(a => (
                      <button 
                        key={a.id}
                        onClick={() => setActiveAlbumId(a.id)}
                        className={`p-3 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                          activeAlbumId === a.id ? 'bg-[#C96442] text-white border-[#C96442] shadow-2xs' : 'bg-white border-[#E7E5DF] text-[#6A6864] hover:border-[#DDD9D0]'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                    {/* 새 앨범 추가 버튼 */}
                    <button 
                      onClick={() => {
                        setEditingAlbum(null);
                        setAlbumInput('');
                        setShowAlbumModal(true);
                      }}
                      className="p-3 rounded-xl text-xs font-semibold transition-all border border-dashed border-[#E7E5DF] text-[#6A6864] hover:border-[#C96442] hover:text-[#C96442] hover:bg-[#FAF0EB]/40 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      앨범 추가
                    </button>
                  </div>
                </div>

                {activeAlbumId !== 'all' && activeAlbum && (
                  <div className="space-y-5 animate-in slide-in-from-bottom-3 duration-300">
                    <div className="flex items-center gap-3.5 p-4 bg-[#FAF0EB] rounded-2xl border border-[#F1D3C6]">
                      <div className="w-10 h-10 bg-white border border-[#F1D3C6] rounded-xl flex items-center justify-center shadow-2xs">
                        <FolderOpen className="w-5 h-5 text-[#C96442] stroke-[1.5px]" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-bold text-[#C96442] uppercase tracking-wider">연결된 폴더</p>
                        <p className="text-xs font-semibold text-[#2C2B29] truncate">{activeAlbum.path || '경로가 없습니다. 폴더 선택 버튼을 눌러주세요.'}</p>
                      </div>
                      <button 
                        onClick={() => updateAlbumPath(activeAlbumId)}
                        className="px-3 py-1.5 bg-white text-[#C96442] rounded-xl text-[11px] font-semibold border border-[#F1D3C6] shadow-2xs hover:bg-[#FAF0EB] cursor-pointer"
                      >
                         폴더 변경
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => processImages(activeAlbumId, true)}
                        disabled={!activeAlbum.path || !!processingProgress}
                        className="py-4 bg-[#C96442] text-white rounded-2xl font-semibold shadow-2xs hover:bg-[#B55434] transition-all active:scale-98 disabled:opacity-50 flex flex-col items-center gap-1.5 cursor-pointer text-xs"
                      >
                        <Plus className="w-5 h-5" />
                        <span>새곡 추가 빌드</span>
                      </button>
                      <button 
                        onClick={() => processImages(activeAlbumId, false)}
                        disabled={!activeAlbum.path || !!processingProgress}
                        className="py-4 bg-[#F5F3ED] text-[#2C2B29] rounded-2xl font-semibold hover:bg-[#ECEAE4] border border-[#E7E5DF] transition-all active:scale-98 disabled:opacity-50 flex flex-col items-center gap-1.5 cursor-pointer text-xs"
                      >
                        <RefreshCw className="w-5 h-5 stroke-[1.5px]" />
                        <span>전체 다시 빌드</span>
                      </button>
                    </div>
                  </div>
                )}

                {processingProgress && (
                  <div className="space-y-4 py-2 animate-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-[#2C2B29]">데이터 처리 중...</span>
                      <span className="text-xl font-bold text-[#C96442]">{Math.round((processingProgress.processed / processingProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#F5F3ED] rounded-full overflow-hidden border border-[#E7E5DF]">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }}
                        className="h-full bg-[#C96442] rounded-full"
                      />
                    </div>
                    <p className="text-[10px] text-[#A3A19B] text-center font-medium">({processingProgress.processed} / {processingProgress.total} 곡 분석 완료)</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GlobalProgress />

      <SavedContisModal 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        savedContis={savedContis}
        onLoad={loadSavedConti}
        onDelete={deleteSavedConti}
      />
    </div>
  );
};
