export interface HymnalSong {
  id: string;
  number: number;
  title: string;
  lyrics: string;
  filename: string;
  filePath?: string; // 처리된 악보 이미지의 상대 경로
  category: string; // '찬송가', 'CCM' 등의 대분류 또는 상세 분류명(찬양, 감사 등)
  code?: string;
  meter?: string;
  youtubeUrl?: string; // Legacy
  youtubeVideos?: { name: string; url: string; isShared?: boolean }[];
  isManual?: boolean;
  songForm?: string; // 송폼 (예: Intro - V1 - C - Bridge - Outro)
}

export interface HymnalState {
  songs: HymnalSong[];
  isLoading: boolean;
  searchQuery: string;
  selectedSongId: string | null;
}
