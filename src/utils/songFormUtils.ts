import type { SongFormBlock } from '../types/hymnal';

export const SONG_FORM_PART_TYPES = [
  { full: 'Intro', short: 'In', defaultBars: 4 },
  { full: 'Verse 1', short: 'V1', defaultBars: 8 },
  { full: 'Verse 2', short: 'V2', defaultBars: 8 },
  { full: 'Pre-Chorus', short: 'PC', defaultBars: 4 },
  { full: 'Chorus', short: 'C', defaultBars: 8 },
  { full: 'Bridge', short: 'B', defaultBars: 8 },
  { full: 'Interlude', short: 'Int', defaultBars: 4 },
  { full: 'Vamp', short: 'Vamp', defaultBars: 4 },
  { full: 'Solo', short: 'Solo', defaultBars: 8 },
  { full: 'Outro', short: 'Out', defaultBars: 4 },
  { full: 'Tag', short: 'Tag', defaultBars: 4 },
];

/**
 * 블록 리스트를 한 줄 텍스트(예: In(4) - V1(8) - PC(4) - C(8) x2 - B(8) - Out(4))로 변환
 */
export function formatSongFormBlocksToText(blocks: SongFormBlock[]): string {
  if (!blocks || blocks.length === 0) return '';

  return blocks
    .map((b) => {
      const match = SONG_FORM_PART_TYPES.find(
        (p) => p.full.toLowerCase() === b.type.toLowerCase() || p.short.toLowerCase() === b.type.toLowerCase()
      );
      const name = match ? match.short : b.type;
      const barPart = b.barCount ? `(${b.barCount})` : '';
      const repPart = b.repeatCount > 1 ? ` x${b.repeatCount}` : b.repeatCount === 0 ? ' x∞' : '';
      return `${name}${barPart}${repPart}`;
    })
    .join(' - ');
}

/**
 * 텍스트로부터 송폼 블록 배열 생성 (지능형 파서)
 */
export function parseTextToSongFormBlocks(text: string): SongFormBlock[] {
  if (!text || !text.trim()) return [];

  const rawParts = text.split(/[-–—>→,]/).map((s) => s.trim()).filter(Boolean);
  const blocks: SongFormBlock[] = [];

  for (let idx = 0; idx < rawParts.length; idx++) {
    const raw = rawParts[idx];
    let type = raw;
    let barCount = 8;
    let repeatCount = 1;

    // 반복 횟수 파싱 x2, x3, x∞
    const repMatch = raw.match(/x(\d+|∞)/i);
    if (repMatch) {
      repeatCount = repMatch[1] === '∞' ? 0 : parseInt(repMatch[1], 10) || 1;
      type = type.replace(repMatch[0], '').trim();
    }

    // 마디 수 파싱 (4), (8), (16)
    const barMatch = raw.match(/\((\d+)\)/);
    if (barMatch) {
      barCount = parseInt(barMatch[1], 10) || 8;
      type = type.replace(barMatch[0], '').trim();
    }

    // 파트 이름 정규화
    const cleanType = type.toLowerCase();
    const matched = SONG_FORM_PART_TYPES.find(
      (p) => p.short.toLowerCase() === cleanType || p.full.toLowerCase() === cleanType
    );
    const finalType = matched ? matched.full : type || `Part ${idx + 1}`;

    blocks.push({
      id: `block_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      type: finalType,
      barCount,
      repeatCount,
    });
  }

  return blocks;
}

/**
 * 새 블록 생성 헬퍼
 */
export function createNewSongFormBlock(partFull: string, barCount?: number, memo?: string, chords?: string): SongFormBlock {
  const match = SONG_FORM_PART_TYPES.find((p) => p.full === partFull);
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: partFull,
    repeatCount: 1,
    barCount: barCount || match?.defaultBars || 8,
    chords: chords || '',
    memo: memo || '',
  };
}
