/**
 * 악보 시각 분석 및 메타데이터 / 가사+코드 추출 AI 서비스
 * Google Gemini Multimodal Vision API 기반
 */

export interface ScoreSegment {
  chord: string;
  lyric: string;
}

export interface ScoreLine {
  fullLyrics: string;
  chordLineText: string;
  segments: ScoreSegment[];
}

export interface ScoreSection {
  sectionName: string;
  lines: ScoreLine[];
}

export interface SongFormAiBlock {
  type: string;        // 예: 'Intro', 'Verse 1', 'Chorus', 'Bridge', 'Outro'
  barCount: number;    // 마디 수 (예: 4, 8)
  repeatCount?: number;// 반복 횟수 (기본 1)
  chords?: string;     // 해당 파트의 핵심 코드 진행 (예: "C - G/B - Am7 - G")
  memo?: string;       // 해당 파트의 연주 팁 및 무드 (예: "피아노 아르페지오로 잔잔하게 시작")
}

export interface ScoreAnalysisResult {
  isSheetMusic: boolean;
  notSheetMusicReason?: string;
  title: string;
  firstLyric: string;
  artistOrComposer: string;
  timeSignature: string;             // 박자 (예: 4/4)
  tempo: string;                     // 템포
  keySignature: string;              // 원곡 조성 (예: A Major)
  chordProgressionSummary: string;  // 주요 코드 진행
  theme: string;                     // 주제/장르
  structure: string;                 // 송폼 구조 (예: Verse -> Chorus)
  sections: ScoreSection[];          // 섹션별 코드/가사 싱크
  songFormBlocks?: SongFormAiBlock[];// 파트별 코드진행 및 연주팁이 포함된 구조화된 송폼 카드 배열
  musicalNotes?: string;             // 연주 팁
}

// 커스텀 API 키 관리
const STORAGE_KEY_CUSTOM_GEMINI = 'nations_gemini_api_key';

/**
 * 활성 Gemini API 키 가져오기 (커스텀 설정 키 > 환경변수)
 * 보안 표준: 클라이언트 코드에 기본 키를 하드코딩하지 않으며, 기본 호출은 서버리스 프록시를 통해 안전하게 수행합니다.
 */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_GEMINI);
    if (saved && saved.trim()) return saved.trim();
  }
  const envKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_GEMINI_API_KEY as string) : '';
  if (envKey && envKey.trim()) return envKey.trim();
  return '';
}

/**
 * Gemini API 키 저장
 */
export function setGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (!key || !key.trim()) {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_GEMINI);
  } else {
    localStorage.setItem(STORAGE_KEY_CUSTOM_GEMINI, key.trim());
  }
}

/**
 * API 키 형식 검증 (구형 AIzaSy... 및 신형 AQ.Ab8... 모두 지원)
 */
export function isValidGeminiKeyFormat(key: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  // 구형 Google Cloud 키 (AIzaSy...) 또는 신형 AI Studio 키 (AQ.Ab8...)
  return trimmed.startsWith('AIzaSy') || trimmed.startsWith('AQ.');
}

/**
 * 현업 프로덕션에서 활성화된 Gemini Vision 모델 체인 (nations.sermon과 동일 규격)
 */
const GEMINI_VISION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite'
];

