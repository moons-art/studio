export interface SongFormBlock {
  id: string;
  type: string; // 'Intro' | 'Verse 1' | 'Verse 2' | 'Pre-Chorus' | 'Chorus' | 'Bridge' | 'Interlude' | 'Vamp' | 'Solo' | 'Outro' | 'Tag'
  repeatCount: number; // 1, 2, 3, 4 (0 for infinity)
  barCount: number; // 4, 8, 16 등
  chords?: string; // 둘째줄 코드진행 (예: C - G/B - Am7 - G)
  memo?: string; // 인도자가 해당 파트 옆에 적은 메모/텍스트
}

export interface HymnalSong {
  id: string;
  number: number;
  title: string;
  lyrics: string; // 순수 가사 (상세편집 가사창, 가사 검색용)
  chordText?: string; // 코드 텍스트 창용 (코드와 가사가 마디별로 정렬된 텍스트)
  filename: string;
  filePath?: string; // 처리된 악보 이미지의 상대 경로
  category: string; // '찬송가', 'CCM' 등의 대분류 또는 상세 분류명(찬양, 감사 등)
  code?: string; // 코드 (Key)
  meter?: string; // 박자 (예: 4/4, 6/8)
  rhythm?: string; // 리듬 (예: 16비트 발라드, 8비트 미디엄, 셔플 등)
  bpm?: number;
  performanceMemo?: string; // 연주 메모 (곡의 무드나 코드진행 등)
  instrumentMemo?: string; // 악기 메모 (건반솔로, 중간 합주 등)
  youtubeUrl?: string; // Legacy
  youtubeVideos?: { name: string; url: string; isShared?: boolean }[];
  isManual?: boolean;
  songForm?: string; // 송폼 텍스트 (예: Intro - V1 - C - Bridge - Outro)
  songFormBlocks?: SongFormBlock[]; // 구조화된 송폼 블록 배열
  songFormText?: string; // 송폼 자유 메모 텍스트 (인도자가 자유롭게 기술하는 연주/악기/무드 노트)
  fileSize?: number; // 악보 이미지 실제 바이트 크기 (예: 142500)
}

export interface HymnalState {
  songs: HymnalSong[];
  isLoading: boolean;
  searchQuery: string;
  selectedSongId: string | null;
}

