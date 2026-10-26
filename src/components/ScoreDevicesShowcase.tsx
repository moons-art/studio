import React, { useState } from 'react';
import { motion } from 'framer-motion';

export const ScoreDevicesShowcase: React.FC<{ onExploreClick?: () => void }> = ({ onExploreClick }) => {
  const [selectedKey, setSelectedKey] = useState<'C' | 'D' | 'E' | 'G' | 'A'>('G');
  const [currentPart] = useState<'인도자' | '건반' | '기타' | '싱어'>('인도자');

  // Interactive chords map based on key
  const chordProgression: Record<'C' | 'D' | 'E' | 'G' | 'A', { c1: string; c2: string; c3: string; c4: string }> = {
    C: { c1: 'C', c2: 'G/B', c3: 'Am7', c4: 'Fmaj7' },
    D: { c1: 'D', c2: 'A/C#', c3: 'Bm7', c4: 'Gmaj7' },
    E: { c1: 'E', c2: 'B/D#', c3: 'C#m7', c4: 'Amaj7' },
    G: { c1: 'G', c2: 'D/F#', c3: 'Em7', c4: 'Cmaj7' },
    A: { c1: 'A', c2: 'E/G#', c3: 'F#m7', c4: 'Dmaj7' },
  };

  const chords = chordProgression[selectedKey];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center select-none py-6">
      {/* Main Tablet & Companion Device Showcase */}
      <div className="relative w-full flex items-center justify-center pt-2 pb-4">
        {/* Central iPad Pro Style Music Sheet Viewer */}
        <motion.div
          initial={{ opacity: 0, y: 70 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 w-full max-w-2xl bg-[#0f172a] rounded-[28px] p-3 sm:p-4 shadow-[0_24px_50px_rgba(15,23,42,0.22)] border-[5px] border-slate-800 transition-all duration-300 hover:-translate-y-3 hover:scale-[1.01] hover:shadow-[0_36px_70px_rgba(15,23,42,0.32)]"
        >
          {/* Tablet Screen */}
          <div className="w-full bg-[#fdfdfd] rounded-[20px] overflow-hidden text-slate-900 flex flex-col shadow-inner min-h-[380px] sm:min-h-[440px]">
            {/* Top Music Bar */}
            <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold text-emerald-300">LIVE SYNC</span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-slate-100 truncate max-w-[150px] sm:max-w-none">
                  02. 주 은혜임을 (마커스 워십)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded">
                  {(['C', 'D', 'E', 'G', 'A'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedKey(k)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        selectedKey === k ? 'bg-emerald-500 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-semibold">
                  {currentPart} 뷰
                </span>
              </div>
            </div>

            {/* Setlist Drawer Bar */}
            <div className="bg-slate-100/90 px-4 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
              <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                <span className="font-bold text-[#006948]">콘티 목록:</span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-medium">
                  1. 내 모습 이대로 (G)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#006948] text-white font-bold shadow-xs">
                  2. 주 은혜임을 ({selectedKey})
                </span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-medium hidden sm:inline">
                  3. 꽃들도 (E)
                </span>
                <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-medium hidden sm:inline">
                  4. 은혜 아니면 (C)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 pl-2">2 / 4곡</span>
            </div>

            {/* Music Sheet Canvas Area */}
            <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between bg-gradient-to-b from-white to-slate-50 font-serif">
              {/* Sheet Title */}
              <div className="text-center pb-2 border-b border-slate-300">
                <h3 className="text-[18px] sm:text-[22px] font-black text-slate-900 tracking-tight">
                  주 은혜임을
                </h3>
                <p className="text-[11px] sm:text-[12px] text-slate-500 font-sans mt-0.5">
                  Words & Music by 정선경 · Key of {selectedKey}
                </p>
              </div>

              {/* Music Lines (Interactive Chords + Lyrics) */}
              <div className="flex flex-col gap-4 py-3 font-sans">
                {/* Line 1 */}
                <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 shadow-xs">
                  <div className="grid grid-cols-4 text-[13px] sm:text-[15px] font-black text-[#006948] font-mono">
                    <span>{chords.c1}</span>
                    <span>{chords.c2}</span>
                    <span>{chords.c3}</span>
                    <span>{chords.c4}</span>
                  </div>
                  <div className="grid grid-cols-4 text-[12px] sm:text-[13.5px] text-slate-800 font-medium mt-1 tracking-tight">
                    <span>주 나의 모습 보시네</span>
                    <span>상한 나의 맘 보시네</span>
                    <span>주 나의 눈물 아시네</span>
                    <span>홀로 울던 맘 아시네</span>
                  </div>
                </div>

                {/* Line 2 (Chorus) */}
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 mb-1">
                    <span className="px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 font-mono">
                      CHORUS
                    </span>
                    <span className="text-[11px] text-emerald-700">전체 찬양팀 화면 실시간 동기화 중</span>
                  </div>
                  <div className="grid grid-cols-4 text-[13px] sm:text-[15px] font-black text-[#006948] font-mono">
                    <span>{chords.c1}</span>
                    <span>{chords.c2}</span>
                    <span>{chords.c3}</span>
                    <span>{chords.c4}</span>
                  </div>
                  <div className="grid grid-cols-4 text-[12px] sm:text-[13.5px] text-slate-900 font-bold mt-1 tracking-tight">
                    <span>세상 소망 다 사라져가도</span>
                    <span>주의 사랑은 끝이 없으니</span>
                    <span>살아가는 이 모든 순간이</span>
                    <span>주 은혜임을 나는 믿네</span>
                  </div>
                </div>
              </div>

              {/* Tablet Bottom Controls */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-sans">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold">👆</span>
                  <span>풋페달 / 화면 탭으로 자동 페이지 넘김</span>
                </div>
                <div className="flex items-center gap-1 text-[#006948] font-bold">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>찬양팀 7대 디바이스 연결됨</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Left Side Smartphone Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 90 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.85, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:block absolute -left-6 bottom-4 z-30 w-52 bg-slate-900 rounded-[24px] p-2.5 shadow-2xl border-[3px] border-slate-700 transform -rotate-3 hover:rotate-0 hover:-translate-y-4 hover:scale-105 transition-all duration-300"
        >
          <div className="bg-white rounded-[18px] p-3 text-[11px] flex flex-col gap-2 shadow-inner">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-[#006948]">싱어 파트 보면대</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                SYNC
              </span>
            </div>
            <div className="text-[11px] text-slate-700 font-medium leading-snug">
              <p className="text-[9.5px] text-slate-400 mb-0.5">인도자 코멘트:</p>
              <p className="bg-amber-50 p-1.5 rounded border border-amber-200 text-amber-900 font-bold text-[10px]">
                "후렴 한 번 더 반복 후 아카펠라로 들어갑니다"
              </p>
            </div>
            <div className="p-2 rounded bg-slate-100 flex items-center justify-between text-[10px] text-slate-600">
              <span>현재 키: {selectedKey}</span>
              <span className="font-bold text-blue-600">4마디 전주</span>
            </div>
          </div>
        </motion.div>
      </div>

      {onExploreClick && (
        <button
          type="button"
          onClick={onExploreClick}
          className="mt-3 text-[12px] font-bold text-[#006948] hover:text-[#00855d] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>네이션스 악보 기능 더 알아보기</span>
          <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
        </button>
      )}
    </div>
  );
};
