import React from 'react';
import { parseChord, getChordNotes, type ChordNoteInfo } from '../../utils/musicTheory';
import { soundEngine, type InstrumentType } from '../../utils/soundEngine';

interface InteractiveChordViewerProps {
  text: string;
  instrument: InstrumentType;
  onChordClick?: (chordName: string, notes: ChordNoteInfo[]) => void;
  className?: string;
}

export const InteractiveChordViewer: React.FC<InteractiveChordViewerProps> = ({
  text,
  instrument,
  onChordClick,
  className = ''
}) => {
  if (!text || !text.trim()) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-[#A3A19B] italic p-6">
        표시할 코드 및 가사 텍스트가 없습니다.
      </div>
    );
  }

  const lines = text.split('\n');

  // 코드 클릭 시 사운드 재생
  const handleChordClick = (chordStr: string) => {
    const clean = chordStr.replace(/[()]/g, '').trim();
    const notes = getChordNotes(clean);
    if (notes.length > 0) {
      soundEngine.playChord(notes, instrument);
      if (onChordClick) {
        onChordClick(clean, notes);
      }
    }
  };

  // 한 줄 렌더링 (원래의 정돈된 모노스페이스 악보 텍스트 포맷 복원)
  const renderLine = (line: string, lineIdx: number) => {
    // 1. 섹션 헤더 (예: [Verse 1], [Chorus])
    if (/^\s*\[.*\]\s*$/.test(line)) {
      return (
        <div key={lineIdx} className="pt-2 pb-0.5 text-[11px] font-bold text-[#C96442] font-mono tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C96442]" />
          <span>{line.trim()}</span>
        </div>
      );
    }

    // 2. 빈 줄
    if (!line.trim()) {
      return <div key={lineIdx} className="h-3" />;
    }

    // 3. 코드 라인 여부 판별
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    let chordCount = 0;
    for (const token of tokens) {
      const cleanToken = token.replace(/[()]/g, '');
      if (parseChord(cleanToken)) chordCount++;
    }

    const isChordLine = chordCount > 0 && (chordCount / tokens.length >= 0.4 || /^\s*(\([A-G][#b]?|[A-G][#b]?).*$/.test(line));

    if (isChordLine) {
      // 코드들을 클릭 가능한 인터랙티브 뱃지로 변환하되 원래 공백과 괄호 위치 그대로 완벽 보존
      const regex = /([A-G][#b]?(?:maj7|maj9|maj|min7|min|m7\(b5\)|m7|m|7\(b5\)|7\(#9\)|7|dim7|dim|aug|sus4|sus2|add9|6|9|11|13)?(?:\([^)]+\))?(?:\/[A-G][#b]?)?)/g;
      
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        const precedingText = line.substring(lastIndex, match.index);
        if (precedingText) {
          elements.push(
            <span key={`text-${lineIdx}-${lastIndex}`} className="whitespace-pre text-neutral-400 font-mono">
              {precedingText}
            </span>
          );
        }

        const chordStr = match[1];
        const currentMatchIndex = match.index;

        elements.push(
          <button
            key={`chord-${lineIdx}-${currentMatchIndex}`}
            type="button"
            onClick={() => handleChordClick(chordStr)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 bg-[#FAF0EB] hover:bg-[#F4DCD1] active:bg-[#EAC7B6] text-[#C96442] font-mono text-xs font-bold rounded border border-[#F1D3C6] hover:border-[#D97757] transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
            title={`클릭하여 ${chordStr} 코드 소리 듣기`}
          >
            {chordStr}
          </button>
        );

        lastIndex = regex.lastIndex;
      }

      const trailingText = line.substring(lastIndex);
      if (trailingText) {
        elements.push(
          <span key={`trail-${lineIdx}-${lastIndex}`} className="whitespace-pre text-neutral-400 font-mono">
            {trailingText}
          </span>
        );
      }

      return (
        <div key={lineIdx} className="font-chord text-xs leading-loose whitespace-pre flex flex-wrap items-center">
          {elements}
        </div>
      );
    }

    // 4. 가사 라인 (코드 라인과 수직 열 일치를 위해 font-chord 사용)
    return (
      <div key={lineIdx} className="font-chord text-xs text-[#2C2B29] leading-relaxed py-0.5 whitespace-pre select-text">
        {line}
      </div>
    );
  };

  return (
    <div className={`p-4 bg-white flex flex-col gap-0.5 overflow-y-auto custom-scrollbar select-none ${className}`}>
      {lines.map((line, idx) => renderLine(line, idx))}
    </div>
  );
};
