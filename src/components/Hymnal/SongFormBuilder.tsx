import React, { useState, useEffect, useRef } from 'react';
import type { SongFormBlock } from '../../types/hymnal';
import { 
  SONG_FORM_PART_TYPES, 
  createNewSongFormBlock, 
  formatSongFormBlocksToText, 
  parseTextToSongFormBlocks 
} from '../../utils/songFormUtils';
import { 
  X, 
  Check, 
  Save, 
  RotateCcw, 
  ArrowDown, 
  Radio,
  GripVertical,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface SongFormBuilderProps {
  title: string;
  songKey?: string;
  meter?: string;
  rhythm?: string;
  bpm?: number;
  initialText?: string;
  initialBlocks?: SongFormBlock[];
  initialSongFormText?: string;
  onSave: (data: {
    blocks: SongFormBlock[];
    textSummary: string;
    code?: string;
    meter?: string;
    rhythm?: string;
    bpm?: number;
    songFormText: string;
  }) => Promise<void> | void;
  onLaunchPrompter?: (data: {
    blocks: SongFormBlock[];
    code?: string;
    meter?: string;
    rhythm?: string;
    bpm?: number;
    songFormText: string;
  }) => void;
  isSaving?: boolean;
}

// 기존 텍스트 메모 및 코드진행을 각 블록 필드로 복원/초기화하는 헬퍼
const initializeBlocksWithMemo = (rawBlocks: SongFormBlock[], rawText?: string): SongFormBlock[] => {
  if (!rawBlocks || rawBlocks.length === 0) return [];
  if (rawBlocks.some((b) => (b.memo && b.memo.trim()) || (b.chords && b.chords.trim()))) return rawBlocks;
  if (!rawText || !rawText.trim()) return rawBlocks;

  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const updated = rawBlocks.map((b) => ({ ...b }));
  const unassigned: string[] = [];

  lines.forEach((line) => {
    const match = line.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      const partName = match[1].toLowerCase().replace(/\s*x\d+|\s*x∞/, '').trim();
      const content = match[2].trim();
      const target = updated.find(
        (b) => b.type.toLowerCase() === partName && (!b.memo || !b.memo.trim())
      );
      if (target) {
        if (content.includes('코드:')) {
          const chordMatch = content.match(/코드:\s*([^|]+)/);
          if (chordMatch) target.chords = chordMatch[1].trim();
          const memoPart = content.split('|').slice(1).join('|').trim();
          if (memoPart) target.memo = memoPart;
        } else {
          target.memo = content;
        }
        return;
      }
    }
    unassigned.push(line);
  });

  if (unassigned.length > 0 && updated.length > 0 && !updated[0].memo) {
    updated[0].memo = unassigned.join('\n');
  }

  return updated;
};