const SCORE_ANALYSIS_SYSTEM_PROMPT = `당신은 최고 수준의 시각 악보 분석가 및 음악 이론/코드 싱크 전문가(Music Score & Chord Alignment Expert)입니다.
업로드된 악보 이미지를 시각적으로 정밀하게 판독하여, 정형화된 JSON 데이터로 응답하세요.

---

### [규칙 1: 악보 여부 판별 (Non-Sheet Detection)]
1. 이미지가 실제 '음악 악보'(오선지, 음표, 코드 기호, 마디선, 리드시트 등)인지 먼저 검증하세요.
2. 악보가 아닌 사진(동물, 풍경, 인물, 음식, 일반 문서 등)일 경우:
   - "isSheetMusic": false
   - "notSheetMusicReason": 사진에 보이는 피사체(예: '고양이 사진', '도시 풍경')를 명시하고, 악보 기호가 없어 분석할 수 없음을 정중한 한국어로 작성하세요.
   - 나머지 필드는 빈 값으로 둡니다.

---

### [규칙 2: 기본 음악 메타데이터 추출 (간결성 원칙)]
악보인 경우 반드시 아래 규칙을 엄격히 지켜 추출하세요. (사설, 영문 번역, 해설 금지)
1. "title" (곡 제목):
   - 영문 번역이나 괄호 부연설명 없이, 10자 내외의 '순수 공식 곡명'만 출력하세요. (예: "다시 한 번", "주가 보이신 생명의 길", "아리랑")
   - 만약 상단 중앙에 제목이 없고 좌측/우측에 작곡가 이름만 적힌 리드시트의 경우, 첫 소절 가사나 널리 알려진 찬양 제목을 찾아 제목으로 지정하세요. 작곡가 이름을 제목에 넣지 마세요.
2. "firstLyric" (첫가사):
   - 곡을 바로 식별할 수 있는 첫 소절 가사 1줄
3. "artistOrComposer" (작곡/작사):
   - 작곡가/작사가 이름만 간결하게 (예: "정신호", "박정은")
4. "timeSignature" (박자): 박자표 (예: "4/4", "3/4", "6/8")
5. "tempo" (템포): 악보 상의 빠르기 표기 (예: "Moderato (약 72 BPM)", "♩=68", "Andante con moto")
6. "keySignature" (원곡조성):
   - 악보 맨 앞의 조표(올림표 # 또는 내림표 b 개수)와 첫 코드/종지 코드를 음악 이론에 따라 정확하게 대조하여 조성(Key)을 판별하세요.
   - [조표 판별 필수 공식]:
     * # 1개 = G (또는 Em)
     * # 2개 = D (또는 Bm)
     * # 3개 = A (또는 F#m)
     * # 4개(F#, C#, G#, D#) = 반드시 'E' (또는 C#m) 입니다. 끝의 샵 줄 위치(G#)를 키로 오인하지 마세요!
     * # 5개 = B (또는 G#m)
     * b 1개 = F (또는 Dm), b 2개 = Bb (또는 Gm), b 3개 = Eb (또는 Cm)
   - 시작 코드나 후렴 코드가 E이면 무조건 "E" 또는 "E Major"로 출력하세요.
7. "chordProgressionSummary" (주요진행): 곡을 대표하는 핵심 코드 진행 (예: "A - E/C# - D - A7/C# - Bm - E - A")
8. "theme" (분류/키워드):
   - 긴 서술형 문장(예: "~를 찬양하는 경배와 찬양")이 아닌, 핵심 키워드/단어 2~4개만 쉼표(,)로 나열하세요. (예: "친밀감, 은혜, 찬양", "감사, 결단, 헌신", "위로, 평안, 기도")
9. "structure" (곡 구성): 전체 송폼 (예: "Verse -> Chorus", "Intro -> V1 -> C -> Outro")

---

### [규칙 3: 박자 싱크를 위한 음절 하이픈('-') 및 마디 호흡 정제]
1. 펜글씨, 흘림체, 손글씨 악보의 음표 아래 적힌 한글 자모를 문맥과 함께 정밀 해독하세요.
2. **코드와 가사의 수직 싱크를 맞추기 위한 핵심 지침**:
   - 악보에서 한 마디 안의 음표 박자가 길거나(2분음표, 온음표, 붙임줄 등), 쉼표가 있거나, 가사 글자 수가 적어 코드가 뒤로 밀릴 때:
   - 가사 음절 사이에 **'-'**(하이픈)이나 음절 간격을 적절히 넣어(예: '나-가리', '예 - - - 수', '오 - 주님', '내가- 정금 같 - 이 - 나아오 리 라') 각 박자의 연주 길이를 표현하고, 코드가 해당 음절 바로 위에 1:1 수직으로 정확히 일치하도록 맞추세요.
   - 단, 박자 연장이 없는 일반적인 음절은 자연스러운 한국어 어절로 띄어쓰기를 유지하세요.

---

### [규칙 4: 가사 문장 호흡 및 줄바꿈 원칙]
1. 악보 마디 끝에 걸친 다음 문장의 시작 단어를 줄 끝에 어색하게 방치하지 마세요.
2. 실제 가창자가 숨을 쉬고 노래하는 자연스러운 문장/호흡 단위로 각 줄(Line)을 분할하세요.

---

### [규칙 5: 가사 위 코드 싱크 뷰 및 텍스트 뷰 구현 데이터 (핵심)]
가사와 코드의 싱크는 아래 구조로 한 줄도 빠짐없이 완벽하게 매핑하세요:
- "sections": 섹션 배열 (예: [Verse], [Chorus])
  * "sectionName": 섹션명 (예: "[Verse]", "[Chorus]")
  * "lines": 해당 섹션의 가사 라인 배열
    - "fullLyrics": 박자 연장 하이픈('-')이 반영된 악보 기준 가사 1줄 (예: "주가 보이신 생명의 길 나 주님과 함께", "상한 맘을 드리며 주님 앞에 나-가리")
    - "chordLineText": CJK 모노스페이스(한글 1글자 = 공백 2칸) 기준, 아랫줄의 해당 가사 음절 바로 위에 코드가 수직으로 칼같이 일치하도록 공백을 맞춘 코드 줄 문자열
    - "segments": 어절/단어 단위의 정밀 싱크 배열.
      각 segment는 {"chord": "해당 단어 바로 위에 시작하는 코드 기호 (분수코드 포함, 없으면 빈 문자열)", "lyric": "해당 단어/어절"}

---

### [규칙 6: 찬양팀 실연용 전문적이고 풍부한 송폼(Song Form) 및 연주 가이드라인 (핵심)]
악보에 적힌 기본 단락을 넘어, 실제 예배 찬양 및 현대 워십 밴드(마커스, 어노인팅, Hillsong 등)의 실연에서 사용하는 **기승전결이 살아있는 풍부하고 전문적인 "songFormBlocks" 배열**을 반드시 구성하세요:
1. **필수 포함 파트 구성 원칙**:
   - **Intro (전주)**: 4~8마디. 곡의 조성(Key)과 템포를 여는 도입부. 대표 코드 진행과 연주 악기(피아노 아르페지오, 어쿠스틱 기타 등) 명시.
   - **Verse 1 / Verse 2 (절)**: 8~16마디. 잔잔한 고백과 멜로디.
   - **Pre-Chorus (상승부)**: 후렴으로 넘어가기 전 긴장감과 리듬을 고조시키는 4~8마디 파트 (해당 곡에 적합한 경우 반드시 분리 배치).
   - **Chorus (후렴)**: 8~16마디. 곡의 메인 테마와 풀밴드 참여.
   - **Interlude (간주)**: Verse와 Verse 사이 또는 Chorus 후 다음 파트로 넘어갈 때, 음악적 호흡과 악기 솔로/테마 리프를 위한 2~4마디 또는 8마디 간주를 반드시 배치!
   - **Bridge (브릿지)**: 새로운 화성과 멜로디로 클라이맥스를 준비하는 8~16마디 빌드업 파트.
   - **Climax / Chorus 2 (후렴 반복 & 절정)**: 전 악기 최고조(ff) 합주, 심벌 오픈, 에너지 폭발.
   - **Tag / Outro (엔딩 태그 & 후주)**: 마지막 핵심 가사 반복(Tag) 또는 잔잔하게 여운을 남기는 4~8마디 아웃트로.
2. **각 블록 객체 필수 속성**:
   - "type": 파트명 (예: "Intro", "Verse 1", "Pre-Chorus", "Chorus 1", "Interlude", "Verse 2", "Bridge", "Chorus 2", "Tag & Outro")
   - "barCount": 해당 파트의 마디 수 (숫자, 예: 4, 8, 16)
   - "repeatCount": 반복 횟수 (숫자, 기본 1)
   - "chords": 해당 파트의 대표 코드 진행 문자열 (예: "A - E/G# - F#m7 - D", "D - E/D - C#m7 - F#m7")
   - "memo": 건반, 어쿠스틱/일렉 기타, 베이스, 드럼, 보컬 각 파트를 위한 전문 연주 팁 및 다이내믹 가이드 1~2줄 (전문 음악 용어 활용)

반드시 순수 JSON 형식으로만 응답하세요. 마크다운 앞뒤 사설을 넣지 마세요.`;

