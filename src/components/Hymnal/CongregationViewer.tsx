import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../api/firebaseConfig';
import { doc, getDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { imageCache } from '../../utils/imageCache';
import { gdriveWebService } from '../../api/gdriveWebService';
import { 
  ChevronLeft, ChevronRight, Download, Loader2, Music, Maximize2, Minimize2, 
  AlertCircle, Sparkles, Share2, Check, ShieldAlert, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateContiPackagePDF, type PackageSongItem } from '../../utils/pdfPackageGenerator';

// 브라우저 로컬 스토리지 기반 기기 고유 식별자 (1인 1카운트 보장)
const getDeviceId = (): string => {
  let id = localStorage.getItem('studio-device-id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('studio-device-id', id);
  }
  return id;
};

const MAX_VIEWERS_LIMIT = 50; // 소그룹 최대 접속 한도 (50명)

interface SongItem {
  itemId: string;
  songId: string;
  title: string;
  code?: string;
  meter?: string;
  filePath?: string;
  fileId?: string;
  crop?: { top: number; bottom: number; left: number; right: number };
}

export const CongregationViewer: React.FC<{
  initialContiId?: string | null;
}> = ({ initialContiId }) => {
  const params = new URLSearchParams(window.location.search);
  const teamParam = params.get('team');
  const contiIdParam = params.get('contiId') || initialContiId;
  const worshipTeamName = teamParam ? decodeURIComponent(teamParam) : '찬양 콘티';

  const [contiTitle, setContiTitle] = useState<string>('예배 찬양 콘티');
  const [songsList, setSongsList] = useState<SongItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false); // 50명 초과 차단 상태
  const [activeViewerCount, setActiveViewerCount] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Firestore에서 콘티 정보 불러오기 및 기기 카운팅
  useEffect(() => {
    if (!contiIdParam) {
      setLoadError('콘티 식별자(contiId)가 올바르지 않습니다.');
      setIsLoading(false);
      return;
    }

    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const contiDocRef = doc(db, 'teams', cleanTeamId, 'contis', contiIdParam);
    const myDeviceId = getDeviceId();

    const unsubscribe = onSnapshot(contiDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setContiTitle(data.title || '예배 찬양 콘티');

        // 1. 유효기간(발행 후 7일) 체크
        const publishedAt = data.publishedAt || 0;
        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (publishedAt > 0 && now - publishedAt > SEVEN_DAYS_MS) {
          setLoadError('본 찬양 콘티 링크는 유효기간(7일)이 만료되었습니다. 인도자에게 최신 링크를 요청하세요.');
          setIsLoading(false);
          return;
        }

        // 2. 50명 기기 카운터 판별
        const viewerDevices: string[] = Array.isArray(data.viewerDevices) ? data.viewerDevices : [];
        const isAlreadyRegistered = viewerDevices.includes(myDeviceId);
        setActiveViewerCount(viewerDevices.length);

        if (!isAlreadyRegistered && viewerDevices.length >= MAX_VIEWERS_LIMIT) {
          // 50명이 이미 꽉 찼고, 나는 새로운 기기인 경우 차단!
          setIsBlocked(true);
          setIsLoading(false);
          return;
        }

        // 정상 허용: 내가 아직 목록에 없다면 1회성 atomic 등록 (+1)
        if (!isAlreadyRegistered) {
          updateDoc(contiDocRef, {
            viewerDevices: arrayUnion(myDeviceId)
          }).catch(console.warn);
        }

        setIsBlocked(false);

        // 3. 곡 목록 세팅
        if (data.songsInfo && Array.isArray(data.songsInfo) && data.songsInfo.length > 0) {
          const list: SongItem[] = data.songsInfo.map((s: any) => ({
            itemId: s.itemId || s.songId,
            songId: s.songId,
            title: s.title || '제목 없음',
            code: s.code || '',
            meter: s.meter || '',
            filePath: s.filePath || '',
            fileId: s.fileId || '',
            crop: s.crop || null
          }));
          setSongsList(list);
          setLoadError(null);
        } else {
          setLoadError('등록된 악보가 아직 발행되지 않았습니다.');
        }
      } else {
        setLoadError('지정된 찬양 콘티를 찾을 수 없습니다.');
      }
      setIsLoading(false);
    }, (err) => {
      console.warn('[CongregationViewer] load error:', err);
      setLoadError('콘티를 불러오는 중 오류가 발생했습니다.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [contiIdParam, worshipTeamName]);

  // 키보드 방향키 네비게이션
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentIndex(prev => Math.min(prev + 1, Math.max(0, songsList.length - 1)));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentIndex(prev => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [songsList.length]);

  // 전체화면 토글
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // 모바일 PDF 다운로드 (기기 즉석 생성, 서버 비용 0원)
  const handleDownloadPdf = async () => {
    if (isDownloadingPdf || songsList.length === 0) return;
    setIsDownloadingPdf(true);
    setPdfProgressText('PDF 생성 중...');

    try {
      const itemsForPdf: PackageSongItem[] = songsList.map(s => ({
        itemId: s.itemId,
        songId: s.songId,
        title: s.title,
        code: s.code,
        meter: s.meter,
        filePath: s.filePath,
        fileId: s.fileId,
        crop: s.crop,
        memo: '' // 회중용이므로 멘트 제외
      }));

      const pdfBlob = await generateContiPackagePDF(
        contiTitle,
        itemsForPdf,
        worshipTeamName,
        (msg, percent) => {
          setPdfProgressText(`${percent}%`);
        }
      );

      const fileName = `[회중용]_${contiTitle}.pdf`;
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
    } catch (e: any) {
      alert('PDF 생성 실패: ' + (e.message || ''));
    } finally {
      setIsDownloadingPdf(false);
      setPdfProgressText('');
    }
  };

  // 링크 복사
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const currentSong = songsList[currentIndex];

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#121214] text-white flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-[#D97757] animate-spin mb-4" />
        <p className="text-sm font-medium text-zinc-300">예배 찬양 악보를 준비하고 있습니다...</p>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="fixed inset-0 bg-[#0F0F10] text-white flex flex-col items-center justify-center p-6 text-center z-50">
        <div className="w-16 h-16 bg-[#3B1812] border border-[#6B2A1E] text-[#E06D53] rounded-3xl flex items-center justify-center mb-5 shadow-2xl">
          <ShieldAlert className="w-8 h-8 stroke-[2px]" />
        </div>
        <span className="px-3 py-1 bg-[#2C1914] text-[#E08A6C] border border-[#5C3224] rounded-full text-xs font-semibold mb-3">
          소그룹 무료 접속 제한 (최대 50명)
        </span>
        <h2 className="text-xl font-bold mb-2 text-white">동시 접속 인원이 초과되었습니다</h2>
        <p className="text-sm text-zinc-400 mb-6 max-w-sm leading-relaxed">
          본 악보 뷰어는 <strong className="text-[#F3C5B5]">소그룹 전용으로 최대 50명</strong>까지만 접속이 허용되어 있습니다.<br/>
          현재 50개의 스마트폰이 모두 접속 중이어서 신규 접속이 제한되었습니다.
        </p>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 max-w-xs w-full text-xs text-zinc-400 mb-6 text-left">
          <p className="text-zinc-200 font-semibold mb-1">💡 이용 안내</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>기존 접속자가 브라우저를 종료하면 차례대로 접속할 수 있습니다.</li>
            <li>대예배 및 50명 이상 대규모 인원은 대예배 전용 플랜을 이용해 주세요.</li>
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-bold shadow-lg transition-colors cursor-pointer"
        >
          접속 다시 시도하기
        </button>
      </div>
    );
  }

  if (loadError || songsList.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#121214] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 bg-zinc-800/80 rounded-2xl flex items-center justify-center mb-4 text-[#D97757]">
          <Music className="w-7 h-7 stroke-[1.8px]" />
        </div>
        <h2 className="text-lg font-bold mb-2">{contiTitle}</h2>
        <p className="text-sm text-zinc-400 mb-6 max-w-xs">{loadError || '표시할 악보가 없습니다.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0F0F10] text-zinc-100 flex flex-col select-none overflow-hidden font-sans">
      {/* 상단 1. 필수 안내 배지: 소그룹용 50명 제한 안내 */}
      <div className="w-full bg-[#261E1A] border-b border-[#5C3224]/40 px-3 py-1.5 flex items-center justify-center gap-2 text-center shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#E08A6C] shrink-0" />
        <span className="text-[11px] sm:text-xs font-medium text-[#F3C5B5] tracking-tight">
          소그룹용으로 50명 이상 접속 시 뷰어가 제한됩니다.
        </span>
        <span className="px-1.5 py-0.5 bg-[#3B1E16] text-[#E08A6C] rounded-md text-[10px] font-mono font-bold">
          {activeViewerCount} / 50명
        </span>
      </div>

      {/* 상단 2. 네비게이션 헤더 */}
      <header className="h-12 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-[#D97757]/15 text-[#D97757] flex items-center justify-center shrink-0">
            <Music className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-[160px] sm:max-w-[280px]">
              {currentSong?.title || contiTitle}
            </h1>
            <p className="text-[10px] text-zinc-400 truncate">
              {worshipTeamName} {currentSong?.code ? `• Key: ${currentSong.code}` : ''}
            </p>
          </div>
        </div>

        {/* 곡 순서 인디케이터 (예: 1 / 5) */}
        <div className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-bold font-mono text-zinc-200">
          <span className="text-[#D97757]">{currentIndex + 1}</span>
          <span className="text-zinc-500">/</span>
          <span>{songsList.length}</span>
        </div>

        {/* 우측 툴 버튼: PDF 다운로드, 링크 복사, 전체화면 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg text-xs font-semibold text-zinc-200 transition-colors shadow-2xs"
            title="회중용 악보 PDF 저장 (서버 비용 0원)"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D97757]" />
            ) : (
              <Download className="w-3.5 h-3.5 stroke-[1.8px] text-[#D97757]" />
            )}
            <span className="hidden sm:inline">{isDownloadingPdf ? pdfProgressText : 'PDF 저장'}</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 transition-colors"
            title="회중 뷰어 링크 복사"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 transition-colors hidden sm:flex"
            title="전체화면"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 중앙 악보 뷰어 영역 (스와이프 및 클릭 넘김) */}
      <main className="flex-1 relative flex items-center justify-center p-1 sm:p-3 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSong?.itemId || currentIndex}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full h-full flex items-center justify-center"
          >
            <CongregationImageRenderer item={currentSong} />
          </motion.div>
        </AnimatePresence>

        {/* 좌우 넘김 터치 버튼 (화면 양옆) */}
        {currentIndex > 0 && (
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white shadow-xl transition-all active:scale-95 z-30"
            title="이전 악보"
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.2px]" />
          </button>
        )}

        {currentIndex < songsList.length - 1 && (
          <button
            onClick={() => setCurrentIndex(prev => Math.min(prev + 1, songsList.length - 1))}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white shadow-xl transition-all active:scale-95 z-30"
            title="다음 악보"
          >
            <ChevronRight className="w-6 h-6 stroke-[2.2px]" />
          </button>
        )}
      </main>

      {/* 하단 썸네일/인디케이터 바 */}
      <footer className="h-11 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-20">
        <button
          onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>이전</span>
        </button>

        {/* 탭식 미니 도트/목록 */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60%] py-1 no-scrollbar">
          {songsList.map((s, idx) => (
            <button
              key={s.itemId || idx}
              onClick={() => setCurrentIndex(idx)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all shrink-0 ${
                idx === currentIndex
                  ? 'bg-[#D97757] text-white font-bold shadow-xs'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {idx + 1}. {s.title}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCurrentIndex(prev => Math.min(prev + 1, songsList.length - 1))}
          disabled={currentIndex >= songsList.length - 1}
          className="flex items-center gap-1 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
        >
          <span>다음</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </footer>
    </div>
  );
};

// 악보 이미지 로더 컴포넌트 (크롭 및 캐싱 처리)
const CongregationImageRenderer: React.FC<{ item?: SongItem }> = ({ item }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (!item) return;

    const fileId = item.filePath || item.fileId || '';
    if (!fileId) {
      setIsLoading(false);
      return;
    }

    const loadScore = async () => {
      setIsLoading(true);
      try {
        // 1. IndexedDB 캐시 조회
        const cacheKeys = [item.fileId, item.filePath, item.songId, fileId].filter(Boolean);
        for (const key of cacheKeys) {
          const cached = await imageCache.getImage(key as string);
          if (cached && isMounted) {
            setImgUrl(URL.createObjectURL(cached));
            setIsLoading(false);
            return;
          }
        }

        // 2. Storage URL인 경우 직접 fetch & 캐싱
        if (fileId.startsWith('http') || fileId.includes('/')) {
          const res = await fetch(fileId);
          if (res.ok) {
            const blob = await res.blob();
            if (isMounted) {
              setImgUrl(URL.createObjectURL(blob));
              setIsLoading(false);
              imageCache.saveImage(fileId, blob).catch(() => {});
              return;
            }
          }
        }

        // 3. fallback: gdriveWebService
        const blob = await gdriveWebService.getFileBlob(fileId);
        if (blob && isMounted) {
          setImgUrl(URL.createObjectURL(blob));
          setIsLoading(false);
          imageCache.saveImage(fileId, blob).catch(() => {});
        } else if (isMounted) {
          setIsLoading(false);
        }
      } catch (e) {
        console.warn('[CongregationImageRenderer] load fail:', e);
        if (isMounted) setIsLoading(false);
      }
    };

    loadScore();
    return () => {
      isMounted = false;
    };
  }, [item?.filePath, item?.fileId, item?.songId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97757] mb-2" />
        <span className="text-xs">악보 고화질 로딩 중...</span>
      </div>
    );
  }

  if (!imgUrl) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-zinc-500">
        <AlertCircle className="w-8 h-8 mb-2" />
        <span className="text-xs">악보 이미지를 표시할 수 없습니다.</span>
      </div>
    );
  }

  // 크롭 스타일 적용
  const crop = item?.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const hasCrop = (crop.top || 0) > 0 || (crop.bottom || 0) > 0 || (crop.left || 0) > 0 || (crop.right || 0) > 0;

  if (hasCrop) {
    const top = crop.top || 0;
    const bottom = crop.bottom || 0;
    const left = crop.left || 0;
    const right = crop.right || 0;
    const visibleWidthPercent = 100 - left - right;
    const visibleHeightPercent = 100 - top - bottom;

    return (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <div 
          className="relative overflow-hidden flex items-center justify-center max-w-full max-h-full"
          style={{
            aspectRatio: `${visibleWidthPercent} / ${visibleHeightPercent}`,
          }}
        >
          <img
            src={imgUrl}
            alt={item?.title || '악보'}
            className="max-w-none pointer-events-none select-none object-contain shadow-2xl"
            style={{
              width: `${(100 / visibleWidthPercent) * 100}%`,
              height: `${(100 / visibleHeightPercent) * 100}%`,
              transform: `translate(${-left * ((100 / visibleWidthPercent) / 100) * 100}%, ${-top * ((100 / visibleHeightPercent) / 100) * 100}%)`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <img
      src={imgUrl}
      alt={item?.title || '악보'}
      className="max-w-full max-h-full object-contain pointer-events-none select-none shadow-2xl rounded-sm"
    />
  );
};
