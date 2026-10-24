import React, { useState, useMemo } from 'react';
import { 
  CHROMATIC_SHARP, 
  CHROMATIC_FLAT, 
  getChordNotes,
  type AccidentalPreference, 
  type ChordNoteInfo
} from '../../utils/musicTheory';
import { soundEngine, type InstrumentType } from '../../utils/soundEngine';
import { Volume2, Plus, Copy, Check, X } from 'lucide-react';

interface ChordBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertChord: (chord: string) => void;
  instrument: InstrumentType;
  onChordSelect?: (notes: ChordNoteInfo[], chordName: string) => void;
}

const QUALITIES = [
  { label: 'Major (기본)', val: '' },
  { label: 'm (마이너)', val: 'm' },
  { label: '7 (도미넌트7)', val: '7' },
  { label: 'maj7 (메이저7)', val: 'maj7' },
  { label: 'm7 (마이너7)', val: 'm7' },
  { label: 'dim (디미니쉬)', val: 'dim' },
  { label: 'aug (어그먼트)', val: 'aug' },
  { label: 'sus4', val: 'sus4' },
  { label: 'sus2', val: 'sus2' }
];

const TENSIONS = [
  { label: 'None', val: '' },
  { label: 'add9', val: 'add9' },
  { label: '6', val: '6' },
  { label: '9', val: '9' },
  { label: '11', val: '11' },
  { label: '13', val: '13' },
  { label: '7(b5)', val: '7(b5)' },
  { label: '7(#9)', val: '7(#9)' },
  { label: 'dim7', val: 'dim7' },
  { label: 'm7(b5)', val: 'm7(b5)' }
];

