import React, { useState, useEffect, useCallback } from 'react';
import type { ContiItem } from '../../stores/HymnalProvider';
import { useHymnal } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { X, ChevronLeft, ChevronRight, Library, StickyNote, Monitor, Users, FileText, Loader2, Share2, Check, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeaderViewerProps {
  onClose: () => void;
  onOpenLibrary?: () => void;
}

export const LeaderViewer: React.FC<LeaderViewerProps> = ({ onClose, onOpenLibrary }) => {
  const { contiItems, songs, contiTitle } = useHymnal();
  
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
      } else if (result.message === 'Need Auth' || result.message?.includes('authenticated')) {
        setIsGenerating(false);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        const loginSuccess = await gdriveWebService.login();
        if (loginSuccess) {
          alert('구글 드라이브 인증이 완료되었습니다! 다시 [PDF 생성]을 눌러주세요.');
        } else {
          alert('구글 인증이 완료되지 않았습니다.');
        }
      } else {
        setIsGenerating(false);
        alert(`생성 실패: ${result.message}`);
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
                  
                  <button
                    onClick={() => handleGeneratePDF('leader')}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#EBE5DC] text-[#D97757] rounded-md text-xs font-medium transition-colors cursor-pointer"
                    title="멘트가 포함된 인도자용 PDF 생성"
                  >
                    <FileText className="w-3 h-3 stroke-[1.8px]" />
                    <span>PDF(인도자)</span>
                  </button>
                  <button
                    onClick={() => handleGeneratePDF('congregation')}
                    disabled={isGenerating}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#EBE5DC] text-[#4A4741] hover:text-[#2B2927] rounded-md text-xs font-medium transition-colors cursor-pointer"
                    title="악보만 있는 회중용 PDF 생성"
                  >
                    <Users className="w-3 h-3 stroke-[1.8px]" />
                    <span>PDF(회중)</span>
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
                    <span className="text-xs font-medium text-[#6A6864]">구글 드라이브 원본을 불러오는 중...</span>
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
                모바일 PDF가 구글 드라이브에 안전하게 저장되었습니다.<br/>
                <span className="text-[#D97757] font-semibold">[{contiTitle || '콘티'}] 링크가 복사되었습니다.</span>
              </p>

              {/* 링크 주소 표시 영역 */}
              <div className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl p-3 mb-5 group relative text-left">
                <p className="text-[10px] text-[#8C877D] uppercase tracking-wider font-semibold mb-1">Drive Link</p>
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
              {genFileId && (
                <button
                  onClick={() => {
                    window.open(`https://drive.google.com/uc?export=download&id=${genFileId}`, '_blank');
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
      </AnimatePresence>
    </>
  );
};
