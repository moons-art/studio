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
    const clean = chordStr.replace(/[(),]/g, '').trim();
    const notes = getChordNotes(clean);
    if (notes.length > 0) {
      soundEngine.playChord(notes, instrument);
      if (onChordClick) {
        onChordClick(clean, notes);
      }
    }
  };

  // 한 줄 렌더링 (일반 텍스트 모드와 100% 동일한 CJK 모노스페이스 수직 싱크 보존)
  const renderLine = (line: string, lineIdx: number) => {
    // 1. 섹션 헤더 (예: [Verse], [Chorus], [Bridge])
    if (/^\s*\[.*\]\s*$/.test(line)) {
      return (
        <div key={lineIdx} className="font-chord text-xs sm:text-sm font-bold text-[#C96442] leading-relaxed whitespace-pre select-none">
          {line}
        </div>
      );
    }

    // 2. 빈 줄
    if (!line.trim()) {
      return <div key={lineIdx} className="font-chord text-xs sm:text-sm leading-relaxed whitespace-pre">&nbsp;</div>;
    }

    // 3. 코드 라인 여부 판별 (A2, D2, F#m11, E/G# 등 모든 텐션/숫자/분수코드 완벽 판별)
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    let chordCount = 0;
    for (const token of tokens) {
      const cleanToken = token.replace(/[(),]/g, '');
      if (parseChord(cleanToken)) chordCount++;
    }

    const isChordLine = chordCount > 0 && (chordCount / tokens.length >= 0.35 || /^\s*(\([A-G][#b]?|[A-G][#b]?).*$/.test(line));

    if (isChordLine) {
      // 공백과 코드 토큰을 정밀하게 분리하여 앞뒤 공백과 수직 위치를 1픽셀도 밀림 없이 그대로 유지
      const regex = /\S+/g;
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        // 코드 이전의 공백 텍스트를 정확하게 보존
        if (match.index > lastIndex) {
          const spaceText = line.substring(lastIndex, match.index);
          elements.push(
            <span key={`space-${lineIdx}-${lastIndex}`} className="font-chord whitespace-pre">
              {spaceText}
            </span>
          );
        }

        const rawToken = match[0];
        const cleanToken = rawToken.replace(/[(),]/g, '');
        const isChord = !!parseChord(cleanToken);
        const currentMatchIndex = match.index;

        if (isChord) {
          elements.push(
            <button
              key={`chord-${lineIdx}-${currentMatchIndex}`}
              type="button"
              onClick={() => handleChordClick(rawToken)}
              className="relative inline-block font-chord font-bold text-[#C96442] cursor-pointer select-none group focus:outline-none"
              title={`클릭하여 ${rawToken} 코드 소리 듣기`}
            >
              {/* 절대 위치 배지로 배경과 테두리를 렌더링: 텍스트 너비(character width)에 1px의 오차도 주지 않아 완벽한 수직 싱크 유지 */}
              <span className="absolute -inset-x-0.5 -inset-y-0.5 bg-[#FAF0EB] group-hover:bg-[#F4DCD1] active:bg-[#EAC7B6] rounded border border-[#F1D3C6] group-hover:border-[#D97757] -z-10 transition-colors pointer-events-none shadow-2xs" />
              <span className="relative z-0">{rawToken}</span>
            </button>
          );
        } else {
          elements.push(
            <span key={`text-${lineIdx}-${currentMatchIndex}`} className="font-chord whitespace-pre text-[#2C2B29]">
              {rawToken}
            </span>
          );
        }

        lastIndex = regex.lastIndex;
      }

      // 줄 끝의 잔여 공백 보존
      if (lastIndex < line.length) {
        elements.push(
          <span key={`trail-${lineIdx}-${lastIndex}`} className="font-chord whitespace-pre">
            {line.substring(lastIndex)}
          </span>
        );
      }

      return (
        <div key={lineIdx} className="font-chord text-xs sm:text-sm leading-relaxed whitespace-pre">
          {elements}
        </div>
      );
    }

    // 4. 가사 라인 (일반 텍스트 textarea와 100% 동일한 폰트/크기/줄간격/공백으로 수직 싱크 일치)
    return (
      <div key={lineIdx} className="font-chord text-xs sm:text-sm text-[#2C2B29] leading-relaxed whitespace-pre select-text">
        {line}
      </div>
    );
  };

  return (
    <div className={`p-3.5 font-chord text-xs sm:text-sm text-[#2C2B29] leading-relaxed border border-[#E7E5DF] rounded-xl bg-white overflow-x-auto overflow-y-auto whitespace-pre custom-scrollbar select-none ${className}`}>
      {lines.map((line, idx) => renderLine(line, idx))}
    </div>
  );
};
