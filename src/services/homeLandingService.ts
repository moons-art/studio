/**
 * Real-Time Firebase Sync & LocalStorage Caching Service for Nations Studio Landing Page
 * Connects to Nations Homepage Firebase (nations-ym) to fetch hero video,
 * copywriting, and feature cards with 0ms offline/refresh survival.
 * Synchronizes with Firestore 'site_images/score' and 'site_intro/score'.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';

const homeFirebaseConfig = {
  apiKey: "AIzaSyDLmZfYdJAQu4x2OAYrdP29yOooLXTzHeo",
  authDomain: "nations-ym.firebaseapp.com",
  projectId: "nations-ym",
  storageBucket: "nations-ym.firebasestorage.app",
  messagingSenderId: "949990892606",
  appId: "1:949990892606:web:e225b84491c243c80b1d6f",
};

const HOME_APP_NAME = 'nations-home-app';
let homeAppInstance: any;
try {
  const existingApps = getApps();
  homeAppInstance = existingApps.find(a => a.name === HOME_APP_NAME) || initializeApp(homeFirebaseConfig, HOME_APP_NAME);
} catch (e) {
  homeAppInstance = initializeApp(homeFirebaseConfig, HOME_APP_NAME);
}

export const homeDb = getFirestore(homeAppInstance);

export interface CorePoint {
  title: string;
  desc: string;
  image?: string | null;
  altText?: string;
  gradientClass?: string;
}

export interface FaqItem {
  q: string;
  preview: string;
  a: string;
}

export interface LandingData {
  heroVideoUrl: string;
  heroTopText: string;
  heroPhrases: string[];
  questionHeading: string;
  questionText: string;
  mainHeadingLine1: string;
  mainHeadingLine2: string;
  subHeadingLine1: string;
  subHeadingLine2: string;
  diffTag: string;
  diffHeading: string;
  diffDesc: string;
  diffBadges: string[];
  loginCardBadge: string;
  loginCardSubtitle: string;
  corePoints: CorePoint[];
  faqs: FaqItem[];
}

/**
 * 네이션스 홈페이지(thenations.kr / nations.home)의 스튜디오(score) 페이지 실제 소스와 100% 일치하는 기본 데이터
 */
