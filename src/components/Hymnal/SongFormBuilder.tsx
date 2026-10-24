import React, { useState, useEffect } from 'react';
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
  Play, 
  RotateCcw, 
  ArrowDown, 
  Radio
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
  onLaunchPrompter: (data: {
    blocks: SongFormBlock[];
    code?: string;
    meter?: string;
    rhythm?: string;
    bpm?: number;
    songFormText: string;
  }) => void;
  isSaving?: boolean;
}

// 기존 텍스트 메모를 각 블록의 memo 필드로 복원/초기화하는 헬퍼
const initializeBlocksWithMemo = (rawBlocks: SongFormBlock[], rawText?: string): SongFormBlock[] => {
  if (!rawBlocks || rawBlocks.length === 0) return [];
  if (rawBlocks.some((b) => b.memo && b.memo.trim())) return rawBlocks;
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
        target.memo = content;
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
  onLaunchPrompter,
  isSaving = false,
}) => {
  // 최상단 메타 정보 (코드, 박자, 리듬, 속도)
  const [codeValue, setCodeValue] = useState(songKey || '');
  const [meterValue, setMeterValue] = useState(meter || '4/4');
  const [rhythmValue, setRhythmValue] = useState(rhythm || '');
  const [bpmValue, setBpmValue] = useState<number>(bpm || 72);

  // 송폼 카드 (텍스트 내부에 왼쪽부터 아래로 내려가는 워크플로우 카드)
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

  const [copiedText, setCopiedText] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [showSmartTextInput, setShowSmartTextInput] = useState(false);
  const [smartDraft, setSmartDraft] = useState('');

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

  // 송폼 카드 추가
  const handleAddBlock = (partFull: string) => {
    const newBlock = createNewSongFormBlock(partFull);
    setBlocks((prev) => [...prev, newBlock]);
  };

  // 송폼 카드 삭제
  const handleDeleteBlock = (idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  // 파트별 메모 텍스트 수정
  const handleBlockMemoChange = (idx: number, memoText: string) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, memo: memoText } : b))
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

  // 텍스트 요약 복사
  const handleCopyText = () => {
    const text = formatSongFormBlocksToText(blocks);
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // 스마트 텍스트 적용
  const handleApplySmartText = () => {
    if (!smartDraft.trim()) return;
    const parsed = parseTextToSongFormBlocks(smartDraft);
    if (parsed.length > 0) {
      setBlocks(parsed);
      setShowSmartTextInput(false);
      setSmartDraft('');
    }
  };

  // 저장 실행
  const handleSave = async () => {
    const textSummary = formatSongFormBlocksToText(blocks);
    const combinedMemos = blocks
      .map((b) => (b.memo?.trim() ? `[${b.type}${b.repeatCount > 1 ? ` x${b.repeatCount}` : ''}] ${b.memo.trim()}` : ''))
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

  // 라이브 프롬프터 실행
  const handleLaunchPrompter = () => {
    const combinedMemos = blocks
      .map((b) => (b.memo?.trim() ? `[${b.type}${b.repeatCount > 1 ? ` x${b.repeatCount}` : ''}] ${b.memo.trim()}` : ''))
      .filter(Boolean)
      .join('\n');

    onLaunchPrompter({
      blocks,
      code: codeValue,
      meter: meterValue,
      rhythm: rhythmValue,
      bpm: bpmValue,
      songFormText: combinedMemos,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F5] text-[#2C2B29] select-none overflow-hidden font-sans">
      {/* 1. 상단 메뉴줄 (감싸는 카드 삭제, 컴팩트 여백 적용) */}
      <div className="px-3 py-2 bg-[#FAF9F5] border-b border-[#E7E5DF] flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Radio className="w-3.5 h-3.5 text-[#C96442] shrink-0" />
            <h3 className="text-xs font-bold text-[#2C2B29] tracking-tight truncate">
              {title}
            </h3>
            {codeValue && (
              <span className="px-1.5 py-0.5 bg-[#FAF0EB] text-[#C96442] rounded text-[10px] font-mono font-bold border border-[#F1D3C6]">
                {codeValue} KEY
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* 라이브 프롬프터 실행 버튼 */}
            <button
              type="button"
              onClick={handleLaunchPrompter}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-[#C96442] hover:bg-[#B55434] text-white rounded-lg transition-all cursor-pointer shadow-2xs active:scale-95"
              title="무대용 라이브 프롬프터 전체화면 실행"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>라이브 프롬프터</span>
            </button>

            {/* 저장 버튼 */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs ${
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

        {/* 2. 코드, 박자, 리듬, 속도? 4대 메타 정보 - 감싸는 카드 삭제, 초슬림 인라인 정렬 */}
        <div className="flex items-center gap-2 pt-0.5 text-xs text-[#6A6864] flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono font-bold text-[#C96442] shrink-0">코드:</span>
            <input
              type="text"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
              placeholder="A"
              className="w-11 bg-white text-xs font-mono font-bold text-[#2C2B29] px-1 py-0.5 rounded border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="코드(Key)"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono font-bold shrink-0">박자:</span>
            <input
              type="text"
              value={meterValue}
              onChange={(e) => setMeterValue(e.target.value)}
              placeholder="4/4"
              className="w-11 bg-white text-xs font-mono font-bold text-[#2C2B29] px-1 py-0.5 rounded border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="박자 (4/4, 6/8 등)"
            />
          </div>

          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[10px] font-mono font-bold shrink-0">리듬:</span>
            <input
              type="text"
              value={rhythmValue}
              onChange={(e) => setRhythmValue(e.target.value)}
              placeholder="16비트 발라드"
              className="w-full max-w-[130px] bg-white text-xs font-medium text-[#2C2B29] px-1.5 py-0.5 rounded border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none truncate shadow-2xs"
              title="리듬 및 무드 (예: 16비트 발라드, 8비트, 셔플)"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono font-bold shrink-0">속도?:</span>
            <input
              type="number"
              value={bpmValue || ''}
              onChange={(e) => setBpmValue(parseInt(e.target.value, 10) || 72)}
              placeholder="72"
              className="w-12 bg-white text-xs font-mono font-bold text-[#2C2B29] px-1 py-0.5 rounded border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none text-center shadow-2xs"
              title="속도 (BPM)"
            />
          </div>
        </div>
      </div>

      {/* 3. 상단 송폼카드 버튼: 스크롤 없이 2줄로 모두 나오게 정렬 */}
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

      {/* 4. 텍스트 영역 내부: 최상단에 흐름 카드 + 왼쪽부터 아래로 내려가는 검정색 송폼카드 & 옆 텍스트 */}
      <div className="flex-1 p-3 bg-white flex flex-col gap-3 min-h-0 overflow-y-auto custom-scrollbar">
        {/* 텍스트 내부 최상단: 흐름 요약 카드 */}
        <div className="bg-[#FAF9F5] border border-[#E7E5DF] rounded-xl p-2.5 shadow-2xs space-y-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-hidden flex-1">
              <span className="text-[10px] font-mono text-[#8C877D] uppercase shrink-0 font-bold">흐름:</span>
              <p className="text-xs font-mono text-[#C96442] truncate font-bold">
                {formatSongFormBlocksToText(blocks) || '상단의 파트 버튼을 눌러 송폼을 구성하세요'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyText}
                className="text-[10px] font-mono text-[#6A6864] hover:text-[#C96442] cursor-pointer px-1.5 py-0.5 rounded hover:bg-white"
                title="송폼 텍스트 복사"
              >
                {copiedText ? '복사됨 ✓' : '복사'}
              </button>
              <span className="text-[#E7E5DF]">|</span>
              <button
                type="button"
                onClick={() => setShowSmartTextInput(!showSmartTextInput)}
                className="text-[10px] font-mono text-[#6A6864] hover:text-[#C96442] cursor-pointer px-1.5 py-0.5 rounded hover:bg-white"
              >
                {showSmartTextInput ? '닫기' : '일괄입력'}
              </button>
            </div>
          </div>

          {/* 스마트 텍스트 입력창 (인라인 토글) */}
          {showSmartTextInput && (
            <div className="p-2 bg-white rounded-lg border border-[#F1D3C6] flex gap-1.5 animate-in slide-in-from-top-1 duration-150">
              <input
                type="text"
                value={smartDraft}
                onChange={(e) => setSmartDraft(e.target.value)}
                placeholder="예: In(4) - V1(8) - PC(4) - C(8) x2 - Out(4)"
                className="flex-1 bg-[#FAF9F5] text-xs font-mono text-[#2C2B29] px-2 py-1 rounded border border-[#E7E5DF] focus:border-[#C96442] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplySmartText}
                className="px-2.5 py-1 bg-[#C96442] hover:bg-[#B55434] text-white text-xs font-bold rounded cursor-pointer"
              >
                적용
              </button>
            </div>
          )}
        </div>

        {/* 송폼 카드 & 파트별 텍스트 (왼쪽 아래로 흐름 + 화살표 연결 + 오른쪽 텍스트 입력) */}
        {blocks.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8C877D] bg-[#FAF9F5] rounded-xl border border-dashed border-[#E7E5DF] p-6">
            <p className="font-semibold text-[#4A4741] mb-1">등록된 송폼 카드가 없습니다.</p>
            <p className="text-[11px] text-[#A3A19B]">상단의 [+Intro], [+Verse 1] 등의 버튼을 눌러 파트를 추가하세요.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-4">
            {blocks.map((block, idx) => {
              const isInfinite = block.repeatCount === 0;
              const isLast = idx === blocks.length - 1;

              return (
                <div key={block.id || idx} className="flex flex-col">
                  <div className="flex items-start gap-2.5">
                    {/* 1. 왼쪽: 검정색 송폼카드 */}
                    <div className="w-[125px] sm:w-[135px] shrink-0 bg-[#18181B] text-white rounded-xl p-2 border border-[#27272A] shadow-xs flex flex-col gap-1.5 select-none">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black tracking-tight text-white uppercase truncate">
                          {block.type}
                        </span>
                        {/* 카드 삭제 */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(idx)}
                          className="text-zinc-400 hover:text-rose-400 p-0.5 rounded cursor-pointer transition-colors"
                          title="이 카드 삭제"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-zinc-800">
                        {/* 반복 횟수 순환 버튼: (x1), (x2), (x3), (x4), (x∞) */}
                        <button
                          type="button"
                          onClick={() => handleToggleRepeat(idx)}
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                            block.repeatCount > 1 || isInfinite
                              ? 'bg-[#E07A5F] text-white font-extrabold shadow-2xs'
                              : 'text-zinc-300 hover:text-white bg-zinc-800/80'
                          }`}
                          title="반복 횟수 변경 (x1 ~ x4, ∞)"
                        >
                          {isInfinite ? '(x∞)' : `(x${block.repeatCount})`}
                        </button>

                        <span className="text-[9px] font-mono text-zinc-400">
                          {block.barCount ? `${block.barCount}마디` : ''}
                        </span>
                      </div>
                    </div>

                    {/* 2. 오른쪽: 송폼카드 옆 텍스트 입력창 */}
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={block.memo || ''}
                        onChange={(e) => handleBlockMemoChange(idx, e.target.value)}
                        placeholder={`${block.type} 연주 가이드, 무드, 코드진행, 악기솔로 등을 적으세요`}
                        rows={2}
                        className="w-full p-2 bg-[#FAF9F5] text-xs sm:text-sm text-[#2C2B29] leading-relaxed resize-y border border-[#E7E5DF] rounded-xl focus:outline-none focus:border-[#C96442] focus:ring-1 focus:ring-[#C96442]/20 font-sans custom-scrollbar min-h-[58px]"
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  {/* 3. 아래로 내려가는 연결 화살표 (마지막 블록 제외) */}
                  {!isLast && (
                    <div className="w-[125px] sm:w-[135px] flex items-center justify-center py-1">
                      <ArrowDown className="w-3.5 h-3.5 stroke-[2.5px] text-[#C96442]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. 최하단 고정 바: 초기화, 저장 버튼 */}
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