export const SongFormBuilder: React.FC<SongFormBuilderProps> = ({
  title,
  songKey = 'C',
  meter = '4/4',
  rhythm = '',
  bpm = 72,
  initialText = '',
  initialBlocks,
  initialSongFormText,
  onSave,
  isSaving = false,
}) => {
  // 최상단 메타 정보 (코드, 박자, 리듬, BPM)
  const [codeValue, setCodeValue] = useState(songKey || '');
  const [meterValue, setMeterValue] = useState(meter || '4/4');
  const [rhythmValue, setRhythmValue] = useState(rhythm || '');
  const [bpmValue, setBpmValue] = useState<number>(bpm || 72);

  // 송폼 카드 블록 리스트
  const [blocks, setBlocks] = useState<SongFormBlock[]>(() => {
    let initial: SongFormBlock[] = [];
    if (initialBlocks && initialBlocks.length > 0) {
      initial = initialBlocks;
    } else if (initialSongFormText && initialSongFormText.trim()) {
      initial = parseTextToSongFormBlocks(initialSongFormText);
    } else {
      initial = [
        createNewSongFormBlock('Intro', 4),
        createNewSongFormBlock('Verse 1', 8),
        createNewSongFormBlock('Chorus', 8),
        createNewSongFormBlock('Outro', 4),
      ];
    }
    return initializeBlocksWithMemo(initial, initialSongFormText || initialText);
  });

  // 흐름 입력창 상태 (카드 변경 시 자동 입력, 직접 타이핑 수정 가능)
  const [flowText, setFlowText] = useState(() => formatSongFormBlocksToText(blocks));
  const [isEditingFlowText, setIsEditingFlowText] = useState(false);

  const [savedNotice, setSavedNotice] = useState(false);
  const [flowSavedNotice, setFlowSavedNotice] = useState(false);

  // 드래그 앤 드롭 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const cardListRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number>(0);
  const touchingIndexRef = useRef<number | null>(null);

  // 외부 props 변경 시 동기화
  useEffect(() => {
    setCodeValue(songKey || '');
  }, [songKey]);

  useEffect(() => {
    setMeterValue(meter || '4/4');
  }, [meter]);

  useEffect(() => {
    setRhythmValue(rhythm || '');
  }, [rhythm]);

  useEffect(() => {
    setBpmValue(bpm || 72);
  }, [bpm]);

  useEffect(() => {
    if (initialBlocks && initialBlocks.length > 0) {
      setBlocks(initializeBlocksWithMemo(initialBlocks, initialSongFormText || initialText));
    } else if (initialSongFormText && initialSongFormText.trim()) {
      const parsed = parseTextToSongFormBlocks(initialSongFormText);
      setBlocks(initializeBlocksWithMemo(parsed, initialSongFormText || initialText));
    }
  }, [initialBlocks, initialSongFormText, initialText]);

  // 카드 블록 변경 시 흐름 텍스트 자동 동기화 (사용자가 직접 타이핑 중이 아닐 때)
  useEffect(() => {
    if (!isEditingFlowText) {
      setFlowText(formatSongFormBlocksToText(blocks));
    }
  }, [blocks, isEditingFlowText]);

  // 송폼 카드 추가
  const handleAddBlock = (partFull: string) => {
    const newBlock = createNewSongFormBlock(partFull);
    setBlocks((prev) => [...prev, newBlock]);
  };

  // 송폼 카드 삭제
  const handleDeleteBlock = (idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  // 파트별 메모 텍스트 수정 (3번째 줄)
  const handleBlockMemoChange = (idx: number, memoText: string) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, memo: memoText } : b))
    );
  };

  // 파트별 코드진행 수정 (2번째 줄)
  const handleBlockChordsChange = (idx: number, chordsText: string) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, chords: chordsText } : b))
    );
  };

  // 반복 횟수 토글: (x1) -> (x2) -> (x3) -> (x4) -> (x∞)
  const handleToggleRepeat = (idx: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== idx) return b;
        let nextRep = b.repeatCount + 1;
        if (nextRep > 4) nextRep = 0; // 0은 ∞
        return { ...b, repeatCount: nextRep };
      })
    );
  };

  // 마디 수 토글 (4 -> 8 -> 12 -> 16 -> 2 -> 4)
  const handleToggleBars = (idx: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== idx) return b;
        const currentBars = b.barCount || 8;
        let nextBars = 8;
        if (currentBars === 4) nextBars = 8;
        else if (currentBars === 8) nextBars = 12;
        else if (currentBars === 12) nextBars = 16;
        else if (currentBars === 16) nextBars = 2;
        else nextBars = 4;
        return { ...b, barCount: nextBars };
      })
    );
  };

  // 송폼 카드 순서 이동
  const handleMoveBlock = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setIsEditingFlowText(false); // 수동 편집 모드 해제하여 자동 수정 보장
    setBlocks((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      setFlowText(formatSongFormBlocksToText(updated)); // 흐름창에 즉시 자동 수정
      return updated;
    });
  };

  // 한 칸 위로 이동
  const handleMoveUp = (idx: number) => {
    if (idx <= 0) return;
    handleMoveBlock(idx, idx - 1);
  };

  // 한 칸 아래로 이동
  const handleMoveDown = (idx: number) => {
    if (idx >= blocks.length - 1) return;
    handleMoveBlock(idx, idx + 1);
  };

  // 드래그 앤 드롭 핸들러 (마우스)
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('text/plain', idx.toString());
    setDraggedIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverIndex !== idx) {
      setDragOverIndex(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIdx) {
      handleMoveBlock(draggedIndex, targetIdx);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 터치 이벤트 핸들러 (모바일/손가락 터치 드래그)
  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    touchingIndexRef.current = idx;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchingIndexRef.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - touchStartYRef.current;
    const threshold = 40; // 40px 이상 스와이프 시 이동

    if (diff > threshold) {
      // 아래로 이동
      handleMoveDown(touchingIndexRef.current);
    } else if (diff < -threshold) {
      // 위로 이동
      handleMoveUp(touchingIndexRef.current);
    }
    touchingIndexRef.current = null;
  };

  // 흐름 입력창에서 [저장] 버튼 클릭 시: 텍스트 파싱하여 블록 동기화 및 즉시 저장
  const handleSaveFlowText = async () => {
    setIsEditingFlowText(false);
    let updatedBlocks = blocks;

    if (flowText.trim()) {
      const parsed = parseTextToSongFormBlocks(flowText);
      if (parsed.length > 0) {
        // 기존 blocks의 메모와 코드를 최대한 유지
        updatedBlocks = parsed.map((p) => {
          const existing = blocks.find((b) => b.type.toLowerCase() === p.type.toLowerCase());
          return {
            ...p,
            chords: existing?.chords || '',
            memo: existing?.memo || '',
          };
        });
        setBlocks(updatedBlocks);
      }
    }

    const textSummary = formatSongFormBlocksToText(updatedBlocks);
    const combinedMemos = updatedBlocks
      .map((b) => {
        const parts = [];
        if (b.chords?.trim()) parts.push(`코드: ${b.chords.trim()}`);
        if (b.memo?.trim()) parts.push(b.memo.trim());
        return parts.length > 0 ? `[${b.type}${b.repeatCount > 1 ? ` x${b.repeatCount}` : ''}] ${parts.join(' | ')}` : '';
      })
      .filter(Boolean)
      .join('\n');

    await onSave({
      blocks: updatedBlocks,
      textSummary,
      code: codeValue,
      meter: meterValue,
      rhythm: rhythmValue,
      bpm: bpmValue,
      songFormText: combinedMemos,
    });

    setFlowSavedNotice(true);
    setTimeout(() => setFlowSavedNotice(false), 2000);
  };

  // 전체 송폼 저장 실행
  const handleSave = async () => {
    const textSummary = formatSongFormBlocksToText(blocks);
    const combinedMemos = blocks
      .map((b) => {
        const parts = [];
        if (b.chords?.trim()) parts.push(`코드: ${b.chords.trim()}`);
        if (b.memo?.trim()) parts.push(b.memo.trim());
        return parts.length > 0 ? `[${b.type}${b.repeatCount > 1 ? ` x${b.repeatCount}` : ''}] ${parts.join(' | ')}` : '';
      })
      .filter(Boolean)
      .join('\n');

    await onSave({
      blocks,
      textSummary,
      code: codeValue,
      meter: meterValue,
      rhythm: rhythmValue,
      bpm: bpmValue,
      songFormText: combinedMemos,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F5] text-[#2C2B29] select-none overflow-hidden font-sans">
      {/* 1. 상단 메뉴줄: 곡명, KEY뱃지, 전체 저장 버튼 */}
      <div className="px-3 py-2 bg-[#FAF9F5] border-b border-[#E7E5DF] flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-[#18181B] tracking-tight truncate">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* 전체 저장 버튼 */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs ${
                savedNotice
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white hover:bg-[#FAF0EB] text-[#2C2B29] hover:text-[#C96442] border border-[#E7E5DF] hover:border-[#F1D3C6] active:scale-95'
              }`}
              title="송폼 구성 및 메모 저장"
            >
              {savedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5px]" />
                  <span className="text-[11px]">저장됨</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 stroke-[2px]" />
                  <span className="text-[11px]">{isSaving ? '저장중' : '저장'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. 코드, 박자, 리듬, BPM 4대 메타 정보 - 모두 검은색 글자 크기 및 위치 정렬 */}
        <div className="flex items-center gap-3 pt-0.5 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#18181B] shrink-0">코드:</span>
            <input
              type="text"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
              placeholder="A"
              className="w-12 h-7 bg-white text-xs font-mono font-bold text-[#18181B] px-1.5 py-0.5 rounded-lg border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="코드(Key)"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#18181B] shrink-0">박자:</span>
            <input
              type="text"
              value={meterValue}
              onChange={(e) => setMeterValue(e.target.value)}
              placeholder="4/4"
              className="w-12 h-7 bg-white text-xs font-mono font-bold text-[#18181B] px-1.5 py-0.5 rounded-lg border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="박자 (4/4, 6/8 등)"
            />
          </div>

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-xs font-bold text-[#18181B] shrink-0">리듬:</span>
            <input
              type="text"
              value={rhythmValue}
              onChange={(e) => setRhythmValue(e.target.value)}
              placeholder="16비트 발라드"
              className="w-full max-w-[130px] h-7 bg-white text-xs font-medium text-[#18181B] px-2 py-0.5 rounded-lg border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none truncate shadow-2xs"
              title="리듬 및 무드 (예: 16비트 발라드, 8비트, 셔플)"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#18181B] shrink-0">BPM:</span>
            <input
              type="number"
              value={bpmValue || ''}
              onChange={(e) => setBpmValue(parseInt(e.target.value, 10) || 72)}
              placeholder="72"
              className="w-14 h-7 bg-white text-xs font-mono font-bold text-[#18181B] px-1.5 py-0.5 rounded-lg border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="곡의 빠르기 (BPM)"
            />
          </div>
        </div>
      </div>

      {/* 3. 상단 송폼카드 추가 버튼들 */}
      <div className="px-3 py-2 bg-[#FAF9F5] border-b border-[#E7E5DF] flex flex-wrap gap-1 items-center shrink-0">
        <span className="text-[10px] font-mono font-bold text-[#8C877D] shrink-0 mr-1">+ 추가:</span>
        {SONG_FORM_PART_TYPES.map((part) => (
          <button
            key={part.full}
            type="button"
            onClick={() => handleAddBlock(part.full)}
            className="px-2 py-0.5 bg-white hover:bg-[#FAF0EB] active:bg-[#18181B] text-[#4A4741] hover:text-[#C96442] active:text-white rounded-md text-[11px] font-bold transition-all border border-[#E7E5DF] hover:border-[#F1D3C6] shrink-0 cursor-pointer shadow-2xs"
            title={`${part.full} 카드 추가`}
          >
            +{part.full}
          </button>
        ))}
      </div>

      {/* 4. 본문 영역: 최상단 흐름(Flow) 입력+저장창 & 가로 와이드 3단 송폼 카드들 */}
      <div 
        ref={cardListRef}
        className="flex-1 p-3 bg-white flex flex-col gap-3 min-h-0 overflow-y-auto custom-scrollbar"
      >
        {/* 흐름창: 카드 변경 시 자동입력 + 직접 타이핑 수정 가능 + 저장버튼 */}
        <div className="bg-[#FAF9F5] border border-[#E7E5DF] rounded-xl p-2.5 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#8C877D] uppercase shrink-0 font-bold">
              흐름:
            </span>
            <input
              type="text"
              value={flowText}
              onFocus={() => setIsEditingFlowText(true)}
              onChange={(e) => {
                setIsEditingFlowText(true);
                setFlowText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveFlowText();
                }
              }}
              placeholder="예: In(4) - V1(8) - PC(4) - C(8) x2 - Out(4)"
              className="flex-1 bg-white text-xs font-mono font-bold text-[#C96442] px-2.5 py-1 rounded-lg border border-[#E7E5DF] focus:border-[#C96442] focus:ring-1 focus:ring-[#C96442]/20 focus:outline-none shadow-2xs"
              title="흐름을 직접 수정하거나 자동으로 생성된 순서를 확인하세요"
            />
            {/* 흐름 저장 버튼 */}
            <button
              type="button"
              onClick={handleSaveFlowText}
              disabled={isSaving}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs shrink-0 ${
                flowSavedNotice
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#18181B] hover:bg-[#27272A] text-white active:scale-95'
              }`}
              title="흐름 텍스트를 파싱하여 송폼 카드 및 곡 정보를 저장합니다"
            >
              {flowSavedNotice ? (
                <>
                  <Check className="w-3 h-3 stroke-[2.5px]" />
                  <span className="text-[11px]">저장됨</span>
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 stroke-[2px]" />
                  <span className="text-[11px]">저장</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 송폼 와이드 카드 리스트 */}
        {blocks.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8C877D] bg-[#FAF9F5] rounded-xl border border-dashed border-[#E7E5DF] p-6">
            <p className="font-semibold text-[#4A4741] mb-1">등록된 송폼 카드가 없습니다.</p>
            <p className="text-[11px] text-[#A3A19B]">상단의 [+Intro], [+Verse 1] 등의 버튼을 눌러 파트를 추가하세요.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-4">
            {blocks.map((block, idx) => {
              const isInfinite = block.repeatCount === 0;
              const isLast = idx === blocks.length - 1;
              const isDragging = draggedIndex === idx;
              const isOver = dragOverIndex === idx;

              return (
                <div key={block.id || idx} className="flex flex-col">
                  {/* 가로 와이드 송폼 카드 */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`w-full rounded-xl border overflow-hidden shadow-2xs transition-all ${
                      isDragging 
                        ? 'opacity-40 scale-[0.99] border-dashed border-[#C96442]' 
                        : isOver 
                          ? 'border-[#C96442] shadow-md ring-1 ring-[#C96442]' 
                          : 'border-zinc-300 hover:border-zinc-400'
                    }`}
                  >
                    {/* [첫째줄: 검은색] 송폼명, 반복횟수, 마디, 삭제 */}
                    <div className="bg-[#18181B] text-white px-3 py-2 flex items-center justify-between gap-2 select-none">
                      {/* 좌측: 마우스/손 드래그 핸들 + 송폼명 + 반복횟수 + 마디 (잘 보이게 크게 표시) */}
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {/* 마우스/손 드래그 핸들 */}
                        <div
                          className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-zinc-400 hover:text-white rounded transition-colors touch-none shrink-0"
                          title="마우스나 손으로 잡고 위 아래로 이동"
                          onTouchStart={(e) => handleTouchStart(idx, e)}
                          onTouchEnd={handleTouchEnd}
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* 송폼 이름 */}
                        <span className="text-sm sm:text-base font-black tracking-tight text-white uppercase truncate">
                          {block.type}
                        </span>

                        {/* 반복 횟수 버튼 (송폼이름 바로 옆에 크게 표시) */}
                        <button
                          type="button"
                          onClick={() => handleToggleRepeat(idx)}
                          className={`text-xs font-mono font-black px-2 py-0.5 rounded-md transition-all cursor-pointer shadow-2xs ${
                            block.repeatCount > 1 || isInfinite
                              ? 'bg-[#E07A5F] text-white ring-1 ring-white/30'
                              : 'text-zinc-200 hover:text-white bg-zinc-800 border border-zinc-700'
                          }`}
                          title="반복 횟수 변경 (x1 ~ x4, ∞)"
                        >
                          {isInfinite ? '(x∞)' : `(x${block.repeatCount})`}
                        </button>

                        {/* 마디 수 순환 버튼 (송폼이름 바로 옆에 크게 표시) */}
                        <button
                          type="button"
                          onClick={() => handleToggleBars(idx)}
                          className="text-xs font-mono font-bold text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded-md transition-all cursor-pointer border border-zinc-700 shadow-2xs"
                          title="클릭하여 마디 수 변경 (4 -> 8 -> 12 -> 16 -> 2)"
                        >
                          {block.barCount ? `${block.barCount}마디` : '8마디'}
                        </button>
                      </div>

                      {/* 우측: 카드 삭제 버튼 */}
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(idx)}
                          className="text-zinc-400 hover:text-rose-400 p-1 rounded cursor-pointer transition-colors"
                          title="이 카드 삭제"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* [둘째줄: 코드진행] */}
                    <div className="bg-[#27272A] px-3 py-1.5 flex items-center gap-2 border-t border-zinc-800">
                      <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0">
                        코드진행:
                      </span>
                      <input
                        type="text"
                        value={block.chords || ''}
                        onChange={(e) => handleBlockChordsChange(idx, e.target.value)}
                        placeholder="예: C - G/B - Am7 - G (코드 진행을 적으세요)"
                        className="w-full bg-[#18181B] text-xs font-mono font-bold text-amber-200 placeholder:text-zinc-500 px-2 py-1 rounded border border-zinc-700 focus:border-amber-400 focus:outline-none shadow-2xs"
                      />
                    </div>

                    {/* [셋째줄: 흰배경 메모 - 기본 1줄짜리로 축소] */}
                    <div className="bg-white px-3 py-1.5 border-t border-zinc-200">
                      <textarea
                        value={block.memo || ''}
                        onChange={(e) => handleBlockMemoChange(idx, e.target.value)}
                        placeholder={`${block.type} 연주 팁, 악기/무드 메모를 적으세요`}
                        rows={1}
                        className="w-full bg-white text-xs sm:text-sm text-[#2C2B29] leading-normal resize-y focus:outline-none placeholder:text-zinc-400 font-sans custom-scrollbar min-h-[32px] py-1"
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  {/* 아래로 내려가는 연결 화살표 (마지막 블록 제외) */}
                  {!isLast && (
                    <div className="flex items-center justify-center py-1">
                      <ArrowDown className="w-3.5 h-3.5 stroke-[2.5px] text-[#C96442]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. 최하단 고정 바: 초기화, 전체 저장 버튼 */}
      <div className="p-2 bg-[#FAF9F5] border-t border-[#E7E5DF] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (confirm('송폼 카드를 기본 4파트(Intro -> Verse 1 -> Chorus -> Outro)로 초기화하시겠습니까?')) {
              setBlocks([
                createNewSongFormBlock('Intro', 4),
                createNewSongFormBlock('Verse 1', 8),
                createNewSongFormBlock('Chorus', 8),
                createNewSongFormBlock('Outro', 4),
              ]);
            }
          }}
          className="flex items-center gap-1 text-[11px] font-mono text-[#8C877D] hover:text-[#2C2B29] px-2 py-1 rounded hover:bg-white transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>카드 초기화</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-1.5 bg-[#C96442] hover:bg-[#B55434] text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs active:scale-95"
        >
          {isSaving ? '저장중...' : '송폼 & 메모 저장'}
        </button>
      </div>
    </div>
  );
};