export const DEFAULT_STUDIO_LANDING_DATA: LandingData = {
  heroVideoUrl: '/score-hero-video-1.mp4',
  heroTopText: '찬양 준비와 예배에만 집중하세요',
  heroPhrases: [
    '예배준비 네이션스가 해결해 드릴게요',
    '교회를 돕는 모든 것 네이션스',
  ],
  questionHeading: '예배와 찬양 준비로 분주한 사역자의 고민',
  questionText:
    '매주 찬양팀 악보 복사와 콘티 정리에 드는 시간을 줄일 순 없을까? 찬양 인도자부터 반주자, 싱어까지 각자의 파트보와 송폼을 실시간으로 공유할 수 없을까? 조옮김(Key 변환) 악보를 1초 만에 만들어 연습할 순 없을까? 소그룹과 금요기도회에서도 태블릿 하나로 찬양할 순 없을까?',
  mainHeadingLine1: '더 깊이 예배하고,',
  mainHeadingLine2: '더 편리하게 준비하세요',
  subHeadingLine1: '악보준비 번거롭지 않습니다.',
  subHeadingLine2: '편하고 쉽게 관리해요',
  diffTag: '찬양사역을 이해하는 앱',
  diffHeading:
    '찬양 사역자와 반주자의 호흡, 기도의 사모함과 잔잔한 긴장감까지 속속들이 이해하는 경험많은 예배전문가가 예배의 언어로 만든 앱입니다.',
  diffDesc: '찬양 준비의 모든 번거로움을 덜어내고 예배의 감격과 본질에 온전히 집중하도록 돕습니다.',
  diffBadges: ['클라우드 안전 보관', '실시간 찬양팀 공유', '다양한 악보뷰 제공'],
  loginCardBadge: '무료로 이용하기',
  loginCardSubtitle: '지금 무료로 시작하기',
  corePoints: [
    {
      title: '매번 반복하는 작업에서 벗어나세요',
      desc: '매번 반복되는 악보찾기, 복잡한 편집과 종이 출력의 번거로움에서 벗어나세요. 악보라이브러리, 악보편집, 악보출력, 악보뷰어까지 경험많은 예배전문가가 예배의 언어로 만들었습니다.',
      image: null,
      altText: '송폼 자동 정리 콘티 편집',
      gradientClass: 'bg-gradient-to-br from-[#EAE6F5] via-[#E4E8F7] to-[#D5DCF5]',
    },
    {
      title: '찬양팀 페이지로 함께 공유해요.',
      desc: '기도로 채워진 콘티와 송폼, 카피곡 유튜브 영상이 찬양팀에게 실시간으로 동기화됩니다. 콘티와 송품은 라이브러리에 관리되고 팀원간의 체팅과 소통이 원할해 집니다.',
      image: null,
      altText: '찬양팀 실시간 동기화 마스터뷰',
      gradientClass: 'bg-gradient-to-br from-[#E3F5EC] via-[#E8F3EE] to-[#D6EBE0]',
    },
    {
      title: '누구나 악보를 볼수있어요.',
      desc: '찬양 인도자용, 연주자용, 회중용 악보뷰를 제공합니다. 링크 하나로 누구나 오늘 예배의 전체악보를 볼수 있습니다.',
      image: null,
      altText: '스마트 조옮김 키 변환',
      gradientClass: 'bg-gradient-to-br from-[#FFF3E6] via-[#FCEEE2] to-[#F7DFCD]',
    },
  ],
  faqs: [
    {
      q: '가입 및 이용은 무료인가요?',
      preview: '네 무료로 가입하여도 기본 기능을 충분히 이용하실 수 있습니다.',
      a: '유료기능은 크레딧을 구매하여 사용한 만큼 차감하는 구조입니다. 심혈을 기울여 만든 고급기능을 유료로 결제하여 차원이 다른 편리함을 경험해 보세요.',
    },
    {
      q: '악보와 콘티는 어디서나 볼수 있나요?',
      preview: "네이션스의 모든 솔루션은 '현장 중심'으로 설계됩니다.",
      a: '네이션스 악보의 모든 데이터는 안전하게 클라우드에 저장되어 전세계 어디에서든 접속이 가능합니다. 또한 찬양팀 플랫폼, 회중용 플랫폼이 따로 제공되어 모든 기기에서 접속이 가능합니다.',
    },
    {
      q: '악보는 어떻게 구할수 있나요?',
      preview: '네이션스 악보앱은 악보를 판매하지 않습니다.',
      a: '사용자 개인이 정상적으로 구입한 악보를 관리하는 라이브러리와 뷰어를 제공합니다.',
    },
    {
      q: '찬양팀과 어떻게 공유하나요?',
      preview: '매주 악보와 송품을 보내던 번거로움은 잊으세요.',
      a: '네이션스 악보앱은 찬양인도자가 앱에 저장한 콘티와 송폼, 카피를 위한 유튜브 영상까지 한번에 공유할 수 있습니다. 찬양팀 전용 페이지를 통해 실시간 송폼 수정과 소통, 교제가 가능합니다.',
    },
  ],
};

const UPDATE_EVENT = 'nations-studio-landing-data-updated';

const memoryCache: Record<string, LandingData> = {
  score: { ...DEFAULT_STUDIO_LANDING_DATA },
};

