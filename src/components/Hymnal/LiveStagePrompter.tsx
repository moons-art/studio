import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SongFormBlock } from '../../types/hymnal';
import { SONG_FORM_PART_TYPES } from '../../utils/songFormUtils';
import { 
  X, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Radio
} from 'lucide-react';

interface LiveStagePrompterProps {
  title: string;
  songKey?: string;
  bpm?: number;
  meter?: string;
  rhythm?: string;
  performanceMemo?: string;
  instrumentMemo?: string;
  songFormText?: string;
  blocks: SongFormBlock[];
  onClose: () => void;
}

export const LiveStagePrompter: React.FC<LiveStagePrompterProps> = ({
  title,
  songKey,
  bpm = 72,
  meter = '4/4',
  rhythm = '',
  performanceMemo = '',
  instrumentMemo = '',
  songFormText = '',
  blocks,
  onClose,
}) => {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [currentRepeat, setCurrentRepeat] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tempoPulse, setTempoPulse] = useState(false);

  // 1. 전체 블록 유효성 검사
  const activeBlocks = useMemo(() => {
    if (blocks && blocks.length > 0) return blocks;
    return [
      { id: 'default_in', type: 'Intro', repeatCount: 1, barCount: 4 },
      { id: 'default_v', type: 'Verse 1', repeatCount: 1, barCount: 8 },
      { id: 'default_c', type: 'Chorus', repeatCount: 2, barCount: 8 },
      { id: 'default_out', type: 'Outro', repeatCount: 1, barCount: 4 },
    ];
  }, [blocks]);

  const currentBlock = activeBlocks[currentBlockIndex] || activeBlocks[0];
  const totalRepeats = currentBlock?.repeatCount || 1;
  const isInfinite = currentBlock?.repeatCount === 0;

  const nextBlock = currentBlockIndex < activeBlocks.length - 1 ? activeBlocks[currentBlockIndex + 1] : null;

  // 2. 비주얼 템포 플래시
  useEffect(() => {
    if (!bpm || bpm <= 30) return;
    const intervalMs = (60 / bpm) * 1000;
    const timer = setInterval(() => {
      setTempoPulse(true);
      setTimeout(() => setTempoPulse(false), 80);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [bpm]);

  // 3. 다음 진행
  const handleNext = useCallback(() => {
    if (!isInfinite && currentRepeat < totalRepeats) {
      setCurrentRepeat((prev) => prev + 1);
    } else {
      if (currentBlockIndex < activeBlocks.length - 1) {
        setCurrentBlockIndex((prev) => prev + 1);
        setCurrentRepeat(1);
      }
    }
  }, [currentRepeat, totalRepeats, isInfinite, currentBlockIndex, activeBlocks.length]);

  // 4. 이전 복귀
  const handlePrev = useCallback(() => {
    if (currentRepeat > 1) {
      setCurrentRepeat((prev) => prev - 1);
    } else {
      if (currentBlockIndex > 0) {
        const prevIdx = currentBlockIndex - 1;
        const prevBlock = activeBlocks[prevIdx];
        setCurrentBlockIndex(prevIdx);
        setCurrentRepeat(prevBlock.repeatCount || 1);
      }
    }
  }, [currentRepeat, currentBlockIndex, activeBlocks]);

  // 5. 긴급 점프
  const handleJumpToBlock = (index: number) => {
    if (index >= 0 && index < activeBlocks.length) {
      setCurrentBlockIndex(index);
      setCurrentRepeat(1);
    }
  };

  // 6. 키보드 제어
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  // 7. 전체화면 토글
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getPartShort = (fullName: string) => {
    const found = SONG_FORM_PART_TYPES.find(
      (p) => p.full.toLowerCase() === fullName.toLowerCase() || p.short.toLowerCase() === fullName.toLowerCase()
    );
    return found ? found.short : fullName;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0E0E10] text-[#E0E0E0] flex flex-col select-none overflow-hidden font-sans">
      {/* 최상단: 무음 시각 메트로놈 플래시 라인 */}
      <div 
        className={`w-full h-[3px] transition-colors duration-75 ${
          tempoPulse ? 'bg-[#E07A5F] shadow-[0_0_8px_#E07A5F]' : 'bg-[#1E1E22]'
        }`} 
      />

      {/* 헤더 바: 곡명, Key, 박자, 리듬, 상단 미니 타임라인, 컨트롤 */}
      <header className="px-5 py-3 bg-[#141418] border-b border-[#24242A] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E07A5F] animate-pulse shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
            {title}
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            {songKey && (
              <span className="px-2 py-0.5 bg-[#1F1F26] text-[#E07A5F] rounded border border-[#2D2D38] text-xs font-mono font-bold">
                {songKey} KEY
              </span>
            )}
            {meter && (
              <span className="px-1.5 py-0.5 bg-[#1F1F26] text-[#A0A0AA] rounded border border-[#2D2D38] text-xs font-mono font-bold">
                {meter}
              </span>
            )}
            {rhythm && (
              <span className="px-2 py-0.5 bg-[#1F1F26] text-[#64B5F6] rounded border border-[#2D2D38] text-xs font-mono">
                {rhythm}
              </span>
            )}
          </div>
        </div>

        {/* 중앙 미니 타임라인 */}
        <div className="hidden md:flex items-center gap-1.5 overflow-x-auto custom-scrollbar px-2 max-w-xl">
          {activeBlocks.map((block, idx) => {
            const isCurrent = idx === currentBlockIndex;
            const isPast = idx < currentBlockIndex;
            return (
              <button
                key={block.id || idx}
                onClick={() => handleJumpToBlock(idx)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-[#E07A5F] text-white shadow-[0_0_10px_rgba(224,122,95,0.4)] ring-1 ring-white/30'
                    : isPast
                    ? 'bg-[#1A1A20] text-[#60606A] border border-[#24242C]'
                    : 'bg-[#16161C] text-[#90909A] hover:bg-[#202028] border border-[#24242C]'
                }`}
              >
                {getPartShort(block.type)}
                {block.repeatCount > 1 && <span className="ml-0.5 text-[10px] opacity-80">x{block.repeatCount}</span>}
              </button>
            );
          })}
        </div>

        {/* 우측 도구: 리셋, 전체화면, 닫기 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setCurrentBlockIndex(0);
              setCurrentRepeat(1);
            }}
            className="p-2 hover:bg-[#202028] rounded-lg text-[#888894] hover:text-white transition-colors cursor-pointer"
            title="처음으로 리셋"
          >
            <RotateCcw className="w-4 h-4 stroke-[1.8px]" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-[#202028] rounded-lg text-[#888894] hover:text-white transition-colors cursor-pointer"
            title={isFullscreen ? '창 모드' : '전체화면'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#2E1A17] text-[#A0A0AA] hover:text-[#E07A5F] rounded-lg transition-colors cursor-pointer ml-1"
            title="프롬프터 종료 (ESC)"
          >
            <X className="w-5 h-5 stroke-[2px]" />
          </button>
        </div>
      </header>

      {/* 중앙 메인 스테이지 영역 (화면 좌/우 터치 분할 인터랙션) */}
      <main className="flex-1 relative flex flex-col justify-between p-6 sm:p-12 select-none overflow-hidden">
        {/* 투명 터치 센서 오버레이: 좌측 탭(이전), 우측 탭(다음) */}
        <div 
          onClick={handlePrev} 
          className="absolute inset-y-0 left-0 w-1/2 z-10 cursor-pointer active:bg-white/[0.02] transition-colors"
          title="이전 (좌측 화면 탭)"
        />
        <div 
          onClick={handleNext} 
          className="absolute inset-y-0 right-0 w-1/2 z-10 cursor-pointer active:bg-white/[0.02] transition-colors"
          title="다음 (우측 화면 탭)"
        />

        {/* 상단 마디 수 안내 */}
        <div className="relative z-20 flex items-center justify-end pointer-events-none">
          <div className="text-sm font-mono font-bold text-[#808092] bg-[#141418] px-4 py-1.5 rounded-xl border border-[#202028] shadow-sm">
            {currentBlock.barCount} BARS
          </div>
        </div>

        {/* 중앙 메인: 현재 파트 (압도적인 크기와 시인성) */}
        <div className="relative z-20 my-auto text-center pointer-events-none space-y-6">
          <div className="space-y-3">
            <h1 className="text-6xl sm:text-8xl md:text-9xl font-black text-white tracking-tight uppercase drop-shadow-lg">
              {currentBlock.type}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <span className="px-4 py-1.5 bg-[#1A1A22] text-[#E07A5F] rounded-xl border border-[#2D2D3A] text-base sm:text-lg font-mono font-black tracking-wider shadow-sm">
                {isInfinite ? 'REPEAT ∞' : `REPEAT ${currentRepeat} / ${totalRepeats}`}
              </span>
              <span className="text-xs sm:text-sm text-[#70707C] font-mono">
                [Part {currentBlockIndex + 1} of {activeBlocks.length}]
              </span>
            </div>
          </div>

          {/* 연주 및 악기 메모 안내 카드 (인도자가 적은 메모가 있을 때 시원하게 노출) */}
          {(currentBlock?.memo || songFormText || performanceMemo || instrumentMemo) && (
            <div className="max-w-2xl mx-auto space-y-2 pt-2">
              {currentBlock?.memo ? (
                <div className="bg-[#14141A]/90 border border-[#282838] px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#E07A5F] shrink-0">[{currentBlock.type} 메모]</span>
                  <p className="text-sm sm:text-base font-semibold text-[#F0F0F5] tracking-wide whitespace-pre-wrap text-left">
                    {currentBlock.memo}
                  </p>
                </div>
              ) : songFormText ? (
                <div className="bg-[#14141A]/90 border border-[#282838] px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#E07A5F] shrink-0">[인도자 메모]</span>
                  <p className="text-sm sm:text-base font-semibold text-[#F0F0F5] tracking-wide whitespace-pre-wrap text-left">
                    {songFormText}
                  </p>
                </div>
              ) : (
                <>
                  {performanceMemo && (
                    <div className="bg-[#14141A]/90 border border-[#282838] px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#E07A5F] shrink-0">[연주]</span>
                      <p className="text-sm sm:text-base font-semibold text-[#F0F0F5] tracking-wide">
                        {performanceMemo}
                      </p>
                    </div>
                  )}
                  {instrumentMemo && (
                    <div className="bg-[#14141A]/90 border border-[#282838] px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#64B5F6] shrink-0">[악기]</span>
                      <p className="text-sm sm:text-base font-semibold text-[#F0F0F5] tracking-wide">
                        {instrumentMemo}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 하단부: 다음 파트 예고 & 터치 네비게이션 가이드 */}
        <div className="relative z-20 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4 pointer-events-none pt-4 border-t border-[#1C1C22]">
          <div className="text-[11px] font-mono text-[#555562] flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> 화면 좌측: 이전
            </span>
            <span className="text-[#33333E]">|</span>
            <span className="flex items-center gap-1">
              화면 우측: 다음 <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#14141A] px-4 py-2 rounded-xl border border-[#24242E]">
            <span className="text-[10px] font-mono font-bold text-[#80808C] uppercase">NEXT :</span>
            {nextBlock ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white uppercase">{nextBlock.type}</span>
                {nextBlock.repeatCount > 1 && (
                  <span className="text-xs font-mono text-[#E07A5F]">x{nextBlock.repeatCount}</span>
                )}
                <span className="text-xs font-mono text-[#60606C]">({nextBlock.barCount} Bars)</span>
              </div>
            ) : (
              <span className="text-xs font-mono font-bold text-[#E07A5F]">END OF SONG</span>
            )}
          </div>
        </div>
      </main>

      {/* 최하단 긴급 점프 퀵 패널 */}
      <footer className="px-4 py-2.5 bg-[#121216] border-t border-[#202028] flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 z-30">
        <span className="text-[10px] font-mono font-bold text-[#555562] uppercase shrink-0 flex items-center gap-1">
          <Radio className="w-3 h-3 text-[#E07A5F]" /> 점프:
        </span>
        <div className="flex items-center gap-1.5 flex-1">
          {activeBlocks.map((b, idx) => {
            const isCurrent = idx === currentBlockIndex;
            return (
              <button
                key={b.id || idx}
                onClick={() => handleJumpToBlock(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-[#E07A5F] text-white shadow-md'
                    : 'bg-[#181820] hover:bg-[#242430] text-[#90909E] border border-[#24242E]'
                }`}
              >
                {getPartShort(b.type)}
                {b.repeatCount > 1 && <span className="ml-1 text-[10px] opacity-80">x{b.repeatCount}</span>}
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
};
