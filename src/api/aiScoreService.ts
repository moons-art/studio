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
  musicalNotes?: string;             // 연주 팁
}

// 기본 API 키 및 커스텀 키 관리
const STORAGE_KEY_CUSTOM_GEMINI = 'nations_gemini_api_key';
const FALLBACK_KEY_TOKEN = 'QVEuQWI4Uk42TERYaDJmMV9BMEtXZUxMcFh5b09odU53MTBPZ3pnQnRvMDU1c3I4aHVIRnc=';

/**
 * 활성 Gemini API 키 가져오기 (커스텀 설정 키 > 환경변수 > 기본 키)
 */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_GEMINI);
    if (saved && saved.trim()) return saved.trim();
  }
  const envKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_GEMINI_API_KEY as string) : '';
  if (envKey && envKey.trim()) return envKey.trim();
  try {
    return typeof atob !== 'undefined' ? atob(FALLBACK_KEY_TOKEN) : '';
  } catch {
    return '';
  }
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
6. "keySignature" (원곡조성): 조표와 으뜸음 기반 조성 (예: "A Major", "G", "F#m")
7. "chordProgressionSummary" (주요진행): 곡을 대표하는 핵심 코드 진행 (예: "A - E/C# - D - A7/C# - Bm - E - A")
8. "theme" (주제/장르): 곡의 분위기 및 장르 1줄 요약 (예: "CCM / 예배 / 결단")
9. "structure" (곡 구성): 전체 송폼 (예: "Verse -> Chorus", "Intro -> V1 -> C -> Outro")

---

### [규칙 3: 손글씨/펜글씨 악보 및 음악 늘임표('-') 정제]
1. 펜글씨, 흘림체, 손글씨 악보의 음표 아래 적힌 한글 자모를 문맥과 함께 정밀 해독하세요.
2. 악보 특성상 음표 길이나 멜리스마 때문에 음절 사이에 들어간 하이픈('-')과 부자연스러운 글자 띄어쓰기는 음악적 기호이므로, 하이픈을 모두 제거하고 일상적인 자연스러운 표준 한국어 문장으로 결합하세요.

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
    - "fullLyrics": 자연스러운 완성형 한국어 가사 1줄
    - "chordLineText": 모노스페이스(고정폭) 폰트에서 가사 윗줄에 표시할 수 있도록, 글자 위치에 공백을 맞춰 배치한 코드 문자열
    - "segments": 어절/단어 단위의 정밀 싱크 배열.
      각 segment는 {"chord": "해당 단어 바로 위에 시작하는 코드 기호 (분수코드 포함, 없으면 빈 문자열)", "lyric": "해당 단어/어절"}

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
 * 섹션 배열을 모노스페이스 코드+가사 텍스트 포맷으로 변환
 */
export function formatScoreSectionsToText(sections: ScoreSection[]): string {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return '';
  
  return sections.map(section => {
    const linesText = (section.lines || []).map(line => {
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
 * 악보 이미지 AI 분석 실행 (Gemini 멀티모달 API 호출)
 */
export async function analyzeScoreImage(
  imageSource: string | Blob, 
  customApiKey?: string
): Promise<ScoreAnalysisResult> {
  const apiKey = (customApiKey && customApiKey.trim()) || getGeminiApiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다.');
  }

  // 1. 이미지를 Base64 데이터로 변환
  const { mimeType, base64Data } = await toBase64Image(imageSource);

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

  // 2. 최신 모델 체인 순차 시도 (sermon 앱의 MAIN_ENGINE_MODELS 규격)
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
        // 크레딧 부족(402) 또는 할당량 초과(429) 등 특정 에러 상세 표기
        if (response.status === 402) {
          throw new Error('Gemini API 크레딧이 소진되었습니다. Google AI Studio 계정의 크레딧 충전을 확인해 주세요.');
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

      // JSON 파싱 (코드블록 방어)
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

  throw lastError || new Error('악보 분석 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
}
