/**
 * 음악 이론 관련 유틸리티 (12반음 계산, 코드 파싱, 조옮김, 구성음 추출)
 */

export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const CHROMATIC_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// 음이름 -> 0~11 세미톤 매핑
const NOTE_TO_SEMITONE: Record<string, number> = {
  'B#': 0, 'C': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'E#': 5, 'F': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11
};

export type AccidentalPreference = 'sharp' | 'flat';

export interface ParsedChord {
  raw: string;
  root: string;
  rootSemitone: number;
  quality: string;
  tension: string;
  bass?: string;
  bassSemitone?: number;
}

/**
 * 단일 코드 파싱 (대소문자, 괄호, 슬래시 베이스 완벽 지원)
 */
export function parseChord(chordStr: string): ParsedChord | null {
  if (!chordStr) return null;
  const raw = chordStr.trim();
  
  // 루트 추출: 첫 1~2글자 (A-G 뒤에 # 또는 b)
  const rootMatch = raw.match(/^([A-G][#b]?)/);
  if (!rootMatch) return null;

  const root = rootMatch[1];
  const rootSemitone = NOTE_TO_SEMITONE[root];
  if (rootSemitone === undefined) return null;

  let rest = raw.substring(root.length).trim();

  // 슬래시 베이스 추출 (예: /G, /F#)
  let bass: string | undefined;
  let bassSemitone: number | undefined;
  const slashIdx = rest.lastIndexOf('/');
  if (slashIdx !== -1) {
    const bassCandidate = rest.substring(slashIdx + 1).trim();
    if (NOTE_TO_SEMITONE[bassCandidate] !== undefined) {
      bass = bassCandidate;
      bassSemitone = NOTE_TO_SEMITONE[bassCandidate];
      rest = rest.substring(0, slashIdx).trim();
    }
  }

  // 괄호 처리: 괄호 안팎의 퀄리티와 텐션 분석
  const qualityAndTension = rest;

  // 정규화된 퀄리티 & 텐션 판별
  let quality = '';
  let tension = '';

  const cleanRest = qualityAndTension.replace(/[()]/g, '').toLowerCase();

  if (cleanRest.startsWith('maj7') || cleanRest.startsWith('m7b5') || cleanRest.startsWith('min7') || cleanRest.startsWith('m7') ||
      cleanRest.startsWith('maj') || cleanRest.startsWith('min') || cleanRest.startsWith('m') ||
      cleanRest.startsWith('dim7') || cleanRest.startsWith('dim') || cleanRest.startsWith('aug') ||
      cleanRest.startsWith('sus4') || cleanRest.startsWith('sus2') || cleanRest.startsWith('7b5') ||
      cleanRest.startsWith('7#9') || cleanRest.startsWith('7sus4') || cleanRest.startsWith('7')) {
    
    if (cleanRest.startsWith('m7b5') || cleanRest.startsWith('m7-5')) {
      quality = 'm7(b5)';
    } else if (cleanRest.startsWith('7b5')) {
      quality = '7(b5)';
    } else if (cleanRest.startsWith('7#9')) {
      quality = '7(#9)';
    } else if (cleanRest.startsWith('maj7')) {
      quality = 'maj7';
    } else if (cleanRest.startsWith('m7') || cleanRest.startsWith('min7')) {
      quality = 'm7';
    } else if (cleanRest.startsWith('dim7')) {
      quality = 'dim7';
    } else if (cleanRest.startsWith('dim')) {
      quality = 'dim';
    } else if (cleanRest.startsWith('aug')) {
      quality = 'aug';
    } else if (cleanRest.startsWith('sus4') || cleanRest.startsWith('7sus4')) {
      quality = 'sus4';
    } else if (cleanRest.startsWith('sus2')) {
      quality = 'sus2';
    } else if (cleanRest.startsWith('m') || cleanRest.startsWith('min')) {
      quality = 'm';
    } else if (cleanRest.startsWith('7')) {
      quality = '7';
    } else if (cleanRest.startsWith('6')) {
      quality = '6';
    }
  }

  // 텐션 (add9, 9, 11, 13 등)
  if (cleanRest.includes('add9')) tension = 'add9';
  else if (cleanRest.includes('9')) tension = '9';
  else if (cleanRest.includes('11')) tension = '11';
  else if (cleanRest.includes('13')) tension = '13';
  else if (cleanRest.includes('6') && quality !== '6') tension = '6';

  return {
    raw,
    root,
    rootSemitone,
    quality,
    tension,
    bass,
    bassSemitone
  };
}

/**
 * 단일 음을 n 반음 조옮김 (Transpose)
 */
export function transposeNote(note: string, semitones: number, pref: AccidentalPreference = 'sharp'): string {
  const current = NOTE_TO_SEMITONE[note];
  if (current === undefined) return note;

  const next = (current + semitones + 1200) % 12;
  return pref === 'flat' ? CHROMATIC_FLAT[next] : CHROMATIC_SHARP[next];
}

/**
 * 주어진 텍스트에서 플랫(# vs b) 선호도 자동 판단
 */
export function detectAccidentalPreference(text: string, defaultPref: AccidentalPreference = 'sharp'): AccidentalPreference {
  const flats = (text.match(/Db|Eb|Gb|Ab|Bb/g) || []).length;
  const sharps = (text.match(/C#|D#|F#|G#|A#/g) || []).length;
  if (flats > sharps) return 'flat';
  if (sharps > flats) return 'sharp';
  return defaultPref;
}

/**
 * 단일 코드명을 n 반음 조옮김
 */
export function transposeChordString(chordStr: string, semitones: number, pref?: AccidentalPreference): string {
  if (semitones === 0 || !chordStr) return chordStr;
  
  const preference = pref || detectAccidentalPreference(chordStr);

  return chordStr.replace(/([A-G][#b]?)(maj7|maj9|maj|min7|min|m7\(b5\)|m7|m|7\(b5\)|7\(#9\)|7|dim7|dim|aug|sus4|sus2|add9|6|9|11|13)?(\([^)]+\))?(\/([A-G][#b]?))?/g, (match, root, quality = '', tension = '', slashGroup = '', bass = '') => {
    const newRoot = transposeNote(root, semitones, preference);
    let newBass = '';
    if (bass) {
      newBass = '/' + transposeNote(bass, semitones, preference);
    }
    return `${newRoot}${quality}${tension}${newBass}`;
  });
}

/**
 * 가사와 코드가 섞인 전체 텍스트에서 코드 라인들만 식별하여 n 반음 조옮김
 */
export function transposeSongText(text: string, semitones: number, pref?: AccidentalPreference): string {
  if (semitones === 0 || !text) return text;

  const preference = pref || detectAccidentalPreference(text);
  const lines = text.split('\n');

  const transposedLines = lines.map(line => {
    if (/^\s*\[.*\]\s*$/.test(line)) return line;

    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return line;

    let chordCount = 0;
    for (const token of tokens) {
      const cleanToken = token.replace(/[()]/g, '');
      if (parseChord(cleanToken)) chordCount++;
    }

    const isChordLine = chordCount > 0 && (chordCount / tokens.length >= 0.4 || /^\s*(\([A-G][#b]?|[A-G][#b]?).*$/.test(line));

    if (isChordLine) {
      return line.replace(/([A-G][#b]?)(maj7|maj9|maj|min7|min|m7\(b5\)|m7|m|7\(b5\)|7\(#9\)|7|dim7|dim|aug|sus4|sus2|add9|6|9|11|13)?(\([^)]+\))?(\/([A-G][#b]?))?/g, (chordMatch) => {
        return transposeChordString(chordMatch, semitones, preference);
      });
    }

    return line;
  });

  return transposedLines.join('\n');
}

/**
 * 코드에 따른 음정(반음 간격) 목록 추출
 */
export function getChordIntervals(quality: string, tension: string): number[] {
  let intervals = [0, 4, 7]; // 기본 메이저 트라이어드

  const q = quality.toLowerCase();
  if (q === 'm' || q === 'min') {
    intervals = [0, 3, 7]; // 마이너
  } else if (q === 'dim') {
    intervals = [0, 3, 6]; // 디미니쉬
  } else if (q === 'dim7') {
    intervals = [0, 3, 6, 9]; // 디미니쉬7
  } else if (q === 'aug') {
    intervals = [0, 4, 8]; // 어그먼트
  } else if (q === 'sus4' || q === '7sus4') {
    intervals = [0, 5, 7]; // 서스포
  } else if (q === 'sus2') {
    intervals = [0, 2, 7]; // 서스투
  } else if (q === '7') {
    intervals = [0, 4, 7, 10]; // 도미넌트7
  } else if (q === 'maj7') {
    intervals = [0, 4, 7, 11]; // 메이저7
  } else if (q === 'm7' || q === 'min7') {
    intervals = [0, 3, 7, 10]; // 마이너7
  } else if (q === 'm7(b5)' || q === 'm7b5') {
    intervals = [0, 3, 6, 10]; // 하프 디미니쉬
  } else if (q === '7(b5)' || q === '7b5') {
    intervals = [0, 4, 6, 10];
  } else if (q === '7(#9)' || q === '7#9') {
    intervals = [0, 4, 7, 10, 15];
  } else if (q === '6') {
    intervals = [0, 4, 7, 9];
  }

  // 텐션 추가
  const t = tension.toLowerCase();
  if (t.includes('add9')) {
    if (!intervals.includes(14)) intervals.push(14);
  } else if (t.includes('9')) {
    if (!intervals.includes(14)) intervals.push(14);
  } else if (t.includes('11')) {
    if (!intervals.includes(14)) intervals.push(14);
    if (!intervals.includes(17)) intervals.push(17);
  } else if (t.includes('13')) {
    if (!intervals.includes(14)) intervals.push(14);
    if (!intervals.includes(21)) intervals.push(21);
  }

  return intervals;
}

export interface ChordNoteInfo {
  noteName: string;
  midi: number;
  freq: number;
  isRoot: boolean;
  isBass: boolean;
}

/**
 * MIDI 번호를 주파수(Hz)로 변환 (A4 = 69 = 440Hz)
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 특정 코드의 구성음 MIDI 및 주파수 정보 목록 계산
 * 기본 옥타브 4: 가온 C4(MIDI 60)를 중심으로 맑고 선명한 찬양/가요 반주 음역대
 */
export function getChordNotes(chordStr: string, baseOctave = 4): ChordNoteInfo[] {
  const parsed = parseChord(chordStr);
  if (!parsed) return [];

  // 루트음: 4옥타브 기준 (C4 = 60, D4 = 62 ...)
  const rootMidi = baseOctave * 12 + 12 + parsed.rootSemitone;
  const intervals = getChordIntervals(parsed.quality, parsed.tension);

  const notes: ChordNoteInfo[] = [];

  // 슬래시 베이스가 있다면 베이스는 1옥타브 아래(3옥타브)에서 풍성하게 받쳐줌
  if (parsed.bassSemitone !== undefined) {
    const bassMidi = (baseOctave - 1) * 12 + 12 + parsed.bassSemitone;
    const bassNoteName = parsed.bass || CHROMATIC_SHARP[parsed.bassSemitone];
    notes.push({
      noteName: bassNoteName,
      midi: bassMidi,
      freq: midiToFrequency(bassMidi),
      isRoot: false,
      isBass: true
    });
  }

  // 코드 구성음들
  intervals.forEach((interval, idx) => {
    const midi = rootMidi + interval;
    const semitone = midi % 12;
    const noteName = CHROMATIC_SHARP[semitone];
    notes.push({
      noteName,
      midi,
      freq: midiToFrequency(midi),
      isRoot: idx === 0,
      isBass: false
    });
  });

  return notes;
}

/**
 * 코드와 가사가 섞인 텍스트에서 코드 라인 및 섹션 태그([Verse] 등)를 완전히 제거하고
 * 상세편집용 순수한 가사 문장만 추출합니다.
 */
export function extractPureLyrics(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const lyricsLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (lyricsLines.length > 0 && lyricsLines[lyricsLines.length - 1] !== '') {
        lyricsLines.push('');
      }
      continue;
    }

    // [Verse], [Chorus] 등의 섹션 태그 제거
    if (/^\s*\[.*\]\s*$/.test(trimmed)) continue;

    // 코드 라인인지 검사
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    let chordCount = 0;
    for (const token of tokens) {
      const cleanToken = token.replace(/[()]/g, '');
      if (parseChord(cleanToken)) chordCount++;
    }

    const isChordLine = chordCount > 0 && (chordCount / tokens.length >= 0.35 || /^\s*(\([A-G][#b]?|[A-G][#b]?).*$/.test(trimmed));

    // 코드 라인이 아닐 때만 가사로 수집
    if (!isChordLine) {
      // 악보 음절 붙임줄(-), 마침표(.) 등 음악 기호 정제:
      // 예: "나-가리" -> "나아가리" 또는 "나가리", "나의. 길이" -> "나의 길이", "예 - - - 수" -> "예수", "정금 같 - 이 - 나아오 리 라" -> "정금 같이 나아오리라"
      let clean = trimmed
        .replace(/([가-힣])\s*-\s*-\s*-\s*([가-힣])/g, '$1$2')
        .replace(/([가-힣])\s*-\s*([가-힣])/g, '$1$2')
        .replace(/([가-힣])\s*-\s*이\s*-\s*/g, '$1이 ')
        .replace(/\.\s+/g, ' ')
        .replace(/\s*-\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (clean) {
        lyricsLines.push(clean);
      }
    }
  }

  return lyricsLines.join('\n').trim();
}
