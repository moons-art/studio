import React, { useState, useEffect, useCallback } from 'react';
import type { ContiItem } from '../../stores/HymnalProvider';
import { useHymnal } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { X, ChevronLeft, ChevronRight, Library, StickyNote, Monitor, Users, FileText, Loader2, Share2, Check, Download, ChevronUp, ChevronDown, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../../api/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { shareInviteViaKakao } from '../../utils/socialAuth';

interface LeaderViewerProps {
  onClose: () => void;
  onOpenLibrary?: () => void;
}

export const LeaderViewer: React.FC<LeaderViewerProps> = ({ onClose, onOpenLibrary }) => {
  const { contiItems, songs, contiTitle, currentContiId } = useHymnal();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ msg: '', percent: 0 });
  const [genResultUrl, setGenResultUrl] = useState<string | null>(null); // 생성 결과 URL 저장
  const [genFileId, setGenFileId] = useState<string | null>(null); // 생성 결과 파일 ID 저장
  const [showMenuBar, setShowMenuBar] = useState(true); // 상단 메뉴 노출 여부 상태 추가
  
  // 공동체 명칭 상태: localStorage에서 읽어오고 없으면 기본값 사용
  const [communityName, setCommunityName] = useState(() => {
    return localStorage.getItem('nations-community-name') || localStorage.getItem('ceum-community-name') || 'NATIONS CHURCH';
  });

  // 명칭 변경 시 localStorage에 즉시 저장
  useEffect(() => {
    localStorage.setItem('nations-community-name', communityName);
    localStorage.setItem('ceum-community-name', communityName);
  }, [communityName]);

  // 회중용 웹 뷰어 공유 상태
  const [isPublishingCongregation, setIsPublishingCongregation] = useState(false);
  const [showCongregationModal, setShowCongregationModal] = useState(false);
  const [congregationUrl, setCongregationUrl] = useState('');
  const [isCopiedCongregation, setIsCopiedCongregation] = useState(false);

  const handleOpenCongregationShare = async () => {
    if (visibleItems.length === 0) {
      alert('콘티에 악보가 없습니다.');
      return;
    }
    setIsPublishingCongregation(true);

    try {
      // 1. 콘티 ID 확정 (없으면 임시 ID 생성)
      const targetContiId = currentContiId || `conti_${Date.now()}`;
      const cleanTeamId = (communityName || 'NATIONS CHURCH').trim().replace(/[\/\s#?]/g, '_');
      const contiDocRef = doc(db, 'teams', cleanTeamId, 'contis', targetContiId);

      // 2. 회중들이 읽을 수 있도록 songsInfo 구성
      const songsInfo = visibleItems.map((item) => {
        const song = songs.find(s => {
          if (!s || !s.id || !item.songId) return false;
          const sId = s.id.toString();
          const tId = item.songId.toString();
          return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
        });
        return {
          itemId: item.id,
          songId: song?.id || item.songId,
          title: song?.title || '제목 없음',
          code: song?.code || '',
          meter: song?.meter || '',
          filePath: song?.filePath || '',
          fileId: song?.fileId || '',
          crop: item.crop || null
        };
      });

      // 3. Firestore에 공개 콘티 문서 저장
      await setDoc(contiDocRef, {
        id: targetContiId,
        title: contiTitle || '예배 찬양 콘티',
        items: visibleItems,
        songsInfo,
        updatedAt: new Date().toISOString(),
        publishedAt: Date.now()
      }, { merge: true });

      // 4. 회중용 웹 뷰어 URL 생성
      const url = `${window.location.origin}${window.location.pathname}?mode=congregation&team=${encodeURIComponent(communityName)}&contiId=${targetContiId}`;
      setCongregationUrl(url);
      setShowCongregationModal(true);

      // 클립보드에 기본 복사
      const shareText = `[${contiTitle || '예배 찬양'}] 회중용 악보 뷰어\n(소그룹용으로 50명 이상 접속 시 뷰어가 제한됩니다)\n${url}`;
      navigator.clipboard.writeText(shareText).catch(() => {});
    } catch (e: any) {
      console.error('[LeaderViewer] Congregation share error:', e);
      alert('회중 링크 생성 중 오류: ' + (e.message || ''));
    } finally {
      setIsPublishingCongregation(false);
    }
  };
  
  // 인도자용 뷰어에 표시할 항목 (화면에 배치된 항목들만)
  const visibleItems = contiItems.filter(item => item.isVisible);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMemo, setShowMemo] = useState(true);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const handleNext = useCallback(() => {
    if (currentIndex < visibleItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, visibleItems.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // 키보드 방향키 조작 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'm' || e.key === 'M') {
        setShowMemo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);


  const handleGeneratePDF = async (type: 'leader' | 'congregation') => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenProgress({ msg: 'PDF 엔진 부팅 중...', percent: 0 });

    // 진행률 구독
    const unsubscribe = hymnalApi.onPDFProgress((data) => {
      setGenProgress(data);
    });

    try {
      const itemsToGenerate = visibleItems.map(item => {
        const song = songs.find(s => {
          if (!s || !s.id || !item.songId) return false;
          const sId = s.id.toString();
          const tId = item.songId.toString();
          return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
        });
        return {
          id: item.id,
          songId: item.songId, // songId 매핑 추가
          filename: song?.filename || '',
          crop: item.crop,     // 크롭 영역 누락 복원
          page: item.page,     // 페이지 번호 복원
          isVisible: item.isVisible,
          // 회중용일 경우 멘트(비고)를 제거하여 생성
          memo: type === 'congregation' ? '' : item.memo,
          memoFontSize: item.memoFontSize || 12,
        };
      });

      const result = await hymnalApi.generatePDF({
        title: contiTitle || '새 찬양 콘티',
        type,
        items: itemsToGenerate,
        songs, // 현재 로드된 곡 목록 인입
        footer: communityName // 공동체 명칭 전달
      });

      if (result.success && result.url) {
        setIsGenerating(false); 
        // 사용자 요청 형식 반영: [콘티제목] 악보보기 링크
        const shareText = `[${contiTitle || '새 찬양 콘티'}] 악보보기 링크\n${result.url}`;
        hymnalApi.writeClipboard(shareText);
        setGenFileId(result.fileId || null);
        setGenResultUrl(result.url); // 결과 URL 세팅 (자동으로 완료 UI 노출)
      } else {
        setIsGenerating(false);
        alert(`PDF 생성 실패: ${result.message || '다시 시도해주세요.'}`);
      }
    } catch (err: any) {
      setIsGenerating(false);
      alert(`오류 발생: ${err.message}`);
    } finally {
      if (unsubscribe) unsubscribe();
    }
  };

  if (visibleItems.length === 0) {
    return (
      <div className="fixed inset-0 z-[10000] bg-[#FAF9F5] flex flex-col items-center justify-center text-[#2B2927]">
        <p className="font-serif text-base font-bold mb-4">현재 콘티에 배치된 악보가 없습니다.</p>
        <button 
          onClick={onClose}
          className="px-5 py-2 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const safeIndex = currentIndex >= visibleItems.length ? Math.max(0, visibleItems.length - 1) : currentIndex;
  const currentItem = visibleItems[safeIndex];
  const currentSong = songs.find(s => {
    if (!s || !s.id || !currentItem.songId) return false;
    const sId = s.id.toString();
    const tId = currentItem.songId.toString();
    return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
  });
  const crop = currentItem.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
  const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;
  
  const currentImageRatio = imageRatios[currentItem.id] || 1; // 가로/세로 비율 (디폴트 1)
  const finalAspectRatio = currentImageRatio * (visibleWidthFactor / visibleHeightFactor);

  // 리스트 내의 모든 이미지를 뷰어가 열릴 때 백그라운드에서 미리 캐싱/다운로드
  useEffect(() => {
    let isMounted = true;

    const loadImages = async () => {
      const { gdriveWebService } = await import('../../api/gdriveWebService');
      
      for (const item of visibleItems) {
        if (!isMounted) break;
        
        const song = songs.find(s => {
          if (!s || !s.id || !item.songId) return false;
          const sId = s.id.toString();
          const tId = item.songId.toString();
          return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
        });
        
        if (!song) continue;
        
        const fileId = song.fileId || song.filePath || song.filename;
        if (fileId && fileId.length > 20 && !fileId.startsWith('/')) {
          setBlobUrls(prev => {
            if (prev[song.id]) return prev;
            
            gdriveWebService.downloadImageBlob(fileId).then(url => {
              if (isMounted && url) {
                setBlobUrls(current => ({ ...current, [song.id]: url }));
              }
            });
            
            return prev;
          });
        }
      }
    };

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [visibleItems, songs]);

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 z-[10000] bg-[#FAF9F5] flex flex-col overflow-hidden text-[#2B2927]"
      >
        {/* 뷰어 컨트롤 바 */}
        <AnimatePresence>
          {showMenuBar && (
            <motion.div
              initial={{ y: -80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -80, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 px-4 py-2.5 z-50 bg-[#FAF9F5]/95 backdrop-blur-md border-b border-[#E5E0D8] shadow-2xs flex items-center justify-between gap-3"
            >
              {/* 좌측: 닫기 버튼 및 곡 제목 정보 */}
              <div className="flex items-center gap-3 min-w-0">
                <button 
                  onClick={onClose}
                  className="p-1.5 hover:bg-[#F3EFE9] text-[#6A6864] hover:text-[#2B2927] rounded-lg transition-colors cursor-pointer shrink-0"
                  title="뷰어 닫기"
                >
                  <X className="w-5 h-5 stroke-[1.8px]" />
                </button>
                <div className="flex items-baseline gap-2 min-w-0">
                  <h2 className="font-serif text-sm sm:text-base font-bold text-[#2B2927] tracking-tight truncate">
                    {currentSong?.title}
                  </h2>
                  <span className="text-xs text-[#8C877D] font-medium shrink-0">
                    ({currentIndex + 1} / {visibleItems.length})
                  </span>
                </div>
              </div>

              {/* 우측 도구들 */}
              <div className="flex items-center gap-2 shrink-0">
                {onOpenLibrary && (
                  <button
                    onClick={onOpenLibrary}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                  >
                    <Library className="w-3.5 h-3.5 stroke-[1.8px] text-[#6E6A63]" />
                    <span className="hidden sm:inline">저장소</span>
                  </button>
                )}

                {/* PDF 생성 버튼 군 */}
                <div className="flex items-center bg-[#F3EFE9] rounded-lg p-0.5 border border-[#E5E0D8]">
                  <div className="hidden lg:flex items-center px-2 gap-1.5 border-r border-[#E5E0D8]">
                    <span className="text-[10px] font-medium text-[#8C877D]">공동체</span>
                    <input 
                      type="text"
                      value={communityName}
                      onChange={(e) => setCommunityName(e.target.value)}
                      placeholder="명칭..."
                      className="bg-transparent border-none text-xs font-semibold text-[#2B2927] focus:outline-none w-20 placeholder:text-[#A8A49C]"
                    />
                  </div>
                  
                  {/* 회중용 실시간 웹 뷰어 링크 발행 및 카톡 공유 버튼 */}
                  <button
                    onClick={handleOpenCongregationShare}
                    disabled={isPublishingCongregation}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] rounded-md text-xs font-bold transition-all cursor-pointer shadow-2xs"
                    title="소그룹용 회중 전용 웹 뷰어 카톡 전송 및 링크 복사"
                  >
                    {isPublishingCongregation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Users className="w-3.5 h-3.5 stroke-[2.2px]" />
                    )}
                    <span>회중 뷰어 링크</span>
                  </button>

                  <button
                    onClick={() => handleGeneratePDF('leader')}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#EBE5DC] text-[#D97757] rounded-md text-xs font-medium transition-colors cursor-pointer"
                    title="멘트가 포함된 인도자용 PDF 다운로드"
                  >
                    <FileText className="w-3 h-3 stroke-[1.8px]" />
                    <span>PDF(인도자)</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowMemo(!showMemo)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    showMemo 
                      ? 'bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6]' 
                      : 'text-[#6A6864] hover:bg-[#F3EFE9]'
                  }`}
                >
                  <StickyNote className="w-3.5 h-3.5 stroke-[1.8px]" />
                  <span>멘트 {showMemo ? 'ON' : 'OFF'}</span>
                </button>

                {/* 메뉴 숨기기 버튼 */}
                <button
                  onClick={() => setShowMenuBar(false)}
                  className="p-1.5 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                  title="메뉴바 숨기기"
                >
                  <ChevronUp className="w-4 h-4 stroke-[1.8px]" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 메뉴 숨겼을 때 노출되는 플로팅 버튼 */}
        {!showMenuBar && (
          <button
            onClick={() => setShowMenuBar(true)}
            className="fixed top-3 right-4 z-[10005] p-2 bg-white hover:bg-[#F3EFE9] text-[#2B2927] hover:text-[#D97757] rounded-full transition-all active:scale-95 shadow-md border border-[#E5E0D8] cursor-pointer"
            title="메뉴바 보이기"
          >
            <ChevronDown className="w-4 h-4 stroke-[1.8px]" />
          </button>
        )}

        {/* 이전/다음 네비게이션 버튼 */}
        <button 
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 z-50 bg-white/80 hover:bg-white text-[#6A6864] hover:text-[#D97757] disabled:opacity-0 rounded-full border border-[#E5E0D8] shadow-md transition-all cursor-pointer"
          title="이전 곡"
        >
          <ChevronLeft className="w-6 h-6 stroke-[1.8px]" />
        </button>

        <button 
          onClick={handleNext}
          disabled={currentIndex === visibleItems.length - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 z-50 bg-white/80 hover:bg-white text-[#6A6864] hover:text-[#D97757] disabled:opacity-0 rounded-full border border-[#E5E0D8] shadow-md transition-all cursor-pointer"
          title="다음 곡"
        >
          <ChevronRight className="w-6 h-6 stroke-[1.8px]" />
        </button>

        {/* 메인 악보 뷰어 영역 */}
        <div 
          className={`flex-1 overflow-y-auto custom-scrollbar w-full flex flex-col items-center min-h-0 relative transition-all duration-300 ${
            showMenuBar ? 'pt-16 pb-6 px-4 sm:px-12' : 'pt-6 pb-6 px-4 sm:px-12'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, scale: 0.99, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.99, y: -6 }}
              transition={{ duration: 0.2 }}
              className="relative flex flex-col items-center justify-start w-full min-h-0"
            >
              <div 
                className="relative overflow-hidden bg-white rounded-2xl shadow-xl border border-[#E5E0D8] flex items-center justify-center shrink-0"
                style={{ 
                  aspectRatio: `${finalAspectRatio}`,
                  width: '100%',
                  maxWidth: '700px',
                  margin: 'auto'
                }}
              >
                {(!blobUrls[currentSong?.id || ''] && (currentSong?.fileId || currentSong?.filePath)?.length > 20 && !(currentSong?.fileId || currentSong?.filePath)?.startsWith('/')) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF9F5] text-[#2B2927]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D97757] mb-2"></div>
                    <span className="text-xs font-medium text-[#6A6864]">악보 원본을 불러오는 중...</span>
                  </div>
                ) : (
                  <div className="absolute inset-2.5 sm:inset-3.5 overflow-hidden">
                    <img 
                      src={blobUrls[currentSong?.id || ''] || hymnalApi.resolveImagePath(currentSong?.filePath || currentSong?.filename || '')} 
                      className="absolute block max-w-none top-0 left-0" 
                      onLoad={(e) => { 
                        const img = e.currentTarget;
                        const ratio = img.naturalWidth / img.naturalHeight;
                        setImageRatios(prev => ({
                          ...prev,
                          [currentItem.id]: ratio
                        })); 
                      }} 
                      style={{ 
                        width: `${100 / visibleWidthFactor}%`, 
                        left: `-${(crop.left / visibleWidthFactor)}%`, 
                        top: `-${(crop.top / visibleHeightFactor)}%` 
                      }} 
                      draggable={false} 
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 하단 멘트(Memo) 영역 */}
        <AnimatePresence>
          {showMemo && currentItem.memo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full flex-none border-t border-[#E5E0D8] bg-white shadow-lg overflow-hidden"
            >
              <div className="w-full max-w-5xl mx-auto px-6 py-4">
                <p 
                  className="text-[#2B2927] font-serif font-bold whitespace-pre-wrap text-center leading-relaxed"
                  style={{ fontSize: `${Math.max(16, (currentItem.memoFontSize || 12) * 1.3)}px` }}
                >
                  {currentItem.memo}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 생성 진행 중 오버레이 */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[11000] bg-[#2B2927]/40 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="bg-white border border-[#E5E0D8] rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center">
              <div className="relative w-14 h-14 mb-4">
                <Loader2 className="w-full h-full text-[#D97757] animate-spin opacity-30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Share2 className="w-6 h-6 text-[#D97757] animate-pulse" />
                </div>
              </div>
              
              <h3 className="font-serif text-lg font-bold text-[#2B2927] mb-1.5 tracking-tight">모바일 악보집 생성 중</h3>
              <p className="text-[#6A6864] text-xs mb-4 leading-relaxed">
                {genProgress.msg || '잠시만 기다려 주세요...'}
              </p>
              
              {/* 프로그레스 바 */}
              <div className="w-full h-2 bg-[#FAF0EB] rounded-full overflow-hidden mb-2 border border-[#F1D3C6]">
                <motion.div 
                  className="h-full bg-[#D97757]"
                  initial={{ width: 0 }}
                  animate={{ width: `${genProgress.percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-xs font-semibold text-[#D97757] font-mono">
                {Math.round(genProgress.percent)}%
              </span>

              <p className="mt-4 text-[11px] text-[#A8A49C]">
                완료되면 악보 링크가 클립보드에 자동으로 복사됩니다.
              </p>

              <button
                onClick={() => setIsGenerating(false)}
                className="mt-5 px-5 py-2 bg-[#F5F3ED] hover:bg-[#ECEAE4] text-[#6A6864] hover:text-[#2B2927] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                취소하기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 생성 완료 오버레이 */}
      <AnimatePresence>
        {genResultUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[12000] bg-[#2B2927]/40 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-14 h-14 bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xs">
                <Check className="w-7 h-7 stroke-[2px]" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#2B2927] mb-1">생성 완료!</h3>
              <p className="text-[#6A6864] text-xs leading-relaxed mb-5">
                모바일 PDF 생성이 완료되었습니다.<br/>
                <span className="text-[#D97757] font-semibold">[{contiTitle || '콘티'}] 링크가 복사되었습니다.</span>
              </p>

              {/* 링크 주소 표시 영역 */}
              <div className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl p-3 mb-5 group relative text-left">
                <p className="text-[10px] text-[#8C877D] uppercase tracking-wider font-semibold mb-1">Share Link</p>
                <p className="text-xs text-[#D97757] font-mono break-all line-clamp-2 leading-tight">
                  {genResultUrl}
                </p>
                <div 
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 rounded-xl cursor-pointer border border-[#E5E0D8]"
                  onClick={() => {
                    const shareText = `[${contiTitle || '새 찬양 콘티'}] 악보보기 링크\n${genResultUrl}`;
                    hymnalApi.writeClipboard(shareText);
                    alert('링크가 다시 복사되었습니다.');
                  }}
                >
                  <span className="text-xs text-[#2B2927] font-semibold">다시 복사하기</span>
                </div>
              </div>

              {/* 로컬 직접 다운로드 지원 버튼 */}
              {(genResultUrl || genFileId) && (
                <button
                  onClick={() => {
                    if (genResultUrl && (genResultUrl.startsWith('blob:') || genResultUrl.startsWith('http'))) {
                      const link = document.createElement('a');
                      link.href = genResultUrl;
                      link.download = `[모바일]_${contiTitle || '찬양콘티'}.pdf`;
                      link.click();
                    } else if (genFileId) {
                      window.open(`https://drive.google.com/uc?export=download&id=${genFileId}`, '_blank');
                    }
                  }}
                  className="w-full mb-2.5 py-2.5 bg-[#FAF0EB] hover:bg-[#FAF0EB]/80 text-[#D97757] border border-[#F1D3C6] rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-[1.8px]" />
                  <span>기기에 직접 다운로드</span>
                </button>
              )}
              
              <button
                onClick={() => {
                  setGenResultUrl(null);
                  setIsGenerating(false);
                }}
                className="w-full py-2.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* 회중용 웹 뷰어 링크 공유 모달 */}
        {showCongregationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 text-center"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-left"
            >
              <div className="w-12 h-12 bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Users className="w-6 h-6 stroke-[2.2px]" />
              </div>

              <h3 className="font-serif text-lg font-bold text-[#2B2927] text-center mb-1">
                회중용 뷰어 준비 완료!
              </h3>
              <p className="text-[#6A6864] text-xs text-center leading-relaxed mb-4">
                성도들이 스마트폰에서 바로 볼 수 있는<br/>
                <span className="text-[#D97757] font-semibold">[{contiTitle || '찬양 콘티'}] 웹 뷰어 링크</span>가 생성되었습니다.
              </p>

              {/* 필수 요청 안내 박스: 소그룹용 50명 제한 */}
              <div className="bg-[#FAF3F0] border border-[#EAC9BE] rounded-xl p-3 mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#D97757] shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold text-[#8C3A23] leading-tight">
                  소그룹용으로 50명 이상 접속 시 뷰어가 제한됩니다.
                </p>
              </div>

              {/* 링크 주소창 */}
              <div className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl p-3 mb-4">
                <p className="text-[10px] text-[#8C877D] uppercase tracking-wider font-semibold mb-1">Share URL</p>
                <p className="text-xs text-[#D97757] font-mono break-all line-clamp-2 leading-tight">
                  {congregationUrl}
                </p>
              </div>

              {/* 카카오톡 공유 버튼 */}
              <button
                onClick={() => {
                  const shared = shareInviteViaKakao({
                    inviteUrl: congregationUrl,
                    userName: communityName,
                    appName: 'NATIONS STUDIO',
                    title: `[${communityName}] ${contiTitle || '예배 찬양'} 회중용 악보`,
                    description: '링크를 누르면 스마트폰 전체화면으로 악보를 편리하게 보실 수 있습니다. (소그룹용)',
                  });
                  if (!shared) {
                    const shareText = `[${contiTitle || '예배 찬양'}] 회중용 악보 뷰어\n(소그룹용으로 50명 이상 접속 시 뷰어가 제한됩니다)\n${congregationUrl}`;
                    navigator.clipboard.writeText(shareText);
                    setIsCopiedCongregation(true);
                    setTimeout(() => setIsCopiedCongregation(false), 2000);
                  }
                }}
                className="w-full mb-2 py-2.5 bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#191919">
                  <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.78 1.884 5.217 4.716 6.578-.154.557-.991 3.588-1.028 3.816-.047.29.106.286.224.208.092-.06 3.658-2.482 5.134-3.489.312.031.63.047.954.047 5.523 0 10-3.463 10-7.735S17.523 3 12 3z" />
                </svg>
                <span>카카오톡으로 회중에게 전송</span>
              </button>

              {/* 링크 복사 버튼 */}
              <button
                onClick={() => {
                  const shareText = `[${contiTitle || '예배 찬양'}] 회중용 악보 뷰어\n(소그룹용으로 50명 이상 접속 시 뷰어가 제한됩니다)\n${congregationUrl}`;
                  navigator.clipboard.writeText(shareText);
                  setIsCopiedCongregation(true);
                  setTimeout(() => setIsCopiedCongregation(false), 2000);
                }}
                className="w-full mb-2 py-2.5 bg-[#FAF0EB] hover:bg-[#F7E5DB] text-[#D97757] border border-[#F1D3C6] rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isCopiedCongregation ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{isCopiedCongregation ? '링크 복사 완료!' : '회중 링크 복사'}</span>
              </button>

              {/* 직접 새 창으로 확인하기 버튼 */}
              <button
                onClick={() => window.open(congregationUrl, '_blank')}
                className="w-full mb-2 py-2 bg-transparent hover:bg-[#F3EFE9] text-[#6A6864] rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                <span>새 창에서 뷰어 미리보기</span>
              </button>

              <button
                onClick={() => setShowCongregationModal(false)}
                className="w-full py-2.5 bg-[#2B2927] hover:bg-[#1C1A18] text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer mt-1"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