function loadFromLocalStorage(pageKey = 'score') {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = localStorage.getItem(`nations_landing_${pageKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache[pageKey] = {
        ...DEFAULT_STUDIO_LANDING_DATA,
        ...parsed,
        corePoints: DEFAULT_STUDIO_LANDING_DATA.corePoints.map((cp, idx) => ({
          ...cp,
          ...(parsed.corePoints?.[idx] || {}),
        })),
      };
    }

    // 개별 이미지 캐시 확인 (홈페이지에서 'nations_img_score_0' 형식으로 저장)
    for (let i = 0; i < 3; i++) {
      const imgKey = `nations_img_${pageKey}_${i}`;
      const imgVal = localStorage.getItem(imgKey);
      if (imgVal && memoryCache[pageKey].corePoints[i]) {
        if (!memoryCache[pageKey].corePoints[i].image) {
          memoryCache[pageKey].corePoints[i].image = imgVal;
        }
      }
    }
  } catch (err) {
    console.warn(`[homeLandingService] LocalStorage load error for ${pageKey}:`, err);
  }
}
loadFromLocalStorage('score');

let listenersInitialized = false;
function initFirestoreLandingSync(pageKey = 'score') {
  if (typeof window === 'undefined') return;

  try {
    // 1. 홈페이지의 'site_images/score' 실시간 구독
    const imgDocRef = doc(homeDb, 'site_images', pageKey);
    onSnapshot(imgDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let changed = false;
        if (data && Array.isArray(data.images)) {
          for (let i = 0; i < 3; i++) {
            const cloudImg = data.images[i] ?? null;
            if (memoryCache[pageKey].corePoints[i].image !== cloudImg) {
              memoryCache[pageKey].corePoints[i].image = cloudImg;
              changed = true;
              try {
                if (cloudImg) {
                  localStorage.setItem(`nations_img_${pageKey}_${i}`, cloudImg);
                } else {
                  localStorage.removeItem(`nations_img_${pageKey}_${i}`);
                }
              } catch (e) {}
            }
          }
        }
        if (changed) {
          saveToLocalStorage(pageKey);
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        }
      }
    }, (err) => {
      console.warn('[homeLandingService] site_images snapshot error:', err);
    });

    // 2. 홈페이지의 'site_intro/score' 실시간 구독 (홈페이지 어드민에서 문구 수정 시 즉시 반영)
    const introDocRef = doc(homeDb, 'site_intro', pageKey);
    onSnapshot(introDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data) {
          memoryCache[pageKey] = {
            ...memoryCache[pageKey],
            heroVideoUrl: data.heroVideoUrl || memoryCache[pageKey].heroVideoUrl,
            heroTopText: data.heroTopText || memoryCache[pageKey].heroTopText,
            heroPhrases: data.heroPhrases || memoryCache[pageKey].heroPhrases,
            questionHeading: data.questionHeading || memoryCache[pageKey].questionHeading,
            questionText: data.questionText || memoryCache[pageKey].questionText,
            mainHeadingLine1: data.mainHeadingLine1 || memoryCache[pageKey].mainHeadingLine1,
            mainHeadingLine2: data.mainHeadingLine2 || memoryCache[pageKey].mainHeadingLine2,
            subHeadingLine1: data.subHeadingLine1 || memoryCache[pageKey].subHeadingLine1,
            subHeadingLine2: data.subHeadingLine2 || memoryCache[pageKey].subHeadingLine2,
            corePoints: memoryCache[pageKey].corePoints.map((cp, idx) => ({
              ...cp,
              title: data.corePoints?.[idx]?.title || cp.title,
              desc: data.corePoints?.[idx]?.desc || cp.desc,
              image: data.corePoints?.[idx]?.image || cp.image,
            })),
          };
          saveToLocalStorage(pageKey);
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        }
      }
    }, (err) => {
      console.warn('[homeLandingService] site_intro snapshot error:', err);
    });
  } catch (err) {
    console.warn('[homeLandingService] Firestore subscription failed:', err);
  }
}

function saveToLocalStorage(pageKey: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(`nations_landing_${pageKey}`, JSON.stringify(memoryCache[pageKey]));
  } catch (e) {}
}

if (typeof window !== 'undefined' && !listenersInitialized) {
  listenersInitialized = true;
  initFirestoreLandingSync('score');
}

export function useHomeLandingData(pageKey = 'score'): LandingData {
  const [data, setData] = useState<LandingData>(() => ({
    ...memoryCache[pageKey],
    corePoints: memoryCache[pageKey].corePoints.map(p => ({ ...p })),
  }));

  useEffect(() => {
    const handleUpdate = () => {
      setData({
        ...memoryCache[pageKey],
        corePoints: memoryCache[pageKey].corePoints.map(p => ({ ...p })),
      });
    };

    handleUpdate();
    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [pageKey]);

  return data;
}
