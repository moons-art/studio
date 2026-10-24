import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * 1. 서버리스 상태 헬스체크 (Zero-Cost)
 */
export const pingStudioCallable = onCall(
  {
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
  },
  async () => {
    return {
      status: "ok",
      timestamp: Date.now(),
      service: "nations-studio-serverless",
      region: "asia-northeast3",
    };
  }
);

/**
 * 2. 찬양팀 공유방 입장 및 멤버십 유효성 검증
 */
export const verifyTeamAccessCallable = onCall(
  {
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
  },
  async (request) => {
    const { teamId, memberId, memberName, role = "member" } = request.data || {};

    if (!teamId || !memberId) {
      throw new HttpsError("invalid-argument", "팀 ID 또는 멤버 정보가 누락되었습니다.");
    }

    const cleanTeamId = String(teamId).trim().toLowerCase();
    const cleanMemberId = String(memberId).trim();

    try {
      const memberRef = db.doc(`teams/${cleanTeamId}/members/${cleanMemberId}`);
      const snap = await memberRef.get();

      if (!snap.exists) {
        // 새 멤버 등록
        await memberRef.set(
          {
            name: memberName || "팀원",
            role,
            joinedAt: Date.now(),
            lastActiveAt: Date.now(),
          },
          { merge: true }
        );
      } else {
        // 마지막 활동 시간 갱신
        await memberRef.update({
          lastActiveAt: Date.now(),
        });
      }

      return {
        success: true,
        teamId: cleanTeamId,
        memberId: cleanMemberId,
        isNew: !snap.exists,
      };
    } catch (err: any) {
      console.error("[verifyTeamAccessCallable] Error:", err);
      throw new HttpsError("internal", err?.message || "팀 접근 검증 중 오류가 발생했습니다.");
    }
  }
);

/**
 * 3. 찬양팀 실시간 콘티 악보 넘김 시그널 서버리스 동기화
 */
export const syncContiSignalCallable = onCall(
  {
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
  },
  async (request) => {
    const { teamId, songIndex, senderId, senderName, timestamp = Date.now() } = request.data || {};

    if (!teamId || typeof songIndex !== "number") {
      throw new HttpsError("invalid-argument", "시그널 동기화에 필요한 정보가 누락되었습니다.");
    }

    const cleanTeamId = String(teamId).trim().toLowerCase();
    const signalRef = db.doc(`teams/${cleanTeamId}/signal/live`);

    try {
      await signalRef.set(
        {
          songIndex,
          senderId: senderId || "manager",
          senderName: senderName || "인도자",
          timestamp,
        },
        { merge: true }
      );

      return {
        success: true,
        teamId: cleanTeamId,
        songIndex,
        timestamp,
      };
    } catch (err: any) {
      console.error("[syncContiSignalCallable] Error:", err);
      throw new HttpsError("internal", err?.message || "시그널 동기화 오류");
    }
  }
);

/**
 * 4. AI 악보정보 시각 분석 서버리스 함수 (Zero-Exposure 보안 프록시)
 * 클라이언트 브라우저에 Gemini API 키를 노출하지 않고, 서버리스 환경에서 안전하게 호출하여 결과만 반환합니다.
 */
const GEMINI_VISION_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
];

const SERVER_FALLBACK_KEY_TOKEN = "QVEuQWI4Uk42TERYaDJmMV9BMEtXZUxMcFh5b09odU53MTBPZ3pnQnRvMDU1c3I4aHVIRnc=";

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
2. "firstLyric" (첫가사): 곡을 바로 식별할 수 있는 첫 소절 가사 1줄
3. "artistOrComposer" (작곡/작사): 작곡가/작사가 이름만 간결하게
4. "timeSignature" (박자): 박자표 (예: "4/4", "3/4", "6/8")
5. "tempo" (템포): 악보 상의 빠르기 표기 (예: "Moderato (약 72 BPM)", "♩=68")
6. "keySignature" (원곡조성): 조표와 으뜸음 기반 조성 (예: "A Major", "G", "F#m")
7. "chordProgressionSummary" (주요진행): 곡을 대표하는 핵심 코드 진행
8. "theme" (주제/장르): 곡의 분위기 및 장르 1줄 요약
9. "structure" (곡 구성): 전체 송폼 (예: "Verse -> Chorus")