/**
 * Image 소스를 Base64 Data URL 또는 바이너리로 정규화
 */
async function toBase64Image(source: string | Blob): Promise<{ mimeType: string; base64Data: string }> {
  let blob: Blob;

  if (source instanceof Blob) {
    blob = source;
  } else if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      const parts = source.split(',');
      const mimeMatch = source.match(/data:(.*?);base64/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      return { mimeType, base64Data: parts[1] };
    }
    // blob: url 또는 http url
    const res = await fetch(source);
    blob = await res.blob();
  } else {
    throw new Error('유효하지 않은 이미지 소스입니다.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const parts = dataUrl.split(',');
      const mimeMatch = dataUrl.match(/data:(.*?);base64/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      resolve({ mimeType, base64Data: parts[1] });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 동아시아 문자 폭 계산 (한글 완성형/자모/한자는 2, 영문/숫자/공백/하이픈은 1)
 */
export function getEastAsianCharWidth(char: string): number {
  const code = char.charCodeAt(0);
  if (
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 완성형
    (code >= 0x1100 && code <= 0x11ff) || // 한글 자모
    (code >= 0x3130 && code <= 0x318f) || // 한글 호환 자모
    (code >= 0x4e00 && code <= 0x9fff) || // 한자
    (code >= 0xff01 && code <= 0xff60)    // 전각 기호
  ) {
    return 2;
  }
  return 1;
}

export function getEastAsianStringWidth(str: string): number {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    w += getEastAsianCharWidth(str[i]);
  }
  return w;
}

/**
 * segments 배열을 바탕으로 모노스페이스 상에서 코드와 가사가 칼같이 1:1 수직 정렬되는 텍스트 생성
 */
export function buildSyncedLineFromSegments(segments: ScoreSegment[]): { chordLine: string; lyricLine: string } {
  if (!segments || segments.length === 0) return { chordLine: '', lyricLine: '' };

  let chordLine = '';
  let lyricLine = '';

  for (const seg of segments) {
    const chord = (seg.chord || '').trim();
    const lyric = seg.lyric || '';

    const chordW = getEastAsianStringWidth(chord);
    const lyricW = getEastAsianStringWidth(lyric);

    // 해당 세그먼트가 차지할 공통 폭: 코드와 가사 중 더 긴 폭 + 마진 1칸
    const targetW = Math.max(chordW, lyricW) + (chord ? 1 : 0);

    chordLine += chord + ' '.repeat(Math.max(0, targetW - chordW));
    lyricLine += lyric + ' '.repeat(Math.max(0, targetW - lyricW));
  }

  return {
    chordLine: chordLine.trimEnd(),
    lyricLine: lyricLine.trimEnd()
  };
}

/**
 * 섹션 배열을 모노스페이스 코드+가사 텍스트 포맷으로 변환
 */
export function formatScoreSectionsToText(sections: ScoreSection[]): string {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return '';
  
  return sections.map(section => {
    const linesText = (section.lines || []).map(line => {
      // 1. segments가 있으면 수학적 1:1 수직 정렬 엔진으로 완벽하게 빌드
      if (line.segments && Array.isArray(line.segments) && line.segments.length > 0) {
        const { chordLine, lyricLine } = buildSyncedLineFromSegments(line.segments);
        if (chordLine) {
          return `${chordLine}\n${lyricLine}`;
        }
        return lyricLine;
      }

      // 2. segments가 없으면 chordLineText와 fullLyrics 사용
      if (line.chordLineText && line.chordLineText.trim().length > 0) {
        return `${line.chordLineText}\n${line.fullLyrics}`;
      }
      return line.fullLyrics;
    }).join('\n');

    const secHeader = section.sectionName ? section.sectionName : '';
    return secHeader ? `${secHeader}\n${linesText}` : linesText;
  }).join('\n\n');
}

/**
 * 직접 Gemini API 호출 실행 (최신 프롬프트 즉시 반영)
 */
async function executeGeminiVisionAnalysis(
  mimeType: string,
  base64Data: string,
  apiKey: string
): Promise<ScoreAnalysisResult> {
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${SCORE_ANALYSIS_SYSTEM_PROMPT}\n\n위 규칙에 따라 첨부된 악보 이미지를 정밀 분석하여 JSON으로 출력하세요.`
          },
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  let lastError: any = null;

  for (const modelName of GEMINI_VISION_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson: any = null;
        try { errorJson = JSON.parse(errorText); } catch {}
        
        const message = errorJson?.error?.message || errorText;
        if (response.status === 402) {
          throw new Error('Gemini API 크레딧이 소진되었습니다.');
        }
        if (response.status === 429) {
          throw new Error('Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
        }
        
        lastError = new Error(`[${modelName}] API Error ${response.status}: ${message}`);
        console.warn(`[aiScoreService] ${modelName} 호출 실패 -> 다음 모델 시도:`, message);
        continue;
      }

      const resData = await response.json();
      const candidate = resData?.candidates?.[0];
      const rawText = candidate?.content?.parts?.[0]?.text;

      if (!rawText) {
        lastError = new Error(`[${modelName}] 응답 텍스트가 비어 있습니다.`);
        continue;
      }

      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      const parsed: ScoreAnalysisResult = JSON.parse(cleaned);
      return parsed;
    } catch (err: any) {
      if (err.message && (err.message.includes('크레딧이 소진') || err.message.includes('요청 한도'))) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini 직접 호출 처리에 실패했습니다.');
}

/**
 * 악보 이미지 AI 분석 실행 (업계 표준 보안: 서버리스 안전 프록시 기본 호출 -> 커스텀 키 설정 시 직접 호출 지원)
 */
export async function analyzeScoreImage(
  imageSource: string | Blob, 
  customApiKey?: string
): Promise<ScoreAnalysisResult> {
  // 1. 이미지를 Base64 데이터로 변환
  const { mimeType, base64Data } = await toBase64Image(imageSource);

  // 2. 사용자가 관리자 화면에서 명시적으로 등록한 개인 커스텀 키가 있는 경우 우선 직접 호출 시도
  const userApiKey = (customApiKey && customApiKey.trim()) || getGeminiApiKey();
  if (userApiKey) {
    try {
      return await executeGeminiVisionAnalysis(mimeType, base64Data, userApiKey);
    } catch (directErr: any) {
      console.warn('[aiScoreService] Custom API key direct call failed, falling back to serverless:', directErr?.message || directErr);
    }
  }

  // 3. 업계 표준 보안: 서버리스 안전 프록시 함수(analyzeScoreCallable) 호출 (API 키 클라이언트 노출 0%)
  try {
    const { functions } = await import('./firebaseConfig');
    const { httpsCallable } = await import('firebase/functions');
    const analyzeCallable = httpsCallable<any, { success: boolean; result: ScoreAnalysisResult }>(
      functions,
      'analyzeScoreCallable'
    );
    const serverRes = await analyzeCallable({
      mimeType: mimeType || 'image/jpeg',
      base64Data,
      customApiKey: userApiKey || undefined
    });

    if (serverRes?.data?.success && serverRes.data.result) {
      console.log('[aiScoreService] Serverless analysis completed securely.');
      return serverRes.data.result;
    }
  } catch (serverErr: any) {
    console.error('[aiScoreService] Serverless callable error:', serverErr?.message || serverErr);
    throw new Error(serverErr?.message || '악보 분석 서버리스 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  throw new Error('악보 분석 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
}

