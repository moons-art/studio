import React from 'react';
import { midiToFrequency, type ChordNoteInfo } from '../../utils/musicTheory';
import { soundEngine, type InstrumentType } from '../../utils/soundEngine';

interface VirtualPianoProps {
  activeNotes: ChordNoteInfo[];
  instrument: InstrumentType;
  onKeyClick?: (noteName: string, midi: number) => void;
  className?: string;
}

// 2옥타브 건반 범위: C3 (48) ~ B4 (71)
const START_MIDI = 48; // C3
const NUM_KEYS = 24;   // 24 반음 (2옥타브)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface KeyDef {
  midi: number;
  noteName: string;
  octave: number;
  isBlack: boolean;
  whiteIndex: number;
}

export const VirtualPiano: React.FC<VirtualPianoProps> = ({
  activeNotes = [],
  instrument = 'piano',
  onKeyClick,
  className = ''
}) => {
  // 건반 리스트 생성
  const keys: KeyDef[] = [];
  let whiteCount = 0;

  for (let i = 0; i < NUM_KEYS; i++) {
    const midi = START_MIDI + i;
    const semitone = midi % 12;
    const noteName = NOTE_NAMES[semitone];
    const octave = Math.floor(midi / 12) - 1;
    const isBlack = noteName.includes('#');
    
    keys.push({
      midi,
      noteName,
      octave,
      isBlack,
      whiteIndex: isBlack ? whiteCount - 1 : whiteCount++
    });
  }

  const whiteKeys = keys.filter(k => !k.isBlack);
  const blackKeys = keys.filter(k => k.isBlack);

  // 현재 활성화된 건반 여부 및 속성 판별
  const getNoteStatus = (midi: number) => {
    // 옥타브 무관하게 semitone 일치 혹은 정확한 midi 일치 판별
    const match = activeNotes.find(n => n.midi === midi || (n.midi % 12 === midi % 12));
    if (!match) return null;
    return {
      isRoot: match.isRoot,
      isBass: match.isBass,
      noteName: match.noteName
    };
  };

  const handleKeyPress = (key: KeyDef) => {
    const freq = midiToFrequency(key.midi);
    soundEngine.playNote(freq, instrument, 1.4);
    if (onKeyClick) {
      onKeyClick(key.noteName, key.midi);
    }
  };

  const totalWhite = whiteKeys.length; // 14개

  // 검은 건반의 위치(%) 계산
  const getBlackKeyLeftPercent = (key: KeyDef) => {
    // 각 백건 폭 비율
    const whiteKeyWidthPercent = 100 / totalWhite;
    // 화이트 인덱스 기준으로 검은건반은 해당 백건과 다음 백건 경계에 위치
    const semitone = key.midi % 12;
    let offset = 0.65; // C#, F#
    if (semitone === 3 || semitone === 10) offset = 0.72; // Eb, Bb
    if (semitone === 8) offset = 0.68; // Ab

    return (key.whiteIndex * whiteKeyWidthPercent) + (whiteKeyWidthPercent * 0.7);
  };

  return (
    <div className={`select-none flex flex-col items-center bg-[#1E1D1B] p-2.5 rounded-xl border border-[#3E3C38] shadow-inner ${className}`}>
      {/* 건반 상단 상태 바 */}
      <div className="w-full flex items-center justify-between text-[11px] text-[#A3A19B] mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">가상 건반</span>
          {activeNotes.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#2C2A28] px-2 py-0.5 rounded-md border border-[#4A4744]">
              <span className="text-[10px] text-[#D97757] font-bold">화음:</span>
              <span className="text-[10px] font-mono font-medium text-white">
                {activeNotes.map(n => n.noteName).join(' - ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 피아노 건반 렌더링 컨테이너 */}
      <div className="relative w-full h-24 bg-[#141312] rounded-lg p-1 pt-1.5 shadow-2xl overflow-hidden flex justify-center">
        <div className="relative w-full h-full flex">
          {/* 흰 건반들 */}
          {whiteKeys.map((k) => {
            const status = getNoteStatus(k.midi);
            const isPressed = !!status;

            let bgClass = "bg-white hover:bg-neutral-100 active:bg-neutral-200 text-[#6A6864]";
            if (status?.isRoot) {
              bgClass = "bg-[#C96442] text-white shadow-md ring-2 ring-[#B55434]";
            } else if (status?.isBass) {
              bgClass = "bg-[#B05335] text-white shadow-md ring-2 ring-[#8F3F26]";
            } else if (isPressed) {
              bgClass = "bg-[#E08365] text-white shadow-md ring-1 ring-[#C96442]";
            }

            return (
              <button
                key={k.midi}
                onClick={() => handleKeyPress(k)}
                className={`flex-1 h-full rounded-b-sm border-r border-[#D9D7D2] last:border-r-0 flex flex-col justify-end items-center pb-1 transition-all duration-75 cursor-pointer relative ${bgClass}`}
                style={{ zIndex: 1 }}
                title={`${k.noteName}${k.octave}`}
              >
                <span className={`text-[9px] font-mono font-semibold ${isPressed ? 'text-white font-bold scale-110' : 'text-[#8C877D]'}`}>
                  {k.noteName}
                  {k.noteName === 'C' && <span className="text-[8px] opacity-70">{k.octave}</span>}
                </span>
              </button>
            );
          })}

          {/* 검은 건반들 */}
          {blackKeys.map((k) => {
            const status = getNoteStatus(k.midi);
            const isPressed = !!status;

            let bgClass = "bg-[#252321] hover:bg-[#383532] active:bg-[#4D4945] text-white";
            if (status?.isRoot) {
              bgClass = "bg-[#B55434] text-white shadow-lg ring-2 ring-white";
            } else if (status?.isBass) {
              bgClass = "bg-[#9E4529] text-white shadow-lg ring-2 ring-white";
            } else if (isPressed) {
              bgClass = "bg-[#C96442] text-white shadow-lg ring-1 ring-white";
            }

            const leftPos = getBlackKeyLeftPercent(k);

            return (
              <button
                key={k.midi}
                onClick={() => handleKeyPress(k)}
                className={`absolute top-0 h-[62%] rounded-b-sm border border-black/40 flex flex-col justify-end items-center pb-1 transition-all duration-75 cursor-pointer shadow-md ${bgClass}`}
                style={{
                  left: `${leftPos}%`,
                  width: `${(100 / totalWhite) * 0.65}%`,
                  zIndex: 10
                }}
                title={`${k.noteName}${k.octave}`}
              >
                <span className={`text-[8px] font-mono leading-none ${isPressed ? 'text-white font-bold scale-110' : 'text-neutral-400'}`}>
                  {k.noteName.replace('#', '')}#
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