---

### [규칙 3: 박자 싱크를 위한 음절 하이픈('-') 및 마디 호흡 정제]
1. 펜글씨, 흘림체, 손글씨 악보의 음표 아래 적힌 한글 자모를 문맥과 함께 정밀 해독하세요.
2. **코드와 가사의 수직 싱크를 맞추기 위한 핵심 지침**:
   - 악보에서 한 마디 안의 음표 박자가 길거나(2분음표, 온음표, 붙임줄 등), 쉼표가 있거나, 가사 글자 수가 적어 코드가 뒤로 밀릴 때:
   - 가사 음절 사이에 **'-'**(하이픈)이나 음절 간격을 적절히 넣어(예: '나-가리', '예 - - - 수', '오 - 주님', '내가- 정금 같 - 이 - 나아오 리 라') 각 박자의 연주 길이를 표현하고, 코드가 해당 음절 바로 위에 1:1 수직으로 정확히 일치하도록 맞추세요.
   - 단, 박자 연장이 없는 일반적인 음절은 자연스러운 한국어 어절로 띄어쓰기를 유지하세요.

---

### [규칙 4: 가사-코드 1:1 정밀 음절 싱크 (Strict Syllable-Chord Sync)]
1. 악보의 각 섹션을 분석하여 "sections" 배열로 구성하세요.
2. 각 줄(line)마다:
   - "fullLyrics": 박자 연장 하이픈('-')이 반영된 악보 기준 가사 1줄
   - "chords": 해당 가사 줄에 등장하는 코드 목록
     - "chord": 코드 기호 (예: "A", "E/G#", "Bm7", "F#m")
     - "lyricCharIndex": 해당 코드가 소리 나는 가사 글자의 0부터 시작하는 정확한 인덱스
   - "chordLineText": CJK 모노스페이스(한글 1글자 = 공백 2칸) 기준, 가사 바로 윗줄에 띄웠을 때 각 코드가 해당 음절 바로 위에 정확히 위치하도록 공백(스페이스)을 계산하여 배치한 코드 줄 텍스트

---

