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
  HelpCircle,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Save,
  Volume2,
  Sliders,
  Piano as PianoIcon,
  Play,
  BookmarkPlus,
  CheckCircle2,
  Radio
} from 'lucide-react';
import { logActivity } from '../../utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { SavedContisModal } from './SavedContisModal';
import { VirtualPiano } from './VirtualPiano';
import { ChordBuilderModal } from './ChordBuilderModal';
import { InteractiveChordViewer } from './InteractiveChordViewer';
import { SongFormBuilder } from './SongFormBuilder';
import { LiveStagePrompter } from './LiveStagePrompter';
import type { SongFormBlock } from '../../types/hymnal';
import { soundEngine, type InstrumentType } from '../../utils/soundEngine';
import { transposeSongText, transposeChordString, getChordNotes, extractPureLyrics, type ChordNoteInfo } from '../../utils/musicTheory';
import { hymnalApi } from '../../api/hymnalApi';
import { TooltipIcon } from '../TooltipIcon';
import { searchYoutubeVideos, getYoutubeEmbedUrl, type YoutubeSearchResult } from '../../api/youtubeService';

const DriveImage = ({ fileId, storageUrl, alt, className }: { fileId: string, storageUrl?: string, alt?: string, className?: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    let currentBlobUrl: string | null = null;
    
    const targetKey = fileId || (storageUrl && !storageUrl.startsWith('http') ? storageUrl : '');
    const remoteUrl = storageUrl && storageUrl.startsWith('http') ? storageUrl : (fileId && fileId.startsWith('http') ? fileId : '');

    if (!targetKey && !remoteUrl) {
      setSrc(null);
      return;
    }

    // 1. Blob URL이나 Data URL, 정적 상대 경로는 즉시 렌더링
    if (fileId && (fileId.startsWith('/') || fileId.startsWith('data:') || fileId.startsWith('blob:'))) {
      setSrc(fileId);
      return;
    }
    if (storageUrl && (storageUrl.startsWith('/') || storageUrl.startsWith('data:') || storageUrl.startsWith('blob:'))) {
      setSrc(storageUrl);
      return;
    }

    setSrc(null);
    setIsError(false);

    const loadImage = async () => {
      try {
        const { imageCache } = await import('../../utils/imageCache');

        // 1단계: IndexedDB 로컬 캐시 조회 (0초 지연, 오프라인 즉시 로드)
        if (targetKey) {
          const cachedBlob = await imageCache.getImage(targetKey);
          if (cachedBlob && cachedBlob.size > 0) {
            if (active) {
              const url = URL.createObjectURL(cachedBlob);
              currentBlobUrl = url;
              setSrc(url);
              return;
            }
          }
        }

        // 2단계: 클라우드 스토리지(Firebase Storage / R2) 원격 URL이 있는 경우 fetch 후 로컬 자동 캐싱
        if (remoteUrl) {
          try {
            const res = await fetch(remoteUrl);
            if (res.ok) {
              const blob = await res.blob();
              if (active) {
                const url = URL.createObjectURL(blob);
                currentBlobUrl = url;
                setSrc(url);
                // 로컬 IndexedDB에 영구 저장 (다음부터는 오프라인에서도 즉시 열림)
                if (targetKey) {
                  imageCache.saveImage(targetKey, blob).catch(() => {});
                }
                return;
              }
            }
          } catch (fetchErr) {
            console.warn('[DriveImage] Remote fetch failed, falling back:', fetchErr);
          }
        }

        // 3단계: 레거시 구글 드라이브 ID 파일 다운로드 (하위 호환)
        if (targetKey && !targetKey.startsWith('song_') && !targetKey.startsWith('http')) {
          const { gdriveWebService } = await import('../../api/gdriveWebService');
          const blobUrl = await gdriveWebService.downloadImageBlob(targetKey);
          if (active && blobUrl) {
            setSrc(blobUrl);
            currentBlobUrl = blobUrl;
            return;
          }
        }

        if (active) setIsError(true);
      } catch (err) {
        console.error('[DriveImage] Image load error:', err);
        if (active) setIsError(true);
      }
    };

    loadImage();

    return () => { 
      active = false;
      if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [fileId, storageUrl]);

  if (isError) {
    return (
      <div className="w-full h-[50vh] flex flex-col items-center justify-center bg-[#FAF9F5] border border-dashed border-[#E7E5DF] rounded-2xl p-8 text-center text-[#6A6864]">
        <ImageIcon className="w-10 h-10 text-[#A3A19B] mb-3 stroke-[1.5px]" />
        <p className="font-serif font-bold text-[#2C2B29] mb-1">악보를 불러올 수 없습니다</p>
        <p className="text-xs text-[#6A6864]">네트워크 연결을 확인하거나 악보 원본 파일 상태를 확인해 주세요.</p>
        <p className="text-[11px] text-[#A3A19B] mt-2">(한 번 열어본 악보는 기기에 안전하게 자동 보관되어 오프라인에서도 즉시 열립니다.)</p>
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
      clearConti,
      exportCSV,
      importCSV,
      isListOpen,
      setIsListOpen
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
  const [showCodeText, setShowCodeText] = useState(true); // 기본으로 코드 텍스트/송폼 우측 패널 표시
  const [rightPanelTab, setRightPanelTab] = useState<'chordText' | 'songForm'>('chordText'); // 'chordText' (코드악보TEXT) vs 'songForm' (송폼편집)
  const [showPrompter, setShowPrompter] = useState(false);
  const [prompterBlocks, setPrompterBlocks] = useState<SongFormBlock[]>([]);
  const [isSavingSongForm, setIsSavingSongForm] = useState(false);
  const [youtubeWidth, setYoutubeWidth] = useState(480);
  const [isResizingYoutube, setIsResizingYoutube] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [lyricsEditValue, setLyricsEditValue] = useState('');
  const [isSavingLyrics, setIsSavingLyrics] = useState(false);
  const [lyricsSavedNotice, setLyricsSavedNotice] = useState(false);
  const [isAnalyzingScore, setIsAnalyzingScore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [swipedSongId, setSwipedSongId] = useState<string | null>(null);
  const [isDraggingSong, setIsDraggingSong] = useState(false);

  // --- 음악 및 코드 관련 UI 상태 ---
  const [chordViewMode, setChordViewMode] = useState<'play' | 'edit'>('edit'); // 기본은 'edit'(수정 가능한 텍스트 모드)
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType>('piano');
  const [transposeOffset, setTransposeOffset] = useState<number>(0);
  const [showVirtualPiano, setShowVirtualPiano] = useState(false); // [코드 듣기] 누르면 활성화
  const [activePianoNotes, setActivePianoNotes] = useState<ChordNoteInfo[]>([]);
  const [showChordBuilder, setShowChordBuilder] = useState(false);

  // --- 유튜브 검색 및 라이브러리 실시간 추가 상태 ---
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState('');
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [isSearchingYoutube, setIsSearchingYoutube] = useState(false);
  const [activePreviewVideoId, setActivePreviewVideoId] = useState<string | null>(null);
  const [videoAddedNotice, setVideoAddedNotice] = useState<string | null>(null);
  const [youtubeTab, setYoutubeTab] = useState<'search' | 'library'>('search');

  // 유튜브 패널 마우스 드래그 너비 조절 리스너
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingYoutube) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= Math.min(window.innerWidth * 0.75, 960)) {
        setYoutubeWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingYoutube(false);
    };

    if (isResizingYoutube) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingYoutube]);

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

  // 곡 변경 시 줌 초기화 및 상태 설정
  useEffect(() => {
    setZoomScale(0.6);
    setIsEditing(false);
    setIsDeleteOriginal(false); // 삭제 옵션 초기화
    setShowYoutubePlayer(false); // 곡 변경 시 플레이어 닫기
    setShowCodeText(true); // 기본으로 코드 텍스트 창 표시
    setChordViewMode('edit'); // 기본은 수정 가능한 텍스트 모드
    setShowVirtualPiano(false);
    setActiveVideoIndex(0); // 첫 번째 영상으로 초기화
    setActivePreviewVideoId(null);
    setTransposeOffset(0); // 조옮김 초기화
    setActivePianoNotes([]); // 건반 하이라이트 초기화
  }, [selectedSongId]);

  // 유튜브 검색 실행 핸들러
  const handleSearchYoutube = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : youtubeSearchQuery) || selectedSong?.title || '';
    if (!q.trim()) return;
    setIsSearchingYoutube(true);
    setYoutubeSearchQuery(q);
    try {
      const results = await searchYoutubeVideos(q);
      setYoutubeSearchResults(results);
    } catch (err) {
      console.warn('[HymnalModule] searchYoutubeVideos error:', err);
    } finally {
      setIsSearchingYoutube(false);
    }
  };

  // 유튜브 패널이 열리거나 곡이 바뀔 때 자동 검색 동기화
  useEffect(() => {
    if (selectedSong?.title) {
      setYoutubeSearchQuery(selectedSong.title);
      setActivePreviewVideoId(null);
      if (showYoutubePlayer) {
        handleSearchYoutube(selectedSong.title);
      }
    }
  }, [selectedSong?.id, showYoutubePlayer]);

  // 검색 결과에서 내 영상 라이브러리에 바로 추가
  const handleAddVideoToLibrary = async (video: { videoId: string; title: string }) => {
    if (!selectedSongId || !selectedSong) return;
    const currentVideos = selectedSong.youtubeVideos || [];
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    
    // 이미 등록되어 있는지 확인
    if (currentVideos.some(v => v.url?.includes(video.videoId))) {
      alert('이미 등록된 찬양 영상입니다.');
      return;
    }

    const newVideoItem = {
      name: video.title,
      url: videoUrl,
      isShared: true,
    };

    const updatedVideos = [...currentVideos, newVideoItem];

    // 1. 낙관적 UI 업데이트
    setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, youtubeVideos: updatedVideos } : s));
    setActiveVideoIndex(updatedVideos.length - 1);
    setActivePreviewVideoId(video.videoId);

    // 2. 백그라운드 DB 저장
    const res = await hymnalApi.updateSong({ id: selectedSongId, youtubeVideos: updatedVideos });
    if (res.success) {
      setVideoAddedNotice(video.videoId);
      setTimeout(() => setVideoAddedNotice(null), 2500);
    }
  };

  // 라이브러리에서 영상 삭제
  const handleRemoveVideoFromLibrary = async (idxToRemove: number) => {
    if (!selectedSongId || !selectedSong) return;
    if (!confirm('이 찬양 영상을 라이브러리에서 삭제하시겠습니까?')) return;
    const currentVideos = selectedSong.youtubeVideos || [];
    const updatedVideos = currentVideos.filter((_, idx) => idx !== idxToRemove);

    setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, youtubeVideos: updatedVideos } : s));
    if (activeVideoIndex >= updatedVideos.length) {
      setActiveVideoIndex(Math.max(0, updatedVideos.length - 1));
    }
    setActivePreviewVideoId(null);

    await hymnalApi.updateSong({ id: selectedSongId, youtubeVideos: updatedVideos });
  };

  // 선택된 곡의 코드/가사 텍스트를 코드 텍스트 편집기에 동기화
  useEffect(() => {
    // chordText가 있으면 chordText 우선, 없으면 기존 lyrics 사용
    const initialChordText = selectedSong?.chordText || selectedSong?.lyrics || '';
    setLyricsEditValue(initialChordText);
    setLyricsSavedNotice(false);
    setTransposeOffset(0);
    setActivePianoNotes([]);
  }, [selectedSong?.id, selectedSong?.chordText, selectedSong?.lyrics]);

  // 코드 텍스트 창에서 가사/코드 즉시 저장 핸들러
  const handleSaveLyrics = async () => {
    if (!selectedSongId || !selectedSong) return;
    setIsSavingLyrics(true);
    try {
      // 1. 코드 텍스트에서 순수 가사도 자동 추출
      const pureLyrics = extractPureLyrics(lyricsEditValue);

      const updatedData: Partial<HymnalSong> & { updatedAt: string } = {
        chordText: lyricsEditValue,
        // 상세편집용 lyrics: 기존 lyrics가 이미 순수 가사라면 유지하고, 비어있거나 코드가 섞여있었다면 순수 가사로 갱신
        lyrics: (selectedSong.lyrics && !selectedSong.lyrics.match(/[A-G][#b]?m?/)) ? selectedSong.lyrics : (pureLyrics || selectedSong.lyrics || ''),
        isManual: true,
        updatedAt: new Date().toISOString()
      };

      // UI 즉시 반영 (낙관적 업데이트)
      setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, ...updatedData } : s));
      
      const result = await hymnalApi.updateSong({ id: selectedSongId, ...updatedData });
      if (!result.success) {
        console.error('[HymnalModule] 코드 텍스트 저장 실패:', result.error);
      }
      setLyricsSavedNotice(true);
      setTimeout(() => setLyricsSavedNotice(false), 2000);
    } catch (err) {
      console.error('[HymnalModule] 코드 텍스트 저장 에러:', err);
      alert('코드 및 가사 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingLyrics(false);
    }
  };

  // 반음 올림/내림 (조옮김: Transpose) 핸들러
  const handleTranspose = (semitones: number) => {
    if (!lyricsEditValue) return;
    const newOffset = transposeOffset + semitones;
    setTransposeOffset(newOffset);
    // 현재 가사/코드 텍스트의 모든 코드를 반음 변환
    const transposedText = transposeSongText(lyricsEditValue, semitones);
    setLyricsEditValue(transposedText);

    // 선택된 곡의 대표 Key가 있다면 그것도 함께 변환 표시
    if (selectedSong?.code) {
      const transposedKey = transposeChordString(selectedSong.code, semitones);
      // 낙관적 곡 코드 업데이트
      setSongs(prev => prev.map(s => s.id === selectedSong.id ? { ...s, code: transposedKey } : s));
    }
  };

  // 코드 생성기에서 코드 텍스트에 삽입하는 핸들러 (코드 카드로 진입)
  const handleInsertChordFromBuilder = (chordToAdd: string) => {
    // 1. 코드 구성음 계산 후 즉시 사운드 및 피아노 건반 하이라이트
    const notes = getChordNotes(chordToAdd);
    if (notes.length > 0) {
      soundEngine.playChord(notes, selectedInstrument);
      setActivePianoNotes(notes);
    }

    // 2. 텍스트에 코드 추가 (첫 줄이거나 마지막 줄에 코드 카드 형태로 진입)
    setLyricsEditValue(prev => {
      if (!prev || !prev.trim()) return chordToAdd;
      const lines = prev.split('\n');
      // 가장 첫 줄이나 마지막 줄에 코드 배치
      return `${prev}\n${chordToAdd}`;
    });
  };

  // --- 편집 모드 핸들러 ---
  const handleUpdateSong = async () => {
    if (!selectedSongId) return;
    
    if (!confirm('수정된 정보를 저장하시겠습니까?')) return;
    
    // 1. 낙관적 UI 업데이트 (즉시 화면에 반영)
    const updatedData: Partial<HymnalSong> = {
      title: editedTitle,
      lyrics: editedLyrics, // 순수 가사만 저장
      chordText: selectedSong?.chordText, // 정교한 코드 텍스트 보존
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

  // --- AI 악보정보 분석 핸들러 ---
  const handleAnalyzeScore = async () => {
    if (!selectedSong) return;
    setIsAnalyzingScore(true);
    try {
      const { imageCache } = await import('../../utils/imageCache');
      const { analyzeScoreImage, formatScoreSectionsToText } = await import('../../api/aiScoreService');

      let imageBlob: Blob | null = null;
      const targetKey = (selectedSong as any).fileId || (selectedSong.filePath && !selectedSong.filePath.startsWith('http') ? selectedSong.filePath : '');
      const remoteUrl = (selectedSong as any).storageUrl && (selectedSong as any).storageUrl.startsWith('http') 
        ? (selectedSong as any).storageUrl 
        : (selectedSong.filePath && selectedSong.filePath.startsWith('http') ? selectedSong.filePath : '');

      if (targetKey) {
        imageBlob = await imageCache.getImage(targetKey);
      }

      if (!imageBlob && remoteUrl) {
        const res = await fetch(remoteUrl);
        if (res.ok) {
          imageBlob = await res.blob();
        }
      }

      if (!imageBlob && (selectedSong as any).fileId && !(selectedSong as any).fileId.startsWith('song_') && !(selectedSong as any).fileId.startsWith('http')) {
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        const blobUrl = await gdriveWebService.downloadImageBlob((selectedSong as any).fileId);
        if (blobUrl) {
          const res = await fetch(blobUrl);
          if (res.ok) imageBlob = await res.blob();
        }
      }

      if (!imageBlob) {
        alert('악보 이미지를 불러올 수 없습니다. 원본 이미지 상태를 확인해 주세요.');
        return;
      }

      const result = await analyzeScoreImage(imageBlob);

      if (!result.isSheetMusic) {
        alert(`악보가 아닌 것으로 판별되었습니다.\n사유: ${result.notSheetMusicReason || '악보 기호나 오선지를 찾을 수 없습니다.'}`);
        return;
      }

      // 악보 분석 성공 처리
      const newTitle = result.title || selectedSong.title;
      const newCode = result.keySignature ? (result.keySignature.replace(/Major|Minor|장조|단조/gi, '').trim() || result.keySignature.trim()) : (selectedSong.code || '');
      const newMeter = result.timeSignature || selectedSong.meter || '';
      const newCategory = result.theme || selectedSong.category || '';
      const newSongForm = result.structure || selectedSong.songForm || '';
      const formattedLyrics = result.sections && result.sections.length > 0 
        ? formatScoreSectionsToText(result.sections) 
        : (result.firstLyric || selectedSong.lyrics || '');

      // 코드와 순수 가사 분리
      const pureLyrics = extractPureLyrics(formattedLyrics);

      // AI 송폼 구성 (각 송폼 카드마다 코드진행 및 파트연주팁/무드 자동 생성)
      let generatedSongFormBlocks: SongFormBlock[] = [];
      if (result.songFormBlocks && Array.isArray(result.songFormBlocks) && result.songFormBlocks.length > 0) {
        generatedSongFormBlocks = result.songFormBlocks.map((b, idx) => ({
          id: `block_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          type: b.type || `Part ${idx + 1}`,
          barCount: b.barCount || 8,
          repeatCount: b.repeatCount || 1,
          chords: b.chords || '',
          memo: b.memo || '',
        }));
      } else if (result.sections && result.sections.length > 0) {
        generatedSongFormBlocks = result.sections.map((sec, idx) => {
          const rawName = sec.sectionName.replace(/[\[\]]/g, '').trim();
          const firstChordLine = sec.lines?.find(l => l.chordLineText?.trim())?.chordLineText?.trim() || '';
          const cleanChords = firstChordLine.split(/\s+/).filter(Boolean).slice(0, 4).join(' - ');
          return {
            id: `block_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            type: rawName || `Part ${idx + 1}`,
            barCount: 8,
            repeatCount: 1,
            chords: cleanChords || result.chordProgressionSummary || '',
            memo: idx === 0 
              ? '피아노와 보컬로 잔잔하게 시작' 
              : idx === result.sections.length - 1 
                ? '아웃트로 페이드아웃 및 여운' 
                : '전체 악기 합주 빌드업',
          };
        });
      } else {
        const { createNewSongFormBlock } = await import('../../utils/songFormUtils');
        generatedSongFormBlocks = [
          createNewSongFormBlock('Intro', 4, '피아노 인트로로 잔잔하게 시작', result.chordProgressionSummary || ''),
          createNewSongFormBlock('Verse 1', 8, '어쿠스틱 기타와 차분한 멜로디', result.chordProgressionSummary || ''),
          createNewSongFormBlock('Chorus', 8, '풀밴드 드럼 비트 및 감정 고조', result.chordProgressionSummary || ''),
          createNewSongFormBlock('Outro', 4, '피아노 아르페지오 및 조용한 마무리', result.chordProgressionSummary || ''),
        ];
      }

      const { formatSongFormBlocksToText } = await import('../../utils/songFormUtils');
      const newSongFormSummary = formatSongFormBlocksToText(generatedSongFormBlocks);
      const generatedSongFormText = generatedSongFormBlocks
        .map(b => {
          const parts = [];
          if (b.chords?.trim()) parts.push(`코드: ${b.chords.trim()}`);
          if (b.memo?.trim()) parts.push(b.memo.trim());
          return parts.length > 0 ? `[${b.type}${b.repeatCount > 1 ? ` x${b.repeatCount}` : ''}] ${parts.join(' | ')}` : '';
        })
        .filter(Boolean)
        .join('\n');

      // 템포에서 BPM 숫자 파싱
      const parsedBpm = result.tempo ? parseInt(result.tempo.replace(/[^0-9]/g, ''), 10) : undefined;

      const updatedSongData: Partial<HymnalSong> & { updatedAt: string } = {
        title: newTitle,
        code: newCode,
        meter: newMeter,
        category: newCategory,
        songForm: newSongForm || newSongFormSummary,
        songFormBlocks: generatedSongFormBlocks,
        songFormText: generatedSongFormText,
        performanceMemo: generatedSongFormText,
        bpm: parsedBpm && !isNaN(parsedBpm) ? parsedBpm : selectedSong.bpm,
        chordText: formattedLyrics, // 코드 텍스트 창용
        lyrics: pureLyrics || formattedLyrics, // 상세편집 가사용 (코드 제외 순수 가사)
        isManual: true,
        updatedAt: new Date().toISOString()
      };

      // 1. 낙관적 UI 업데이트
      setSongs(prev => prev.map(s => s.id === selectedSong.id ? { ...s, ...updatedSongData } : s));
      setLyricsEditValue(formattedLyrics);

      // 편집창 모드일 경우 인풋 상태도 동기화
      setEditedTitle(newTitle);
      setEditedCode(newCode);
      setEditedMeter(newMeter);
      setEditedCategory(newCategory);
      setEditedLyrics(pureLyrics || formattedLyrics);

      // 2. 백그라운드 DB 저장
      hymnalApi.updateSong({ id: selectedSong.id, ...updatedSongData }).catch(err => {
        console.error('[HymnalModule] AI 분석 결과 저장 실패:', err);
      });

      // 3. 코드 & 가사 뷰 열어서 분석 결과 바로 확인 가능하게 지원
      setShowYoutubePlayer(true);
      setShowCodeText(true);

      alert(`[AI 악보정보 분석 완료]\n\n• 곡명: ${newTitle}\n• 코드(Key): ${newCode || '미확인'}\n• 박자: ${newMeter || '미확인'}\n• 송폼: ${newSongForm || '미확인'}\n\n상세 정보 및 가사+코드가 자동으로 채워졌습니다.`);
    } catch (err: any) {
      console.error('[HymnalModule] AI 분석 오류:', err);
      alert(`AI 악보정보 분석 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsAnalyzingScore(false);
    }
  };

  const startEditing = () => {
    if (selectedSong) {
      setEditedTitle(selectedSong.title);
      // 상세편집에는 코드 빼고 순수 가사만 넣어주기
      const pure = extractPureLyrics(selectedSong.lyrics || selectedSong.chordText || '');
      setEditedLyrics(pure || selectedSong.lyrics || '');
      setEditedNumber(selectedSong.number);
      setEditedCode(selectedSong.code || '');
      setEditedMeter(selectedSong.meter || '');
      setEditedCategory(selectedSong.category || '');
      setEditedVideos(selectedSong.youtubeVideos || []);
      setIsEditing(true);
      setIsDeleteOriginal(false);
    }
  };

  const executeDeleteSong = async (songToDelete: HymnalSong) => {
    if ((songToDelete as any).albumId === 'hymnal') {
      alert('새찬송가 악보는 기본 악보이므로 삭제할 수 없습니다.');
      return;
    }

    const warningMsg = `'${songToDelete.title}' 악보를 삭제하시겠습니까?`;
    if (!confirm(warningMsg)) return;

    const targetFileId = (songToDelete as any)?.fileId;
    const targetSongId = songToDelete.id;

    // 1. 낙관적 UI 업데이트 (즉시 화면에서 제거)
    setSongs(prev => prev.filter(s => s.id !== targetSongId));
    if (selectedSongId === targetSongId) {
      setSelectedSongId(null);
      setIsEditing(false);
    }
    setSwipedSongId(null);

    const targetStorageUrl = (songToDelete as any)?.storageUrl || (songToDelete as any)?.filePath;

    // 2. 백그라운드에서 API 삭제 진행 (DB, 로컬 캐시, 클라우드 스토리지 원본 완전 삭제)
    hymnalApi.deleteSong(targetSongId, true, targetFileId, targetStorageUrl).then(result => {
      if (!result.success) {
        console.error('[HymnalModule] 백그라운드 삭제 실패:', result.error);
      }
    });
    logActivity('악보 삭제', `${songToDelete.title} 악보 삭제`);
  };

  const handleDeleteSong = async () => {
    if (!selectedSong) return;
    executeDeleteSong(selectedSong);
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
                    {filteredSongs.slice(0, visibleCount).map((song) => {
                      const isSwiped = swipedSongId === song.id;
                      const isSelected = selectedSongId === song.id;

                      return (
                        <div key={song.id} className="relative overflow-hidden rounded-lg bg-transparent select-none">
                          {/* 뒤편 배경: 스와이프 시 노출되는 삭제 버튼 */}
                          <div className={`absolute inset-y-0 right-0 w-[64px] bg-[#C96442] rounded-r-lg flex items-center justify-center z-0 transition-opacity ${isSwiped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                executeDeleteSong(song);
                              }}
                              className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-white hover:bg-[#B55434] active:bg-[#9E4628] transition-colors cursor-pointer"
                              title="악보 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-white stroke-[2px]" />
                              <span className="text-[10px] font-bold tracking-tight">삭제</span>
                            </button>
                          </div>

                          {/* 전면 카드: 위아래 폭 대폭 축소 및 우측 흐린 삭제 아이콘 상시 노출 */}
                          <motion.div
                            drag="x"
                            dragConstraints={{ left: -64, right: 0 }}
                            dragElastic={0.08}
                            animate={{ x: isSwiped ? -64 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            onDragStart={() => setIsDraggingSong(true)}
                            onDragEnd={(_, info) => {
                              setTimeout(() => setIsDraggingSong(false), 80);
                              if (info.offset.x < -24 || info.velocity.x < -180) {
                                setSwipedSongId(song.id);
                              } else {
                                setSwipedSongId(null);
                              }
                            }}
                            onClick={() => {
                              if (isDraggingSong) return;
                              if (isSwiped) {
                                setSwipedSongId(null);
                                return;
                              }
                              if (swipedSongId) {
                                setSwipedSongId(null);
                              }
                              setSelectedSongId(song.id);
                            }}
                            className={`relative z-10 w-full flex items-center gap-2 py-1 px-2 rounded-lg transition-colors cursor-pointer text-left ${
                              isSelected 
                                ? 'bg-white text-[#2C2B29] shadow-2xs border border-[#F1D3C6] ring-1 ring-[#FAF0EB]' 
                                : 'bg-white hover:bg-white/95 text-[#6A6864] hover:text-[#2C2B29] border border-transparent hover:border-[#E7E5DF]'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[11px] transition-colors shrink-0 ${
                              isSelected ? 'bg-[#C96442] text-white shadow-2xs' : 'bg-[#F5F3ED] text-[#A3A19B] group-hover:bg-[#FAF0EB] group-hover:text-[#C96442]'
                            }`}>
                              {song.number}
                            </div>
                            <div className="flex-1 min-w-0 py-0.5">
                              <p className={`text-[13.5px] font-bold truncate leading-tight ${isSelected ? 'text-[#C96442]' : 'text-[#2C2B29]'}`}>
                                {song.title}
                              </p>
                            </div>

                            {/* 우측 끝 흐리게 보이는 삭제 아이콘 (누르면 삭제 확인 팝업) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                executeDeleteSong(song);
                              }}
                              className="p-1 rounded text-[#A3A19B] hover:text-[#C96442] opacity-25 hover:opacity-100 transition-all shrink-0 cursor-pointer hover:bg-neutral-100"
                              title="악보 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5 stroke-[1.8px]" />
                            </button>
                          </motion.div>
                        </div>
                      );
                    })}
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
        {/* 악보뷰 패널 좌측 목록여는 화살표 탭 */}
        <button 
          onClick={() => setIsListOpen(!isListOpen)}
          onMouseEnter={() => setIsListOpen(!isListOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[40%] w-4.5 hover:w-5 bg-white/90 hover:bg-[#F5F3EF] border-y border-r border-[#E7E5DF] rounded-r-2xl z-30 flex items-center justify-center text-[#8C8983] hover:text-[#2C2B29] transition-all cursor-pointer group shadow-sm backdrop-blur-xs"
          title={isListOpen ? "곡 목록 접기" : "곡 목록 펴기"}
        >
          <div className="flex flex-col items-center justify-center py-2">
            {isListOpen ? (
              <ChevronLeftIcon className="w-3.5 h-3.5 stroke-[2.2px] transition-transform group-hover:-translate-x-0.5" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5 stroke-[2.2px] transition-transform group-hover:translate-x-0.5" />
            )}
          </div>
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
              className="h-full w-full flex flex-col bg-[#FAF9F5] relative overflow-hidden"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {/* Viewer Header */}
              <div className="px-6 py-3 border-b border-[#E7E5DF] flex items-start justify-between bg-white z-10 shadow-2xs shrink-0">
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
                            type="button"
                            onClick={handleAnalyzeScore}
                            disabled={isAnalyzingScore}
                            className="h-10 px-3 bg-white text-[#4A4741] hover:bg-[#F5F3ED] border border-[#E7E5DF] rounded-xl text-xs font-semibold shadow-2xs transition-all shrink-0 cursor-pointer disabled:opacity-50"
                            title="AI 악보정보 분석으로 제목/코드/박자/가사 자동 채우기"
                          >
                            {isAnalyzingScore ? '분석 중...' : 'AI 악보정보 분석'}
                          </button>
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
                    <div className="flex flex-col gap-2 w-full">
                      {/* 1행: [좌측 악보제목 (50% 크기, 고딕체)] -------------------- [우측 앨범이름] */}
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="font-sans text-sm sm:text-base font-bold text-[#2C2B29] tracking-tight truncate">
                          {selectedSong?.number}. {selectedSong?.title}
                          {selectedSong?.isManual && (
                            <span className="ml-2 text-[11px] text-[#C96442] font-semibold font-sans">[수동 수정됨]</span>
                          )}
                        </h2>

                        {/* 우측 앨범이름 */}
                        <div className="flex items-center gap-1.5 text-xs text-[#8C877D] font-medium shrink-0 bg-[#FAF9F5] px-2.5 py-1 rounded-lg border border-[#E7E5DF]">
                          <FolderOpen className="w-3.5 h-3.5 text-[#A3A19B] stroke-[1.5px]" />
                          <span>{albums.find(a => selectedSong?.id.startsWith(`${a.id}-`))?.name || '앨범 미지정'}</span>
                        </div>
                      </div>

                      {/* 2행: [좌측 버튼들: 콘티담기, 상세편집, 영상보기, 코드 TEXT] ------ [우측 정보: 박자, 키, 주제] */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 콘티 담기 */}
                          <button 
                            onClick={handleAddCurrentToConti}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer border border-[#F1D3C6] bg-[#FAF0EB]/40 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2px]" />
                            <span>콘티담기</span>
                          </button>

                          {/* AI 악보정보 분석 (아이콘 제거, 심플한 글자) */}
                          <button 
                            onClick={handleAnalyzeScore}
                            disabled={isAnalyzingScore}
                            className={`flex items-center px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border shadow-2xs ${
                              isAnalyzingScore
                                ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                                : 'bg-white text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] border-[#E7E5DF]'
                            }`}
                            title="AI가 악보 이미지를 판독하여 제목, 코드(Key), 박자, 가사+코드를 자동 추출합니다"
                          >
                            <span>{isAnalyzingScore ? '분석 중...' : 'AI 악보정보 분석'}</span>
                          </button>

                          {/* 상세 편집 */}
                          <button 
                            onClick={startEditing}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer border border-[#E7E5DF] bg-white shadow-2xs"
                          >
                            <Edit2 className="w-3.5 h-3.5 stroke-[1.8px] text-[#6E6A63]" />
                            <span>상세편집</span>
                          </button>

                          {/* 유튜브 영상 버튼 - 패널 열기 및 검색 */}
                          <button 
                            onClick={() => {
                              const next = !showYoutubePlayer;
                              setShowYoutubePlayer(next);
                              if (next && selectedSong) {
                                handleSearchYoutube(selectedSong.title);
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border shadow-2xs ${
                              showYoutubePlayer 
                                ? 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] font-semibold' 
                                : 'bg-white text-[#4A4741] hover:text-[#C96442] hover:bg-[#FAF0EB] border-[#E7E5DF]'
                            }`}
                            title="유튜브 찬양 영상 패널 및 검색 열기/닫기"
                          >
                            <Youtube className={`w-3.5 h-3.5 ${showYoutubePlayer ? 'text-[#C96442]' : 'text-[#6E6A63]'}`} />
                            <span>유튜브영상</span>
                            {selectedSong?.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                              <span className="text-[10px] text-[#A3A19B] font-mono font-bold">({selectedSong.youtubeVideos.length})</span>
                            )}
                          </button>

                          {/* 코드악보TEXT (악보 우측 코드 & 가사 창 토글/선택) */}
                          <button 
                            onClick={() => {
                              if (!showCodeText) {
                                setShowCodeText(true);
                                setRightPanelTab('chordText');
                              } else if (rightPanelTab === 'chordText') {
                                setShowCodeText(false);
                              } else {
                                setRightPanelTab('chordText');
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border shadow-2xs ${
                              showCodeText && rightPanelTab === 'chordText'
                                ? 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] font-semibold' 
                                : 'bg-white text-[#4A4741] hover:text-[#C96442] hover:bg-[#FAF0EB] border-[#E7E5DF]'
                            }`}
                            title="악보 우측 코드 & 가사 창 열기/닫기"
                          >
                            <FileText className={`w-3.5 h-3.5 stroke-[1.8px] ${showCodeText && rightPanelTab === 'chordText' ? 'text-[#C96442]' : 'text-[#6E6A63]'}`} />
                            <span>코드악보TEXT</span>
                          </button>

                          {/* 송폼편집 (악보 우측 송폼 빌더 창 토글/선택) */}
                          <button 
                            onClick={() => {
                              if (!showCodeText) {
                                setShowCodeText(true);
                                setRightPanelTab('songForm');
                              } else if (rightPanelTab === 'songForm') {
                                setShowCodeText(false);
                              } else {
                                setRightPanelTab('songForm');
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border shadow-2xs ${
                              showCodeText && rightPanelTab === 'songForm'
                                ? 'bg-[#FAF0EB] text-[#C96442] border-[#F1D3C6] font-semibold' 
                                : 'bg-white text-[#4A4741] hover:text-[#C96442] hover:bg-[#FAF0EB] border-[#E7E5DF]'
                            }`}
                            title="악보 우측 송폼(Song Form) 빌더 열기/닫기"
                          >
                            <Radio className={`w-3.5 h-3.5 stroke-[1.8px] ${showCodeText && rightPanelTab === 'songForm' ? 'text-[#C96442]' : 'text-[#6E6A63]'}`} />
                            <span>송폼편집</span>
                          </button>
                        </div>

                        {/* 우측 정보: 박자, 키, 주제 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {selectedSong?.meter && (
                            <span className="px-2 py-0.5 bg-[#F5F3ED] text-[#6A6864] rounded-lg text-[11px] font-semibold border border-[#E7E5DF]">
                              {selectedSong.meter}
                            </span>
                          )}
                          {selectedSong?.code && (
                            <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C96442] rounded-lg text-[11px] font-bold border border-[#F1D3C6]">
                              {selectedSong.code} KEY
                            </span>
                          )}
                          {selectedSong?.category && (
                            <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#78350F] rounded-lg text-[11px] font-semibold border border-[#FDE68A]">
                              {selectedSong.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Viewer Main Body (악보패널과 유튜브 패널이 나란히 위치하여 악보가 밀려남, 덮지 않음) */}
              <div className="flex-1 flex overflow-hidden bg-[#FAF9F5] relative">
                
                {/* 1. 악보 뷰어 + 우측 코드 텍스트 2분할 메인 영역 */}
                <div className="flex-1 flex flex-col xl:flex-row h-full overflow-hidden relative min-w-0">
                  
                  {/* 1-A. 좌측: 악보 이미지 영역 */}
                  <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
                    <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar relative">
                      {isEditing && (
                        <div className="mb-6 max-w-4xl mx-auto">
                          <p className="text-[10px] font-bold text-[#A3A19B] uppercase tracking-wider mb-2 pl-1">가사 편집 (코드 제외 순수 가사)</p>
                          <textarea 
                            value={editedLyrics}
                            onChange={(e) => setEditedLyrics(e.target.value)}
                            className="w-full h-36 px-5 py-3.5 bg-white border border-[#E7E5DF] rounded-2xl text-xs leading-relaxed focus:outline-none focus:border-[#C96442] focus:ring-2 focus:ring-[#C96442]/10 text-[#2C2B29] font-serif shadow-2xs"
                            placeholder="코드를 제외한 순수 찬양 가사를 입력해 주세요..."
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
                          fileId={selectedSong?.fileId || selectedSong?.id || ''} 
                          storageUrl={selectedSong?.storageUrl || selectedSong?.filePath || ''}
                          alt={selectedSong?.title}
                          className="w-full h-auto block" 
                        />
                      </div>
                    </div>

                    {/* Floating Zoom Controls - 악보 영역의 정중앙 하단에 위치 */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
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

                  {/* 1-B. 우측: 코드 텍스트 / 송폼 창 (악보 우측 나란히 배치) */}
                  {showCodeText && (
                    <div className="w-full xl:w-[480px] 2xl:w-[540px] flex flex-col h-full bg-[#FAF9F5] border-t xl:border-t-0 xl:border-l border-[#E7E5DF] shrink-0 overflow-hidden shadow-xs">
                      {/* 최상단 탭 바: [코드악보TEXT] vs [송폼편집] */}
                      <div className="px-3 py-2 bg-[#F3EFEA] border-b border-[#E7E5DF] flex items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-[#E7E5DF] shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setRightPanelTab('chordText')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              rightPanelTab === 'chordText'
                                ? 'bg-[#FAF0EB] text-[#C96442] shadow-2xs'
                                : 'text-[#6A6864] hover:text-[#2C2B29]'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>코드악보TEXT</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRightPanelTab('songForm')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              rightPanelTab === 'songForm'
                                ? 'bg-[#FAF0EB] text-[#C96442] shadow-2xs'
                                : 'text-[#6A6864] hover:text-[#2C2B29]'
                            }`}
                          >
                            <Radio className="w-3.5 h-3.5" />
                            <span>송폼편집</span>
                          </button>
                        </div>

                        <button
                          onClick={() => setShowCodeText(false)}
                          className="p-1 hover:bg-[#E7E5DF] rounded-lg text-[#A3A19B] hover:text-[#2C2B29] transition-colors cursor-pointer"
                          title="우측 패널 닫기"
                        >
                          <X className="w-4 h-4 stroke-[1.8px]" />
                        </button>
                      </div>

                      {rightPanelTab === 'chordText' ? (
                        <>
                          {/* 상단 1열: [코드 & 가사] Key뱃지 ------------------ [조옮김] [복사] [저장] */}
                          <div className="p-3 bg-[#FAF9F5] border-b border-[#E7E5DF] flex flex-col gap-2 shrink-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#C96442]" />
                                <span className="text-xs font-bold text-[#2C2B29]">코드 & 가사</span>
                                {selectedSong?.code && (
                                  <span className="px-1.5 py-0.5 bg-[#FAF0EB] text-[#C96442] rounded text-[10px] font-bold border border-[#F1D3C6]">
                                    {selectedSong.code} KEY
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* 조옮김 컨트롤러 */}
                                <div className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-lg border border-[#E7E5DF] shadow-2xs shrink-0">
                                  <span className="text-[10px] font-bold text-[#8C877D] mr-1 shrink-0">조옮김</span>
                                  <button
                                    type="button"
                                    onClick={() => handleTranspose(-1)}
                                    className="w-5 h-5 shrink-0 flex items-center justify-center hover:bg-[#FAF0EB] text-[#2C2B29] hover:text-[#C96442] font-bold rounded text-xs transition-colors cursor-pointer"
                                    title="반음 내리기 (-1)"
                                  >
                                    -
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (transposeOffset !== 0) handleTranspose(-transposeOffset);
                                    }}
                                    className="w-9 h-5 shrink-0 flex items-center justify-center text-[10px] font-mono font-bold text-[#4A4741] hover:text-[#C96442] cursor-pointer text-center"
                                    title="원래 키로 리셋"
                                  >
                                    {transposeOffset === 0 ? '원키' : `${transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset}`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTranspose(1)}
                                    className="w-5 h-5 shrink-0 flex items-center justify-center hover:bg-[#FAF0EB] text-[#2C2B29] hover:text-[#C96442] font-bold rounded text-xs transition-colors cursor-pointer"
                                    title="반음 올리기 (+1)"
                                  >
                                    +
                                  </button>
                                </div>

                                {/* 복사 버튼 */}
                                <button
                                  onClick={() => {
                                    if (lyricsEditValue) {
                                      navigator.clipboard.writeText(lyricsEditValue);
                                      setCopiedLyrics(true);
                                      setTimeout(() => setCopiedLyrics(false), 2000);
                                    }
                                  }}
                                  disabled={!lyricsEditValue}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#6A6864] hover:text-[#C96442] hover:bg-[#FAF0EB] bg-white border border-[#E7E5DF] rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
                                  title="코드 및 가사 텍스트 복사"
                                >
                                  {copiedLyrics ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-600 font-bold text-[11px]">복사됨</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span className="text-[11px]">복사</span>
                                    </>
                                  )}
                                </button>

                                {/* 저장 버튼 */}
                                <button
                                  onClick={handleSaveLyrics}
                                  disabled={isSavingLyrics}
                                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs ${
                                    lyricsSavedNotice
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-[#C96442] hover:bg-[#B55434] text-white active:scale-95'
                                  }`}
                                  title="가사 및 코드 변경사항 저장"
                                >
                                  {lyricsSavedNotice ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 stroke-[2.5px]" />
                                      <span className="text-[11px]">저장됨</span>
                                    </>
                                  ) : (
                                    <>
                                      <Save className="w-3.5 h-3.5 stroke-[2px]" />
                                      <span className="text-[11px]">{isSavingLyrics ? '저장중' : '저장'}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* 상단 2열: [코드생성기] [코드 듣기 / 텍스트 돌아가기] 나란히 배치 + 설명글 */}
                            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-[#E7E5DF]/70">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                {/* 버튼 그룹: 항상 나란히 배치 */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* 코드생성기 버튼 (검정색) */}
                                  <button
                                    type="button"
                                    onClick={() => setShowChordBuilder(true)}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] rounded-lg transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95"
                                    title="12반음 코드 조합 생성기 열기"
                                  >
                                    <Plus className="w-3 h-3 stroke-[2.5px]" />
                                    <span>코드생성기</span>
                                  </button>

                                  {/* 모드 전환: [코드 듣기(검정)] vs [텍스트 돌아가기(흰색)] */}
                                  {chordViewMode === 'edit' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChordViewMode('play');
                                        setShowVirtualPiano(true);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
                                      title="코드를 터치하여 소리를 듣고 건반으로 확인하는 코드 듣기 모드로 전환"
                                    >
                                      <Volume2 className="w-3.5 h-3.5 text-[#F5A623]" />
                                      <span>코드 듣기</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChordViewMode('edit');
                                        setShowVirtualPiano(false);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#FAF9F5] text-[#2C2B29] hover:text-[#C96442] border border-[#E7E5DF] hover:border-[#F1D3C6] rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
                                      title="직접 가사와 코드를 타이핑하여 수정하는 텍스트 편집 모드로 복귀"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-[#C96442]" />
                                      <span>텍스트 돌아가기</span>
                                    </button>
                                  )}
                                </div>

                                {/* 코드 듣기 모드일 때 등장하는 악기 선택기 (피아노 기타 스트링 - 아이콘 삭제) */}
                                {chordViewMode === 'play' && (
                                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-[#E7E5DF] shrink-0">
                                    {(['piano', 'guitar', 'strings'] as InstrumentType[]).map((inst) => {
                                      const labels: Record<InstrumentType, string> = {
                                        piano: '피아노',
                                        guitar: '기타',
                                        strings: '스트링'
                                      };
                                      return (
                                        <button
                                          key={inst}
                                          type="button"
                                          onClick={() => setSelectedInstrument(inst)}
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                                            selectedInstrument === inst
                                              ? 'bg-[#C96442] text-white font-bold shadow-2xs'
                                              : 'text-[#6A6864] hover:text-[#2C2B29]'
                                          }`}
                                        >
                                          {labels[inst]}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* 설명글: 코드듣기 전 vs 후 */}
                              <div className="text-[11px] text-[#6A6864] font-medium tracking-tight">
                                {chordViewMode === 'edit'
                                  ? 'AI 특성상 가사&코드 싱크가 안맞을 경우 아래 수정하세요'
                                  : '코드를 수정하려면 버튼을 누르세요'
                                }
                              </div>
                            </div>
                          </div>

                          {/* 본문: 기본 텍스트 수정 모드(textarea) vs 코드 듣기 모드(InteractiveChordViewer) */}
                          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-white">
                            {chordViewMode === 'edit' ? (
                              <div className="flex-1 p-3 bg-white flex flex-col min-h-0 overflow-hidden">
                                <textarea
                                  value={lyricsEditValue}
                                  onChange={(e) => setLyricsEditValue(e.target.value)}
                                  placeholder="가사 및 코드를 입력하고 상단의 [저장] 버튼을 누르세요..."
                                  className="flex-1 w-full p-3.5 font-chord text-xs sm:text-sm text-[#2C2B29] leading-relaxed resize-none border border-[#E7E5DF] rounded-xl focus:outline-none focus:border-[#C96442] focus:ring-1 focus:ring-[#C96442]/20 custom-scrollbar bg-white overflow-x-auto whitespace-pre"
                                  spellCheck={false}
                                />
                              </div>
                            ) : (
                              <div className="flex-1 flex flex-col overflow-hidden relative">
                                <InteractiveChordViewer
                                  text={lyricsEditValue}
                                  instrument={selectedInstrument}
                                  onChordClick={(chordName, notes) => {
                                    setActivePianoNotes(notes);
                                  }}
                                  className="flex-1 h-full"
                                />
                              </div>
                            )}
                          </div>

                          {/* 하단: 코드 듣기 모드일 때 등장하는 가상 피아노 건반 */}
                          <AnimatePresence>
                            {chordViewMode === 'play' && showVirtualPiano && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="border-t border-[#3E3C38] shrink-0"
                              >
                                <VirtualPiano
                                  activeNotes={activePianoNotes}
                                  instrument={selectedInstrument}
                                  onKeyClick={(noteName) => {
                                    console.log('[VirtualPiano] Key pressed:', noteName);
                                  }}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      ) : (
                        <SongFormBuilder
                          title={selectedSong?.title || '찬양 곡'}
                          songKey={selectedSong?.code || 'C'}
                          meter={selectedSong?.meter || '4/4'}
                          rhythm={selectedSong?.rhythm || ''}
                          bpm={selectedSong?.bpm || 72}
                          initialText={selectedSong?.songFormText || selectedSong?.performanceMemo || ''}
                          initialBlocks={selectedSong?.songFormBlocks}
                          initialSongFormText={selectedSong?.songForm}
                          isSaving={isSavingSongForm}
                          onSave={async (data) => {
                            if (!selectedSongId || !selectedSong) return;
                            setIsSavingSongForm(true);
                            try {
                              const updatedFields = {
                                songForm: data.textSummary,
                                songFormBlocks: data.blocks,
                                code: data.code || selectedSong.code,
                                meter: data.meter || selectedSong.meter,
                                rhythm: data.rhythm || selectedSong.rhythm,
                                bpm: data.bpm || selectedSong.bpm,
                                songFormText: data.songFormText,
                                performanceMemo: data.songFormText,
                              };
                              setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, ...updatedFields } : s));
                              await hymnalApi.updateSong({
                                id: selectedSongId,
                                ...updatedFields,
                              });
                            } catch (err) {
                              console.error('[HymnalModule] 송폼 저장 오류:', err);
                            } finally {
                              setIsSavingSongForm(false);
                            }
                          }}
                          onLaunchPrompter={(data) => {
                            setPrompterBlocks(data.blocks);
                            setShowPrompter(true);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Youtube Player Side Panel (악보패널 옆에 나란히 flex 아이템으로 배치되어 악보패널을 밀어냄, 드래그 크기 조절 가능) */}
                <AnimatePresence>
                  {showYoutubePlayer && selectedSong && (
                    <motion.div 
                      key="youtube-player"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: youtubeWidth, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                      className="h-full bg-white border-l border-[#E7E5DF] flex flex-col shadow-xl relative z-30 shrink-0 overflow-hidden"
                      style={{ width: `${youtubeWidth}px` }}
                    >
                      {/* 좌측 리사이즈 드래그 핸들 (유튜브 창 크기 조정 가능 - 붉은색 효과 완전 삭제) */}
                      <div
                        onMouseDown={() => setIsResizingYoutube(true)}
                        className="absolute top-0 bottom-0 left-0 w-3.5 cursor-col-resize hover:bg-black/5 active:bg-black/10 transition-colors z-50 flex items-center justify-center -translate-x-1.5 group select-none"
                        title="좌우로 드래그하여 유튜브 창 크기 조절"
                      >
                        <div className="w-0.5 h-8 bg-[#D0CDC7] group-hover:bg-[#8C877D] group-hover:h-12 group-active:bg-[#5C5953] rounded-full transition-all" />
                      </div>

                      <div className="w-full flex flex-col h-full overflow-hidden bg-white">
                        {/* 1. 패널 헤더 */}
                        <div className="p-3 border-b border-[#E7E5DF] flex items-center justify-between bg-[#FAF9F5] shrink-0">
                          <div className="flex items-center gap-2">
                             <Youtube className="w-4 h-4 text-[#C96442]" />
                             <span className="font-serif text-xs font-bold text-[#2C2B29]">찬양 영상 & 라이브러리</span>
                             {selectedSong.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                               <span className="px-1.5 py-0.5 bg-[#FAF0EB] text-[#C96442] rounded-md text-[10px] font-bold">
                                 보관 {selectedSong.youtubeVideos.length}개
                               </span>
                             )}
                          </div>
                          <button 
                            onClick={() => setShowYoutubePlayer(false)} 
                            className="p-1 hover:bg-[#F5F3ED] rounded-lg cursor-pointer transition-colors"
                            title="유튜브 창 닫기"
                          >
                            <X className="w-4 h-4 text-[#A3A19B] hover:text-[#2C2B29] stroke-[1.8px]" />
                          </button>
                        </div>

                        {/* 2. 상단 플레이어 (미리보기 재생 또는 저장된 라이브러리 영상 재생) */}
                        {activePreviewVideoId ? (
                          <div className="bg-[#1C1A18] flex items-center justify-center overflow-hidden w-full aspect-video shrink-0 shadow-inner relative">
                            <iframe 
                              key={activePreviewVideoId}
                              width="100%" 
                              height="100%" 
                              src={`https://www.youtube.com/embed/${activePreviewVideoId}?enablejsapi=1&autoplay=1`}
                              title="YouTube video player" 
                              frameBorder="0" 
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                              allowFullScreen
                              className="w-full h-full aspect-video"
                            />
                          </div>
                        ) : selectedSong.youtubeVideos && selectedSong.youtubeVideos.length > 0 ? (
                          <div className="bg-[#1C1A18] flex items-center justify-center overflow-hidden w-full aspect-video shrink-0 shadow-inner">
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
                                className="w-full h-full aspect-video"
                              />
                            ) : (
                              <div className="text-center p-6">
                                <p className="text-xs font-medium text-[#A3A19B]">올바른 유튜브 링크가 아닙니다.</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-[#1C1A18] aspect-video flex flex-col items-center justify-center p-6 text-center shrink-0">
                            <Youtube className="w-8 h-8 text-[#5C5953] mb-2 stroke-[1.5px]" />
                            <p className="text-xs font-medium text-[#A3A19B]">선택된 찬양 영상이 없습니다.</p>
                            <p className="text-[11px] text-[#706E6B] mt-1">아래 검색 결과에서 [▶ 바로재생]을 눌러보세요.</p>
                          </div>
                        )}

                        {/* 3. 미리보기 중일 때 라이브러리 추가 유도 알림바 */}
                        {activePreviewVideoId && (
                          <div className="px-3 py-2 bg-[#FAF0EB] border-b border-[#F1D3C6] flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-200">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Play className="w-3.5 h-3.5 text-[#C96442] shrink-0 fill-[#C96442]" />
                              <span className="text-[11px] font-bold text-[#C96442] shrink-0">재생 중:</span>
                              <span className="text-[11px] text-[#2C2B29] font-medium truncate">
                                {youtubeSearchResults.find(r => r.videoId === activePreviewVideoId)?.title || '유튜브 영상'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(() => {
                                const previewItem = youtubeSearchResults.find(r => r.videoId === activePreviewVideoId);
                                const isAlreadySaved = selectedSong.youtubeVideos?.some(v => v.url?.includes(activePreviewVideoId));
                                if (isAlreadySaved) {
                                  return (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      담김
                                    </span>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (previewItem) {
                                        handleAddVideoToLibrary({ videoId: previewItem.videoId, title: previewItem.title });
                                      }
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-white bg-[#C96442] hover:bg-[#B55434] px-2 py-1 rounded-md transition-all shadow-2xs cursor-pointer active:scale-95"
                                  >
                                    <BookmarkPlus className="w-3 h-3" />
                                    <span>라이브러리에 담기</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        {/* 4. 유튜브 검색창 */}
                        <div className="p-3 bg-[#FAF9F5] border-b border-[#E7E5DF] shrink-0">
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSearchYoutube();
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <div className="relative flex-1">
                              <Search className="w-3.5 h-3.5 text-[#8C877D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="text"
                                value={youtubeSearchQuery}
                                onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                                placeholder="유튜브 찬양 영상 검색..."
                                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#DDD9D0] rounded-xl text-xs text-[#2C2B29] placeholder-[#A3A19B] focus:outline-none focus:border-[#C96442] focus:ring-1 focus:ring-[#C96442]/20"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={isSearchingYoutube}
                              className="flex items-center gap-1 px-3 py-1.5 bg-[#C96442] hover:bg-[#B55434] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                            >
                              {isSearchingYoutube ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <span>검색</span>
                              )}
                            </button>
                          </form>
                        </div>

                        {/* 5. 탭 헤더: [유튜브 검색 결과] vs [저장된 영상 목록] */}
                        <div className="px-3 pt-2 bg-[#FAF9F5] border-b border-[#E7E5DF] flex items-center justify-between gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setYoutubeTab('search')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                                youtubeTab === 'search'
                                  ? 'text-[#C96442] border-[#C96442] bg-white shadow-2xs'
                                  : 'text-[#6A6864] border-transparent hover:text-[#2C2B29]'
                              }`}
                            >
                              <span>유튜브 검색 결과</span>
                              {youtubeSearchResults.length > 0 && (
                                <span className="px-1.5 py-0.2 bg-[#FAF0EB] text-[#C96442] rounded-full text-[10px]">
                                  {youtubeSearchResults.length}
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setYoutubeTab('library')}
                              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                                youtubeTab === 'library'
                                  ? 'text-[#C96442] border-[#C96442] bg-white shadow-2xs'
                                  : 'text-[#6A6864] border-transparent hover:text-[#2C2B29]'
                              }`}
                            >
                              <span>저장된 영상 목록</span>
                              {selectedSong.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                                <span className="px-1.5 py-0.2 bg-[#FAF0EB] text-[#C96442] rounded-full text-[10px]">
                                  {selectedSong.youtubeVideos.length}
                                </span>
                              )}
                            </button>
                          </div>

                          {videoAddedNotice && (
                            <span className="text-[11px] font-bold text-emerald-600 animate-in fade-in flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[2.5px]" />
                              추가 완료!
                            </span>
                          )}
                        </div>

                        {/* 6. 탭 본문 (스크롤 리스트) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-[#FAF9F5]/50">
                          {youtubeTab === 'search' ? (
                            <div className="space-y-2.5">
                              {isSearchingYoutube ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center">
                                  <RefreshCw className="w-6 h-6 text-[#C96442] animate-spin mb-3" />
                                  <p className="text-xs font-bold text-[#2C2B29]">유튜브에서 찬양 영상을 검색하고 있습니다...</p>
                                  <p className="text-[11px] text-[#8C877D] mt-1">별도의 API 키 없이 실시간으로 결과를 불러옵니다.</p>
                                </div>
                              ) : youtubeSearchResults.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                                  <Search className="w-7 h-7 text-[#A3A19B] mb-2 stroke-[1.5px]" />
                                  <p className="text-xs font-bold text-[#2C2B29]">검색 결과가 없습니다.</p>
                                  <p className="text-[11px] text-[#8C877D] mt-1">상단 검색창에 곡명이나 찬양팀 이름을 입력하고 검색해보세요.</p>
                                </div>
                              ) : (
                                youtubeSearchResults.map((item) => {
                                  const isPlaying = activePreviewVideoId === item.videoId;
                                  const isAlreadySaved = selectedSong.youtubeVideos?.some(v => v.url?.includes(item.videoId));

                                  return (
                                    <div
                                      key={item.videoId}
                                      className={`p-2.5 bg-white border rounded-xl transition-all shadow-2xs hover:shadow-sm flex gap-3 group ${
                                        isPlaying ? 'border-[#C96442] ring-1 ring-[#C96442]/30 bg-[#FFFDFB]' : 'border-[#E7E5DF] hover:border-[#DDD9D0]'
                                      }`}
                                    >
                                      {/* 좌측: 썸네일 */}
                                      <div 
                                        onClick={() => setActivePreviewVideoId(item.videoId)}
                                        className="relative w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-black cursor-pointer group/thumb"
                                      >
                                        <img 
                                          src={item.thumbnailUrl || item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`} 
                                          alt={item.title} 
                                          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300" 
                                          loading="lazy" 
                                        />
                                        {item.duration && (
                                          <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/80 text-white text-[9px] font-mono rounded">
                                            {item.duration}
                                          </span>
                                        )}
                                        <div className="absolute inset-0 bg-black/20 group-hover/thumb:bg-black/40 flex items-center justify-center transition-colors">
                                          <Play className={`w-5 h-5 transition-transform ${isPlaying ? 'text-[#C96442] scale-110 fill-[#C96442]' : 'text-white opacity-80 group-hover/thumb:opacity-100 group-hover/thumb:scale-110'}`} />
                                        </div>
                                      </div>

                                      {/* 중앙 & 우측: 정보 및 액션 버튼 */}
                                      <div className="flex-1 flex flex-col justify-between min-w-0">
                                        <div>
                                          <p 
                                            onClick={() => setActivePreviewVideoId(item.videoId)}
                                            className="text-xs font-bold text-[#2C2B29] line-clamp-2 hover:text-[#C96442] cursor-pointer transition-colors leading-snug"
                                            title={item.title}
                                          >
                                            {item.title}
                                          </p>
                                          <p className="text-[10px] text-[#8C877D] mt-0.5 truncate">{item.channelTitle}</p>
                                        </div>

                                        <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-[#F5F3ED]">
                                          {/* 바로재생 버튼 */}
                                          <button
                                            type="button"
                                            onClick={() => setActivePreviewVideoId(item.videoId)}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                              isPlaying 
                                                ? 'bg-[#C96442] text-white shadow-2xs' 
                                                : 'text-[#6A6864] hover:text-[#2C2B29] hover:bg-[#FAF9F5]'
                                            }`}
                                          >
                                            <Play className={`w-3 h-3 ${isPlaying ? 'fill-white' : ''}`} />
                                            <span>{isPlaying ? '재생중' : '바로재생'}</span>
                                          </button>

                                          {/* 라이브러리 추가 버튼 */}
                                          {isAlreadySaved ? (
                                            <span className="flex items-center gap-1 text-[10px] font-medium text-white bg-[#1E1E1E] px-2 py-0.5 rounded shadow-2xs">
                                              <Check className="w-2.5 h-2.5 stroke-[2.5px] text-white" />
                                              담김
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleAddVideoToLibrary({ videoId: item.videoId, title: item.title })}
                                              className="flex items-center gap-1 px-2.5 py-0.5 bg-[#FAF0EB] hover:bg-[#F3DDD2] text-[#C96442] font-bold rounded text-[10px] border border-[#F1D3C6] transition-all cursor-pointer shadow-2xs active:scale-95"
                                              title="이 곡의 찬양 영상 목록에 추가"
                                            >
                                              <Plus className="w-3 h-3 stroke-[2.5px]" />
                                              <span>라이브러리에 담기</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {!selectedSong.youtubeVideos || selectedSong.youtubeVideos.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                                  <Youtube className="w-7 h-7 text-[#A3A19B] mb-2 stroke-[1.5px]" />
                                  <p className="text-xs font-bold text-[#2C2B29]">저장된 찬양 영상이 없습니다.</p>
                                  <p className="text-[11px] text-[#8C877D] mt-1">[유튜브 검색 결과] 탭에서 원하는 영상을 찾아 [+ 담기] 버튼을 눌러보세요.</p>
                                </div>
                              ) : (
                                selectedSong.youtubeVideos.map((video, idx) => {
                                  const isCurrentActive = !activePreviewVideoId && activeVideoIndex === idx;
                                  return (
                                    <div
                                      key={idx}
                                      className={`p-2.5 bg-white border rounded-xl flex items-center justify-between gap-3 transition-all shadow-2xs ${
                                        isCurrentActive ? 'border-[#C96442] ring-1 ring-[#C96442]/30 bg-[#FFFDFB]' : 'border-[#E7E5DF] hover:border-[#DDD9D0]'
                                      }`}
                                    >
                                      <div 
                                        onClick={() => {
                                          setActivePreviewVideoId(null);
                                          setActiveVideoIndex(idx);
                                        }}
                                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                      >
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                          isCurrentActive ? 'bg-[#C96442] text-white' : 'bg-[#FAF9F5] text-[#8C877D] border border-[#E7E5DF]'
                                        }`}>
                                          {idx + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className={`text-xs font-bold truncate ${isCurrentActive ? 'text-[#C96442]' : 'text-[#2C2B29]'}`}>
                                            {video.name || `찬양 영상 ${idx + 1}`}
                                          </p>
                                          <p className="text-[10px] text-[#A3A19B] truncate font-mono mt-0.5">{video.url}</p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActivePreviewVideoId(null);
                                            setActiveVideoIndex(idx);
                                          }}
                                          className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            isCurrentActive 
                                              ? 'bg-[#FAF0EB] text-[#C96442]' 
                                              : 'text-[#6A6864] hover:bg-[#FAF9F5] hover:text-[#2C2B29]'
                                          }`}
                                          title="이 영상 재생"
                                        >
                                          <Play className={`w-3.5 h-3.5 ${isCurrentActive ? 'fill-[#C96442]' : ''}`} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveVideoFromLibrary(idx)}
                                          className="p-1.5 hover:bg-rose-50 text-[#A3A19B] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                          title="라이브러리에서 제거"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 stroke-[1.8px]" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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

      {/* 12반음 체계 코드 조합기 모달 */}
      <ChordBuilderModal
        isOpen={showChordBuilder}
        onClose={() => setShowChordBuilder(false)}
        instrument={selectedInstrument}
        onInsertChord={handleInsertChordFromBuilder}
        onChordSelect={(notes) => setActivePianoNotes(notes)}
      />

      {/* 실전 무대용 라이브 프롬프터 모달 */}
      {showPrompter && (
        <LiveStagePrompter
          title={selectedSong?.title || '찬양'}
          songKey={selectedSong?.code || 'C'}
          meter={selectedSong?.meter || '4/4'}
          rhythm={selectedSong?.rhythm || ''}
          performanceMemo={selectedSong?.performanceMemo || ''}
          instrumentMemo={selectedSong?.instrumentMemo || ''}
          songFormText={selectedSong?.songFormText || selectedSong?.performanceMemo || ''}
          bpm={selectedSong?.bpm || 72}
          blocks={prompterBlocks.length > 0 ? prompterBlocks : (selectedSong?.songFormBlocks || [])}
          onClose={() => setShowPrompter(false)}
        />
      )}

    </div>
  );
};