export const ChordBuilderModal: React.FC<ChordBuilderModalProps> = ({
  isOpen,
  onClose,
  onInsertChord,
  instrument,
  onChordSelect
}) => {
  const [pref, setPref] = useState<AccidentalPreference>('flat');
  const [selectedRoot, setSelectedRoot] = useState<string>('C');
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [selectedTension, setSelectedTension] = useState<string>('');
  const [selectedBass, setSelectedBass] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // 현재 선택된 12반음 목록 (#/b 토글 반영)
  const currentRoots = pref === 'flat' ? CHROMATIC_FLAT : CHROMATIC_SHARP;

  // 조합된 코드명 생성
  const assembledChord = useMemo(() => {
    let chord = selectedRoot;

    // 만약 tension에서 이미 m7(b5)나 dim7 등을 택했으면 중복 방지
    if (selectedTension === 'm7(b5)' || selectedTension === 'dim7' || selectedTension === '7(b5)' || selectedTension === '7(#9)') {
      chord += selectedTension;
    } else {
      chord += selectedQuality;
      if (selectedTension) {
        chord += `(${selectedTension})`;
      }
    }

    if (selectedBass) {
      chord += `/${selectedBass}`;
    }

    return chord;
  }, [selectedRoot, selectedQuality, selectedTension, selectedBass]);

  // 코드 구성음
  const chordNotes = useMemo(() => {
    return getChordNotes(assembledChord);
  }, [assembledChord]);

  if (!isOpen) return null;

  const handlePlayPreview = async () => {
    const notes = chordNotes.length > 0 ? chordNotes : getChordNotes(assembledChord);
    await soundEngine.playChord(notes, instrument);
    if (onChordSelect) {
      onChordSelect(notes, assembledChord);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(assembledChord);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleInsert = () => {
    onInsertChord(assembledChord);
    handlePlayPreview();
    onClose();
  };

  // 특정 파라미터 조합으로 즉시 코드 생성 및 연주
  const triggerPlay = (r: string, q: string, t: string, b: string) => {
    let chord = r;
    if (t === 'm7(b5)' || t === 'dim7' || t === '7(b5)' || t === '7(#9)') {
      chord += t;
    } else {
      chord += q;
      if (t) chord += `(${t})`;
    }
    if (b) chord += `/${b}`;

    const notes = getChordNotes(chord);
    if (notes.length > 0) {
      soundEngine.playChord(notes, instrument);
      if (onChordSelect) onChordSelect(notes, chord);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E7E5DF] w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* 헤더: 코드를 생성하세요 */}
        <div className="px-5 py-3.5 bg-[#FAF9F5] border-b border-[#E7E5DF] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C96442]" />
            <h3 className="font-serif text-sm font-bold text-[#2C2B29]">코드를 생성하세요</h3>
            <span className="text-[11px] text-[#8C877D] font-normal">12반음 체계</span>
          </div>

          <div className="flex items-center gap-2">
            {/* 이명동음(#/b) 스위치 */}
            <div className="flex items-center bg-white border border-[#E7E5DF] rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setPref('sharp')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  pref === 'sharp' ? 'bg-[#C96442] text-white shadow-2xs' : 'text-[#6A6864] hover:text-[#2C2B29]'
                }`}
              >
                # (샵)
              </button>
              <button
                type="button"
                onClick={() => setPref('flat')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  pref === 'flat' ? 'bg-[#C96442] text-white shadow-2xs' : 'text-[#6A6864] hover:text-[#2C2B29]'
                }`}
              >
                b (플랫)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 hover:bg-[#E7E5DF] rounded-lg text-[#8C877D] hover:text-[#2C2B29] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh] custom-scrollbar">
          
          {/* 1. Root 선택 (12개 버튼) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-[#A3A19B] uppercase tracking-wider">1. Root (근음)</span>
              <span className="text-xs font-bold text-[#C96442] font-mono">{selectedRoot}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {currentRoots.map((root) => (
                <button
                  key={root}
                  type="button"
                  onClick={() => {
                    setSelectedRoot(root);
                    triggerPlay(root, selectedQuality, selectedTension, selectedBass);
                  }}
                  className={`h-9 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer border ${
                    selectedRoot === root
                      ? 'bg-[#C96442] text-white border-[#B55434] shadow-sm scale-102'
                      : 'bg-[#FAF9F5] hover:bg-white text-[#4A4741] border-[#E7E5DF] hover:border-[#C96442]/50'
                  }`}
                >
                  {root}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Quality 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-[#A3A19B] uppercase tracking-wider">2. Quality (코드 성격)</span>
              <span className="text-xs font-bold text-[#4A4741] font-mono">{selectedQuality || 'Major'}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {QUALITIES.map((q) => (
                <button
                  key={q.val}
                  type="button"
                  onClick={() => {
                    setSelectedQuality(q.val);
                    triggerPlay(selectedRoot, q.val, selectedTension, selectedBass);
                  }}
                  className={`h-8 px-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer border truncate ${
                    selectedQuality === q.val
                      ? 'bg-[#2C2B29] text-white border-black shadow-xs font-bold'
                      : 'bg-white hover:bg-[#FAF9F5] text-[#6A6864] border-[#E7E5DF]'
                  }`}
                >
                  {q.val || 'Major'}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Tension 토글 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-[#A3A19B] uppercase tracking-wider">3. Tension & Altered</span>
              <span className="text-xs font-bold text-[#4A4741] font-mono">{selectedTension || 'None'}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {TENSIONS.map((t) => (
                <button
                  key={t.val}
                  type="button"
                  onClick={() => {
                    setSelectedTension(t.val);
                    triggerPlay(selectedRoot, selectedQuality, t.val, selectedBass);
                  }}
                  className={`h-8 px-2 rounded-xl text-[11px] font-medium transition-all cursor-pointer border truncate ${
                    selectedTension === t.val
                      ? 'bg-[#8F5535] text-white border-[#7A4527] shadow-xs font-bold'
                      : 'bg-white hover:bg-[#FAF9F5] text-[#6A6864] border-[#E7E5DF]'
                  }`}
                >
                  {t.val || 'None'}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Slash / Bass 토글 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-[#A3A19B] uppercase tracking-wider">4. Slash / Bass (분수 코드)</span>
              <span className="text-xs font-bold text-[#4A4741] font-mono">{selectedBass ? `/${selectedBass}` : 'None'}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedBass('');
                  triggerPlay(selectedRoot, selectedQuality, selectedTension, '');
                }}
                className={`h-7 rounded-lg text-[10px] font-semibold transition-all cursor-pointer border ${
                  !selectedBass ? 'bg-[#5A5751] text-white border-[#474540]' : 'bg-white text-[#8C877D] border-[#E7E5DF]'
                }`}
              >
                None
              </button>
              {currentRoots.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setSelectedBass(b);
                    triggerPlay(selectedRoot, selectedQuality, selectedTension, b);
                  }}
                  className={`h-7 rounded-lg font-mono text-[10px] font-semibold transition-all cursor-pointer border ${
                    selectedBass === b
                      ? 'bg-[#5A5751] text-white border-[#474540] shadow-xs'
                      : 'bg-[#FAF9F5] hover:bg-white text-[#6A6864] border-[#E7E5DF]'
                  }`}
                >
                  /{b}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* 하단 미리보기 및 액션 바 */}
        <div className="p-4 bg-[#FAF9F5] border-t border-[#E7E5DF] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-white px-3.5 py-1.5 rounded-xl border border-[#E7E5DF] shadow-2xs flex items-center gap-2">
              <span className="text-[10px] text-[#A3A19B] font-bold uppercase">완성 코드</span>
              <span className="text-base font-extrabold text-[#C96442] font-mono tracking-wide">
                {assembledChord}
              </span>
            </div>

            {/* 사운드 미리듣기 */}
            <button
              type="button"
              onClick={handlePlayPreview}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#FAF0EB] text-[#C96442] border border-[#F1D3C6] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
              title="악기 소리 미리듣기"
            >
              <Volume2 className="w-3.5 h-3.5 stroke-[2.2px]" />
              <span>미리듣기</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-2 bg-white hover:bg-[#F5F3ED] text-[#6A6864] border border-[#E7E5DF] rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '복사됨' : '복사'}</span>
            </button>

            <button
              type="button"
              onClick={handleInsert}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#C96442] hover:bg-[#B55434] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5px]" />
              <span>코드 입력</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