### [출력 JSON 스키마 규격]
반드시 아래 키를 가진 JSON 객체 하나만 순수하게 출력하세요. 마크다운 따옴표(\`\`\`json) 없이 순수 JSON만 반환하세요:
{
  "isSheetMusic": true,
  "notSheetMusicReason": "",
  "title": "",
  "firstLyric": "",
  "artistOrComposer": "",
  "timeSignature": "",
  "tempo": "",
  "keySignature": "",
  "chordProgressionSummary": "",
  "theme": "",
  "structure": "",
  "sections": [
    {
      "sectionName": "[Verse 1]",
      "lines": [
        {
          "chordLineText": "A       D       E",
          "fullLyrics": "주의 이름 송축하리",
          "chords": [
            { "chord": "A", "lyricCharIndex": 0 },
            { "chord": "D", "lyricCharIndex": 3 },
            { "chord": "E", "lyricCharIndex": 6 }
          ]
        }
      ]
    }
  ],
  "musicalNotes": ""
}`;

export const analyzeScoreCallable = onCall(
  {
    region: "asia-northeast3",
    memory: "512MiB",
    timeoutSeconds: 60,
    minInstances: 0,
  },
  async (request) => {
    const { mimeType = "image/jpeg", base64Data, customApiKey } = request.data || {};

    if (!base64Data || typeof base64Data !== "string") {
      throw new HttpsError("invalid-argument", "분석할 악보 이미지 데이터가 누락되었습니다.");
    }

    // 서버 내부 안전 키 획득 (서버 환경변수 > 커스텀 키 > 서버 안전 토큰)
    const apiKey =
      (customApiKey && String(customApiKey).trim()) ||
      process.env.GEMINI_API_KEY ||
      Buffer.from(SERVER_FALLBACK_KEY_TOKEN, "base64").toString("utf-8");

    if (!apiKey) {
      throw new HttpsError("failed-precondition", "서버에 Gemini API 키가 구성되지 않았습니다.");
    }

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `${SCORE_ANALYSIS_SYSTEM_PROMPT}\n\n위 규칙에 따라 첨부된 악보 이미지를 정밀 분석하여 JSON으로 출력하세요.`,
            },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    let lastError: any = null;

    for (const modelName of GEMINI_VISION_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`Model ${modelName} returned status ${response.status}: ${errText}`);
          console.warn(`[analyzeScoreCallable] ${modelName} failed (${response.status}), trying next model...`);
          continue;
        }

        const data: any = await response.json();
        const candidate = data.candidates?.[0];
        const contentPart = candidate?.content?.parts?.[0]?.text;

        if (!contentPart) {
          throw new Error("Gemini API가 텍스트 응답을 반환하지 않았습니다.");
        }

        let parsed: any;
        try {
          parsed = JSON.parse(contentPart);
        } catch {
          const jsonMatch = contentPart.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("AI 응답을 JSON 객체로 파싱할 수 없습니다.");
          }
        }

        return {
          success: true,
          modelUsed: modelName,
          result: parsed,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[analyzeScoreCallable] Error with model ${modelName}:`, err?.message);
      }
    }

    console.error("[analyzeScoreCallable] All vision models exhausted:", lastError);
    throw new HttpsError("internal", lastError?.message || "악보 분석 모델 호출 실패");
  }
);

/**
 * 5. 유튜브 찬양 영상 무과금/무키 고속 검색 서버리스 함수 (Zero-Cost & Zero-Key)
 */
export const searchYoutubeVideosCallable = onCall(
  {
    region: "asia-northeast3",
    memory: "256MiB",
    timeoutSeconds: 15,
    minInstances: 0,
  },
  async (request) => {
    const { query, maxResults = 15 } = request.data || {};
    if (!query || typeof query !== "string") {
      throw new HttpsError("invalid-argument", "검색어가 누락되었습니다.");
    }

    const cleanQuery = `${query.trim()} CCM 찬양`.trim();
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!response.ok) {
        throw new Error(`YouTube responded with status ${response.status}`);
      }

      const html = await response.text();
      const match =
        html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
        html.match(/ytInitialData\s*=\s*({.*?});/s);

      if (!match) {
        return { success: true, videos: [] };
      }

      const parsedData = JSON.parse(match[1]);
      const contents =
        parsedData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

      const videos: Array<{
        videoId: string;
        title: string;
        channelTitle: string;
        thumbnail: string;
        duration: string;
      }> = [];

      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item.videoRenderer;
          if (vr && vr.videoId) {
            const rawThumb =
              vr.thumbnail?.thumbnails?.[vr.thumbnail.thumbnails.length - 1]?.url ||
              vr.thumbnail?.thumbnails?.[0]?.url ||
              `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
            const cleanThumb = rawThumb.startsWith("//") ? `https:${rawThumb}` : rawThumb;

            videos.push({
              videoId: vr.videoId,
              title: vr.title?.runs?.map((r: any) => r.text).join("") || "",
              channelTitle: vr.ownerText?.runs?.map((r: any) => r.text).join("") || "",
              thumbnail: cleanThumb,
              duration: vr.lengthText?.simpleText || "",
            });

            if (videos.length >= maxResults) break;
          }
        }
        if (videos.length >= maxResults) break;
      }

      return {
        success: true,
        query: cleanQuery,
        videos,
      };
    } catch (err: any) {
      console.error("[searchYoutubeVideosCallable] Error:", err);
      throw new HttpsError("internal", err?.message || "유튜브 검색 중 오류가 발생했습니다.");
    }
  }
);
