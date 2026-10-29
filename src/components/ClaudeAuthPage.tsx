import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Check,
  CreditCard,
  Send,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Plus,
  Minus,
  Music,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { type User } from 'firebase/auth';
import { auth } from '../api/firebaseConfig';
import { isInAppBrowser, escapeInAppBrowser } from '../utils/inAppBrowser';
import {
  startKakaoLogin,
  startNaverLogin,
  processUniversalPayment,
  requestTossPayment,
  requestTossBillingAuth,
  getRecentLoginProvider,
} from '../utils/socialAuth';

// 동그란 구글 아이콘 버튼용 SVG
const GoogleCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// 동그란 카카오 아이콘 버튼용 SVG
const KakaoCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#191919]" aria-hidden="true">
    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
  </svg>
);

// 동그란 네이버 아이콘 버튼용 SVG
const NaverCircularIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" aria-hidden="true">
    <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
  </svg>
);

// 카카오톡 공식 채널 로고 아이콘
const KakaoChannelIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
  </svg>
);

// 홈페이지(thenations.kr) 공통 모노크롬 유튜브 아이콘
const MonochromeYouTubeIcon = ({ className = 'w-5 h-5 text-current', size = 19 }: { className?: string; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

// 홈페이지 공통 AI 글자 주황색 하이라이트 렌더러
const renderTitleWithAi = (title: string) => {
  if (title.includes('AI')) {
    const parts = title.split('AI');
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && <span className="text-[#FB923C] font-bold">AI</span>}
          </React.Fragment>
        ))}
      </>
    );
  }
  return title;
};

// 푸터 스마트 목회 클라우드 아이콘
const CloudIcon = ({ className = 'w-4.5 h-4.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';
import { useHomeLandingData } from '../services/homeLandingService';

export interface ClaudeAuthPageProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialSection?: 'login' | 'pricing';
  currentUser?: User | null;
  userProfile?: { name: string; email?: string; picture?: string } | null;
}

export const ClaudeAuthPage: React.FC<ClaudeAuthPageProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialSection = 'login',
  currentUser,
  userProfile
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // FAQ 아코디언 상태
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // 각 플랜 카드별 선택된 결제 주기 ('monthly' | 'yearly')
  const [cardBillingCycles, setCardBillingCycles] = useState<{
    solo: 'monthly' | 'yearly';
    team: 'monthly' | 'yearly';
  }>({
    solo: 'monthly',
    team: 'monthly',
  });

  // 정책 뷰어 모달
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });


  // 최근 로그인 제공자 ('google' | 'kakao' | 'naver' | null)
  const [recentProvider, setRecentProvider] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = getRecentLoginProvider();
      if (p) setRecentProvider(p);
    } catch {
      // 무시
    }
  }, []);

  // 사업자 정보 토글 상태
  const [showBusinessInfo, setShowBusinessInfo] = useState(false);

  // 다른 앱보기 드롭다운 상태
  const [isAppsMenuOpen, setIsAppsMenuOpen] = useState(false);
  const appsMenuRef = useRef<HTMLDivElement>(null);

  // 홈페이지 Firestore 실시간 연동 데이터 (site_images/score, site_intro/score)
  const landingData = useHomeLandingData('score');
  const coreCards = landingData.corePoints;
  const faqList = landingData.faqs;

  // 최상단 네비게이션 고정바 스크롤 감지 (히어로 영상 벗어났을 때만 배경 노출)
  const heroSectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // 요금제 팝업 모달 상태 (최초 접속화면에서 요금제 보기 클릭 시 모달 열기용)
  const [showPricingModal, setShowPricingModal] = useState(false);

  // 최상단 히어로 영상 무한 타이핑 애니메이션
  const phrases = landingData.heroPhrases || [
    '예배준비 네이션스가 해결해 드릴게요',
    '교회를 돕는 모든 것 네이션스',
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayedSecondLine, setDisplayedSecondLine] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // 2. 사역자의 고민 타이핑 카드 애니메이션
  const fullQuestions =
    landingData.questionText ||
    '매주 찬양팀 악보 복사와 콘티 정리에 드는 시간을 줄일 순 없을까? 찬양 인도자부터 반주자, 싱어까지 각자의 파트보와 송폼을 실시간으로 공유할 수 없을까? 조옮김(Key 변환) 악보를 1초 만에 만들어 연습할 순 없을까? 소그룹과 금요기도회에서도 태블릿 하나로 찬양할 순 없을까?';
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const [isQuestionDeleting, setIsQuestionDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isQuestionDeleting) {
      if (displayedQuestion.length < fullQuestions.length) {
        timer = setTimeout(() => {
          setDisplayedQuestion(fullQuestions.slice(0, displayedQuestion.length + 1));
        }, 32);
      } else {
        timer = setTimeout(() => {
          setIsQuestionDeleting(true);
        }, 2800);
      }
    } else {
      if (displayedQuestion.length > 0) {
        timer = setTimeout(() => {
          setDisplayedQuestion(fullQuestions.slice(0, displayedQuestion.length - 1));
        }, 14);
      } else {
        timer = setTimeout(() => {
          setIsQuestionDeleting(false);
        }, 450);
      }
    }
    return () => clearTimeout(timer);
  }, [displayedQuestion, isQuestionDeleting, fullQuestions]);

  // 스크롤 이동 헬퍼
  const scrollToLoginCard = () => {
    const el = document.getElementById('studio-login-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToCoreValues = () => {
    const el = document.getElementById('core-features-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToDifferentiation = () => {
    const el = document.getElementById('studio-differentiation');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // 다른 앱보기 바깥 클릭 감지
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (appsMenuRef.current && !appsMenuRef.current.contains(e.target as Node)) {
        setIsAppsMenuOpen(false);
      }
    };
    if (isAppsMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isAppsMenuOpen]);

  // 스크롤 감지: 히어로 섹션 벗어났을 때 헤더 배경 활성화
  useEffect(() => {
    const handleScroll = () => {
      if (heroSectionRef.current) {
        const rect = heroSectionRef.current.getBoundingClientRect();
        setIsScrolled(rect.bottom <= 65);
      } else {
        setIsScrolled(window.scrollY > 400);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 히어로 타이핑 애니메이션
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const currentPhrase = phrases[phraseIndex % phrases.length];

    if (!isDeleting) {
      if (displayedSecondLine.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setDisplayedSecondLine(currentPhrase.slice(0, displayedSecondLine.length + 1));
        }, 110);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 2000);
      }
    } else {
      if (displayedSecondLine.length > 0) {
        timer = setTimeout(() => {
          setDisplayedSecondLine(currentPhrase.slice(0, displayedSecondLine.length - 1));
        }, 55);
      } else {
        timer = setTimeout(() => {
          setPhraseIndex((prev) => (prev + 1) % phrases.length);
          setIsDeleting(false);
        }, 500);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedSecondLine, isDeleting, phraseIndex, phrases]);

  // 영상 자동 재생 보장
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // 섹션 참조 (요금제 바로 스크롤용)
  const pricingSectionRef = useRef<HTMLDivElement>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 페이지 열릴 때 지정된 섹션으로 자동 스크롤
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && effectiveUser) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      const timer = setTimeout(() => {
        if (initialSection === 'pricing' && pricingSectionRef.current) {
          pricingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (loginSectionRef.current) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [isOpen, initialSection]);

  // 리다이렉트 로그인 결과 자동 감지 (구글 로그인 완료 후 복귀 시 자동 닫힘 및 결제 복귀)
  useEffect(() => {
    let isMounted = true;
    const checkRedirect = async () => {
      try {
        const { processRedirectResult } = await import('../api/gdriveWebService');
        const restored = await processRedirectResult();
        if (restored && isMounted) {
          const pending = sessionStorage.getItem('pending_plan_after_google');
          sessionStorage.removeItem('pending_plan_after_google');
          if (pending) {
            proceedPayment(pending);
          } else {
            if (onSuccess) onSuccess();
            onClose();
          }
        }
      } catch (err: any) {
        console.warn('[ClaudeAuthPage] checkRedirect non-fatal:', err);
        if (isMounted && err?.code && err?.code !== 'auth/popup-closed-by-user') {
          setErrorMsg('로그인 처리 중 문제가 발생했습니다: ' + (err.message || ''));
        }
      }
    };
    checkRedirect();
    return () => { isMounted = false; };
  }, [onSuccess, onClose]);

  if (!isOpen) return null;

  // 구글 로그인 핸들러 (gdriveWebService 완벽 연동 + 하이브리드 리다이렉트 대응)
  const handleGoogleLogin = async () => {
    if (isInAppBrowser()) {
      escapeInAppBrowser();
      setErrorMsg('카카오톡/인앱 브라우저에서는 구글 정책상 로그인이 제한됩니다. 크롬 또는 사파리 외부 브라우저로 이동합니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { gdriveWebService, isMobileOrTabletDevice } = await import('../api/gdriveWebService');
      
      // 모바일/태블릿/인앱 브라우저 환경: 구글 화면으로 리다이렉트되므로 로딩 상태 유지
      if (isMobileOrTabletDevice()) {
        await gdriveWebService.login();
        return;
      }

      // 데스크톱 PC 환경
      const success = await gdriveWebService.login();
      if (success) {
        // 드라이브 폴더 보조 동기화는 백그라운드에서 안전하게 실행 (로그인 지연 방지)
        gdriveWebService.getNationsRootFolderId().catch(() => {});
        gdriveWebService.getAppFolderId('Nations Studio').catch(() => {});
        setTimeout(() => window.dispatchEvent(new Event('gdrive_authenticated')), 500);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMsg('로그인 창이 닫혔거나 인증이 완료되지 않았습니다.');
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Google login error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setErrorMsg('로그인 창이 닫혔습니다.');
        setIsLoading(false);
      } else if (err.code === 'auth/popup-blocked') {
        // gdriveWebService 내부에서 이미 signInWithRedirect로 전환되었으므로 로딩 유지
        return;
      } else {
        setErrorMsg('구글 로그인에 실패했습니다. 다시 시도해주세요.');
        setIsLoading(false);
      }
    }
  };

  // 플랜 선택 및 결제 모듈 연동 핸들러
  const handlePlanAction = async (planType: 'free' | 'solo' | 'team' | 'score_1000' | 'ai_analysis_100' | string, isFreePlan = false) => {
    const user = auth.currentUser;
    if (!user) {
      alert(`플랜 이용을 위해 먼저 로그인을 진행해주세요.\n상단 로그인 화면으로 이동합니다.`);
      loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (isFreePlan || planType === 'free' || planType.includes('Free')) {
      onClose();
      return;
    }

    let planId = 'solo';
    let planName = 'SOLO 플랜';
    let cycle: 'monthly' | 'yearly' | 'once' = 'monthly';
    let amount = 3900;
    let isBillingAuth = true; // 정기결제(빌링키) 여부

    const norm = planType.toLowerCase();
    if (norm.includes('team') || norm.includes('팀')) {
      planId = 'team';
      planName = 'TEAM 플랜';
      cycle = cardBillingCycles.team;
      amount = cycle === 'yearly' ? 99000 : 9900;
      isBillingAuth = true;
    } else if (norm.includes('score') || norm.includes('storage') || norm.includes('악보 1000') || norm.includes('악보1000')) {
      planId = 'score_1000';
      planName = '악보 1000 요금제';
      cycle = 'monthly'; // 월 정기결제만 지원
      amount = 2900;
      isBillingAuth = true;
    } else if (norm.includes('ai') || norm.includes('크레딧') || norm.includes('분석') || norm.includes('100회')) {
      planId = 'ai_analysis_100';
      planName = 'AI 분석 100회 요금제';
      cycle = 'once'; // 단회성 결제
      amount = 4900;
      isBillingAuth = false;
    } else {
      // SOLO 플랜
      planId = 'solo';
      planName = 'SOLO 플랜';
      cycle = cardBillingCycles.solo;
      amount = cycle === 'yearly' ? 39000 : 3900;
      isBillingAuth = true;
    }

    const cycleText = cycle === 'once' ? '단회 결제' : (cycle === 'yearly' ? '연간 구독' : '월간 구독');
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
    const hubBase = isLocal ? 'http://localhost:5173' : 'https://sermon.thenations.kr';
    const currentOriginUrl = window.location.origin + window.location.pathname;

    sessionStorage.setItem('pending_pay_target_app', 'studio');
    sessionStorage.setItem('pending_pay_plan_id', planId);
    sessionStorage.setItem('pending_pay_plan_name', planName);
    sessionStorage.setItem('pending_pay_cycle', cycle);
    sessionStorage.setItem('pending_pay_uid', user.uid);
    sessionStorage.setItem('pending_pay_return_url', currentOriginUrl);

    try {
      if (isBillingAuth) {
        // ─── 정기구독: 토스페이먼츠 v1 빌링키(카드 등록) 창 호출 ───
        const customerKey = `cust_studio_${user.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await requestTossBillingAuth({
          customerKey,
          successUrl: `${hubBase}/payment/success?targetApp=studio&planId=${planId}&planName=${encodeURIComponent(planName)}&billingCycle=${cycle}&uid=${encodeURIComponent(user.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
          failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        });
      } else {
        // ─── 단건 결제: 토스페이먼츠 v1 일반 결제창 호출 (AI 분석 100회) ───
        const orderId = `ord_studio_${Date.now()}`;
        await requestTossPayment({
          method: '카드',
          amount,
          orderId,
          orderName: `[Nations Studio] ${planName} (${cycleText})`,
          customerName: user.displayName || '스튜디오 회원',
          customerEmail: user.email || undefined,
          successUrl: `${hubBase}/payment/success?targetApp=studio&planId=${planId}&planName=${encodeURIComponent(planName)}&billingCycle=${cycle}&amount=${amount}&uid=${encodeURIComponent(user.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
          failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        });
      }
    } catch (err) {
      console.warn('[ClaudeAuthPage] Toss payment cancelled or error:', err);
    }
  };


  const proceedPayment = (planName: string) => {
    const kakaoUrl = 'http://pf.kakao.com/_cxjBxaX/chat';
    if (confirm(`[${planName}]\n현재 카카오톡 1:1 상담 채널을 통해 플랜 신청 및 혜택 안내를 도와드리고 있습니다.\n상담 채널로 이동하시겠습니까?`)) {
      window.open(kakaoUrl, '_blank');
    }
  };

  // FAQ 목록 데이터
  const faqs = [
    {
      q: 'STUDIO NATIONS(네이션스 스튜디오)는 어떤 서비스인가요?',
      a: 'STUDIO NATIONS는 예배 찬양팀 인도자, 연주자, 싱어 및 방송 사역자를 위한 스마트 찬양 악보 및 콘티 관리 솔루션입니다. 방대한 찬양 악보 검색부터 드래그앤드롭 콘티 편집, 팀원 실시간 링크 공유, 그리고 보면대에 최적화된 리더 뷰어 모드까지 예배 준비의 전 과정을 한 곳에서 지원합니다.'
    },
    {
      q: '악보 검색과 콘티 작성은 무료로 이용할 수 있나요?',
      a: '네, STUDIO NATIONS의 핵심 기능인 찬양 악보 검색, 콘티 생성 및 순서 편집, 악보편집 및 프린트, 리더 뷰어 모드, 기기 로컬 캐싱 기능은 누구나 제한 없이 무료(Free)로 이용하실 수 있습니다. 단, 서버를 이용한 악보 라이브러리 관리, 실시간 모든 기기 연동, 찬양팀 공유 기능은 유료입니다.'
    },
    {
      q: '찬양팀 공유는 어떻게 하나요?',
      a: '인도자나 팀장이 작성한 콘티, 송폼, 카피곡(유튜브 링크)등을 찬양팀 공유 기능으로 모든 찬양팀이 볼수 있고, 톡으로 대화를 나누며 교제와 의견을 나눌수 있는 플랫폼을 제공합니다.'
    },
    {
      q: '콘티와 악보는 어떻게 공유하나요?',
      a: '콘티 편집기에서 [공유] 버튼을 클릭하면 고유 링크와 QR코드가 즉시 생성됩니다. 이 링크를 카카오톡 단체 채팅방에 보내면 팀원들은 별도의 가입이나 앱 설치 없이 스마트폰, 태블릿, PC에서 악보를 보며 실시간으로 연습할 수 있습니다.'
    },
    {
      q: '악보와 콘티 데이터는 어디에 안전하게 보관되나요?',
      a: 'STUDIO NATIONS는 네이션스 전용 클라우드 서버에 안전하게 암호화되어 보관됩니다. 따라서 어떤 기기나 브라우저에서 로그인하든 본인의 악보 라이브러리와 콘티를 실시간으로 언제 어디서나 불러올 수 있습니다.'
    },
    {
      q: '찬양 악보의 저작권은 어떻게 보호되나요?',
      a: 'STUDIO NATIONS는 악보를 제공하지 않으며 사용자가 합법적으로 소장한 예배용 악보를 개인 기기에 안전하게 정리할 수 있도록 돕는 스마트 뷰어 도구입니다. 무단 유통이나 배포를 엄격히 금지합니다.'
    }
  ];

  const effectiveUser = currentUser || (userProfile?.name ? {
    displayName: userProfile.name,
    email: userProfile.email || '',
    photoURL: userProfile.picture || ''
  } : null);

  // ─── [요금제 섹션 전용 렌더링 헬퍼 함수] ───
  const renderPricingSectionContent = (isModal: boolean = false) => (
    <section
      ref={pricingSectionRef}
      className={`py-12 sm:py-16 px-4 sm:px-6 ${
        isModal ? 'bg-[#FAF9F5]' : 'bg-[#F5F2EB]/50 border-t border-[#E8E5DE]'
      }`}
    >
      <div className="max-w-6xl mx-auto">
        {/* 섹션 타이틀 */}
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#C46A40] tracking-wider uppercase mb-1.5 block">
            NATIONS STUDIO PRICING
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] mb-3">
            이용권 살펴보기
          </h2>
          <p className="text-xs sm:text-sm text-[#6E6A63]">
            예배 찬양팀과 사역자를 위한 최적의 플랜을 선택하고 사역을 확장하세요.
          </p>
        </div>

        {/* 찬양팀 플랜 그리드: Free / SOLO / TEAM (3열 그리드) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* 1. Free 플랜 */}
          <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
            <div>
              <h3 className="text-xl font-bold text-[#1A1918] mb-4">Free</h3>
              <div className="mb-6">
                <div className="text-3xl font-serif font-bold text-[#1A1918]">₩0</div>
                <div className="text-xs text-[#8C877D] mt-0.5">모두에게 무료</div>
              </div>
              <button
                onClick={() => handlePlanAction('Free 플랜', true)}
                className="w-full py-2.5 px-4 bg-[#F5F3ED] hover:bg-[#EAE6DE] text-[#2C2B29] rounded-xl text-xs font-bold transition-all cursor-pointer mb-6"
              >
                스튜디오 무료로 사용하기
              </button>
              <div className="border-t border-[#EFECE6] pt-4">
                <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                <ul className="text-xs text-[#6E6A63] space-y-2.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span>클라우드 서버 저장(악보 100장)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span className="font-semibold text-[#1A1918]">AI 악보분석 크레딧 5개 제공</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span>기본 앨범 1개, 콘티 1개 제공</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span>악보마다 유튜브영상 클립 저장</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span>악보 수정 및 A4, A3 프린트</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                    <span>모든 기기 연동 (PC / 태블릿 / 모바일)</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 2. SOLO 플랜 */}
          <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xl font-bold text-[#1A1918]">SOLO 플랜</h3>
                <span className="text-[11px] text-[#DA7756] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">찬양인도자용</span>
              </div>
              <p className="text-xs text-[#8C877D] mb-3">개인 찬양인도자를 위한 완벽한 콘티 솔루션</p>
              <div className="flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-[11px] font-bold mb-4">
                <button
                  type="button"
                  onClick={() => setCardBillingCycles(prev => ({ ...prev, solo: 'monthly' }))}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                    cardBillingCycles.solo === 'monthly'
                      ? 'bg-[#2C2B29] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  월 정기결제
                </button>
                <button
                  type="button"
                  onClick={() => setCardBillingCycles(prev => ({ ...prev, solo: 'yearly' }))}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                    cardBillingCycles.solo === 'yearly'
                      ? 'bg-[#C46A40] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  연 정기결제
                </button>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-serif font-bold text-[#2C2B29]">
                    {cardBillingCycles.solo === 'yearly' ? '₩39,000' : '₩3,900'}
                  </span>
                  <span className="text-xs text-[#8C877D]">
                    {cardBillingCycles.solo === 'yearly' ? '/ 연' : '/ 월'}
                  </span>
                </div>
                <div className="text-xs text-[#DA7756] font-medium mt-0.5">
                  {cardBillingCycles.solo === 'yearly'
                    ? '연 ₩39,000 (약 17% 절약, 월 3,250원 꼴)'
                    : '연 정기결제 시 약 17% 절약 (₩39,000/년)'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePlanAction('solo')}
                className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
              >
                SOLO {cardBillingCycles.solo === 'yearly' ? '연 정기결제' : '월 정기결제'} 신청하기
              </button>
              <div className="border-t border-[#EFECE6] pt-4">
                <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">포함된 혜택:</span>
                <ul className="text-xs text-[#6E6A63] space-y-2.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>앨범 라이브러리 추가 생성</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>클라우드 서버 저장(악보 1000장)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span className="font-semibold text-[#C46A40]">AI 악보분석 크레딧 30개 제공</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>콘티 저장 기능</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>찬양인도용 악보뷰어</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>회중용 악보뷰어 링크</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 3. TEAM 플랜 */}
          <div className="bg-white border-2 border-[#D97757] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D97757] text-white px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-2xs">
              추천 플랜
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xl font-bold text-[#1A1918]">TEAM 플랜</h3>
                <span className="text-[11px] text-[#C46A40] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">리더 · 팀장용</span>
              </div>
              <p className="text-xs text-[#8C877D] mb-3">찬양팀을 운영하는 리더와 팀원을 위한 원스톱 협업</p>
              <div className="flex items-center bg-[#EAE6DE] p-1 rounded-xl shrink-0 text-[11px] font-bold mb-4">
                <button
                  type="button"
                  onClick={() => setCardBillingCycles(prev => ({ ...prev, team: 'monthly' }))}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                    cardBillingCycles.team === 'monthly'
                      ? 'bg-[#2C2B29] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  월 정기결제
                </button>
                <button
                  type="button"
                  onClick={() => setCardBillingCycles(prev => ({ ...prev, team: 'yearly' }))}
                  className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                    cardBillingCycles.team === 'yearly'
                      ? 'bg-[#C46A40] text-white shadow-xs'
                      : 'text-[#6E6A63] hover:text-[#2C2B29]'
                  }`}
                >
                  연 정기결제
                </button>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-serif font-bold text-[#C46A40]">
                    {cardBillingCycles.team === 'yearly' ? '₩99,000' : '₩9,900'}
                  </span>
                  <span className="text-xs text-[#8C877D]">
                    {cardBillingCycles.team === 'yearly' ? '/ 연' : '/ 월'}
                  </span>
                </div>
                <div className="text-xs text-[#DA7756] font-medium mt-0.5">
                  {cardBillingCycles.team === 'yearly'
                    ? '연 ₩99,000 (약 17% 절약, 월 8,250원 꼴)'
                    : '연 정기결제 시 약 17% 절약 (₩99,000/년)'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePlanAction('team')}
                className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
              >
                TEAM {cardBillingCycles.team === 'yearly' ? '연 정기결제' : '월 정기결제'} 신청하기
              </button>
              <div className="border-t border-[#EFECE6] pt-4">
                <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">SOLO 플랜 포함된 혜택 +</span>
                <ul className="text-xs text-[#6E6A63] space-y-2.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>인도자의 콘티 공유기능</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>찬양팀 협업 제공: 악보, 송폼, 코드악보, 카피곡 유튜브클립 원클릭 공유 및 수정, 톡 교제 기능</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>예배중 찬양팀 악보뷰어/ 프롬프트 협주</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>악보 클라우드 서버 저장(악보 2000장)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span className="font-semibold text-[#C46A40]">AI 악보분석 크레딧 100개 제공</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 추가 옵션 요금제: 클라우드 요금제 & AI 크레딧 요금제 */}
        <div className="mt-12 max-w-5xl mx-auto">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h3 className="text-lg sm:text-xl font-serif font-bold text-[#1A1918]">
                추가 옵션 요금제
              </h3>
              <p className="text-xs text-[#8C877D] mt-0.5">
                필요에 따라 악보 저장 용량이나 AI 분석 크레딧을 자유롭게 추가하여 사용하세요.
              </p>
            </div>
            <span className="text-[11px] text-[#DA7756] font-semibold bg-[#FAF0EB] px-2.5 py-1 rounded-full border border-[#F1D3C6] self-start sm:self-auto">
              언제든 신청 및 충전 가능
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. 클라우드 요금제 */}
            <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#5A564F] uppercase tracking-wider bg-[#F5F3ED] px-2.5 py-0.5 rounded-full">
                    클라우드 요금제
                  </span>
                  <span className="text-xs text-[#DA7756] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">
                    월 정기결제
                  </span>
                </div>
                <h4 className="text-xl font-bold text-[#1A1918] mb-1">악보 1000</h4>
                <p className="text-xs text-[#8C877D] mb-4">
                  다른 요금제와 상관없이 무료 요금제 회원도 추가 신청 가능
                </p>
                <div className="flex items-baseline gap-1.5 mb-5 pb-4 border-b border-[#EFECE6]">
                  <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩2,900</span>
                  <span className="text-xs text-[#8C877D]">/ 월</span>
                  <span className="text-xs text-[#DA7756] font-medium ml-2">(매월 2,900원)</span>
                </div>
                <ul className="text-xs text-[#6E6A63] space-y-2.5 mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span><strong>악보 1000개 저장</strong> (네이션스 클라우드 안전 보관)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span><strong>무료 요금제 회원도 단독 추가 신청 가능</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>기존 이용 플랜에 1000곡 용량 즉시 추가 누적</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>위약금 없이 언제든 자유롭게 해지 가능</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => handlePlanAction('score_1000')}
                className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                악보 1000 월 정기결제 신청하기 (₩2,900/월)
              </button>
            </div>

            {/* 2. AI 크레딧 요금제 */}
            <div className="bg-white border-2 border-[#D97757]/40 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#C46A40] uppercase tracking-wider bg-[#FAF0EB] px-2.5 py-0.5 rounded-full border border-[#F1D3C6]">
                    AI 크레딧 요금제
                  </span>
                  <span className="text-xs text-[#C46A40] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">
                    단회 결제 충전
                  </span>
                </div>
                <h4 className="text-xl font-bold text-[#1A1918] mb-1">AI 분석 100회</h4>
                <p className="text-xs text-[#8C877D] mb-4">
                  AI 악보 인식, 가사/코드 자동 추출, 스마트 송폼 빌더
                </p>
                <div className="flex items-baseline gap-1.5 mb-5 pb-4 border-b border-[#EFECE6]">
                  <span className="text-3xl font-serif font-bold text-[#C46A40]">₩4,900</span>
                  <span className="text-xs text-[#8C877D]">/ 100회</span>
                  <span className="text-xs text-[#DA7756] font-medium ml-2">(단회 4,900원 결제)</span>
                </div>
                <ul className="text-xs text-[#6E6A63] space-y-2.5 mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span><strong>AI 분석 100회</strong> 즉시 충전</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span><strong>이용 기간: 결제 후 365일</strong> (1년 동안 자유롭게 사용)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                    <span>악보 이미지에서 가사·코드 인식 및 자동 송폼 생성</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => handlePlanAction('ai_analysis_100')}
                className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#A8532D] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                AI 분석 100회 충전하기 (₩4,900)
              </button>
            </div>
          </div>
        </div>

        {/* 이용권 및 환불 규정 안내 */}
        <div className="mt-12 bg-white border border-[#E8E5DE] rounded-2xl p-6 text-xs text-[#6E6A63] leading-relaxed max-w-4xl mx-auto">
          <h4 className="font-bold text-[#2C2B29] mb-2.5 flex items-center gap-1.5 text-sm">
            <span>이용권 및 환불 규정 안내</span>
          </h4>
          <ul className="list-disc list-inside space-y-1.5 text-xs text-[#6E6A63]">
            <li>모든 서비스는 네이션스 스튜디오 서비스가 유지되는 동안 제공됩니다.</li>
            <li>서비스 종료 등 불가피한 사유 발생 시 최소 두 달 전(60일 전) 사전 공지됩니다.</li>
            <li>디지털 콘텐츠 특성상 결제 후 서비스를 이용하신 경우 중도 환불이 불가합니다.</li>
          </ul>
        </div>
      </div>
    </section>
  );

  // ─── [경우 A: 사이드바 '플랜 업그레이드' 클릭 시 모달로 전용 렌더링] ───
  if (initialSection === 'pricing') {
    return (
      <div
        className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-start justify-center p-0 sm:p-4 py-0 sm:py-6"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full max-w-5xl rounded-none sm:rounded-3xl overflow-hidden shadow-2xl bg-[#FAF9F5] min-h-screen sm:min-h-0 relative animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 모달 상단 닫기 X 버튼 */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-50 w-9 h-9 rounded-xl flex items-center justify-center text-[#8C877D] hover:text-[#1C1A18] hover:bg-[#F3EFE9] transition-colors cursor-pointer bg-white/80 backdrop-blur-xs shadow-xs"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>

          {renderPricingSectionContent(true)}

          {/* 정책 뷰어 모달 */}
          <PolicyViewModal
            isOpen={policyModal.isOpen}
            initialTab={policyModal.tab}
            onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
          />
        </div>
      </div>
    );
  }

  const renderHeroSecondLine = () => {
    const currentPhrase = phrases[phraseIndex % phrases.length];
    const targetWord = '네이션스';
    const targetIdx = currentPhrase.indexOf(targetWord);

    if (targetIdx !== -1) {
      const len = displayedSecondLine.length;
      const targetEnd = targetIdx + targetWord.length;

      // 1) 아직 '네이션스' 앞부분만 타이핑된 경우 (흰색)
      if (len <= targetIdx) {
        return <span className="whitespace-pre">{displayedSecondLine}</span>;
      }

      const rawPrefix = displayedSecondLine.slice(0, targetIdx);
      const hasTrailingSpace = rawPrefix.endsWith(' ');
      const prefixText = hasTrailingSpace ? rawPrefix.slice(0, -1) : rawPrefix;

      // 2) '네이션스' 타이핑 진행 중 -> 타이핑 시작부터 즉시 초록색
      if (len <= targetEnd) {
        const coloredPart = displayedSecondLine.slice(targetIdx, len);
        return (
          <span className="whitespace-pre inline-flex items-center">
            <span>{prefixText}</span>
            {hasTrailingSpace && <span>&nbsp;</span>}
            <span className="text-[#85f8c4] font-black drop-shadow-[0_2px_16px_rgba(133,248,196,0.5)]">
              {coloredPart}
            </span>
          </span>
        );
      }

      // 3) '네이션스'가 완료되고 뒷부분 타이핑 중
      const coloredPart = displayedSecondLine.slice(targetIdx, targetEnd);
      const suffix = displayedSecondLine.slice(targetEnd);
      return (
        <span className="whitespace-pre inline-flex items-center">
          <span>{prefixText}</span>
          {hasTrailingSpace && <span>&nbsp;</span>}
          <span className="text-[#85f8c4] font-black drop-shadow-[0_2px_16px_rgba(133,248,196,0.5)]">
            {coloredPart}
          </span>
          <span>{suffix}</span>
        </span>
      );
    }

    return <span className="whitespace-pre">{displayedSecondLine}</span>;
  };

  // 재사용 가능한 원형 소셜 로그인 카드 컴포넌트 (바이블 앱과 100% 동일)
  const renderLoginCard = (cardId = 'top-login-card') => (
    <div
      id={cardId}
      className="w-full max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col items-center text-center transition-all"
    >
      {effectiveUser ? (
        /* 이미 로그인된 상태 안내 카드 */
        <div className="w-full flex flex-col items-center text-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center border border-[#F5D8CB]">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-lg text-[#1A1918]">
              {effectiveUser.displayName || '회원'}님, 환영합니다!
            </h3>
            <p className="text-xs text-[#6E6A63] mt-1">
              {effectiveUser.email || '네이션스 계정'}으로 로그인되어 있습니다.
            </p>
          </div>

          <div className="w-full p-4 bg-[#FAF9F5] border border-[#E8E5DE] rounded-2xl flex items-center justify-between text-xs">
            <div className="flex flex-col text-left">
              <span className="text-[#8C877D]">클라우드 스토리지 연동</span>
              <span className="font-bold text-sm text-[#2B2927] mt-0.5">안전하게 동기화 중</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[#8C877D]">이용 플랜</span>
              <span className="font-semibold text-xs text-[#C46A40] mt-0.5">Nations Studio Free</span>
            </div>
          </div>

          <div className="w-full flex flex-col gap-2 mt-2">
            <button
              onClick={() => setShowPricingModal(true)}
              className="w-full py-3 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-white/80" />
              <span>이용권 및 찬양팀 플랜 보기</span>
              <ChevronDown className="w-4 h-4 text-white/80" />
            </button>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#FAF9F5] hover:bg-[#F3EFE9] border border-[#E8E5DE] text-[#4A4741] rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              스튜디오로 돌아가기
            </button>
          </div>
        </div>
      ) : (
        /* 비로그인 시: 바이블 앱과 100% 동일한 형태의 원형 소셜 로그인 카드 */
        <div className="w-full flex flex-col items-center">
          {/* 1) 기능없는 검정색 알약 글자카드: '무료로 이용하기' */}
          <div className="inline-flex items-center justify-center px-5 py-2 rounded-full bg-[#0F172A] text-white text-[13px] font-bold tracking-tight shadow-xs select-none">
            {landingData.loginCardBadge || '무료로 이용하기'}
          </div>

          {/* 2) 아래로 화살표 */}
          <div className="my-2.5 text-slate-800 flex items-center justify-center animate-bounce">
            <ArrowDown className="w-4.5 h-4.5 stroke-[2.5px]" />
          </div>

          {/* 3) 심플한 검정색 글자: '악보앱의 모든 기능 무료로 시작하기' */}
          <h3 className="text-[16px] sm:text-[17px] font-bold text-[#0F172A] tracking-tight mb-4">
            악보앱의 모든 기능 무료로 시작하기
          </h3>

          {/* 에러 메시지 알림 */}
          {errorMsg && (
            <div className="w-full mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs text-left">
              {errorMsg}
            </div>
          )}

          {/* 4) 구글, 카카오톡, 네이버 한 줄 동그란 아이콘 + 텍스트 */}
          <div className="w-full flex items-start justify-center gap-6 sm:gap-8 my-2">
            {/* 구글 */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="relative w-12 h-12 rounded-full bg-white border border-slate-200/90 hover:border-slate-300 shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Google로 시작하기"
              >
                <GoogleCircularIcon />
                {recentProvider === 'google' && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                    최근로그인
                  </span>
                )}
              </button>
              <span className="text-[12px] font-medium text-slate-800">구글</span>
            </div>

            {/* 카카오톡 */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => startKakaoLogin('studio')}
                disabled={isLoading}
                className="relative w-12 h-12 rounded-full bg-[#FEE500] hover:bg-[#FDD800] shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="카카오톡으로 시작하기"
              >
                <KakaoCircularIcon />
                {recentProvider === 'kakao' && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                    최근로그인
                  </span>
                )}
              </button>
              <span className="text-[12px] font-medium text-slate-800">카카오톡</span>
            </div>

            {/* 네이버 */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => startNaverLogin('studio')}
                disabled={isLoading}
                className="relative w-12 h-12 rounded-full bg-[#03C75A] hover:bg-[#02B351] shadow-sm hover:shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="네이버로 시작하기"
              >
                <NaverCircularIcon />
                {recentProvider === 'naver' && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#0F172A] text-white shadow-xs whitespace-nowrap leading-tight">
                    최근로그인
                  </span>
                )}
              </button>
              <span className="text-[12px] font-medium text-slate-800">네이버</span>
            </div>
          </div>

          {/* 하단 약관 안내 링크 */}
          <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
            계속 진행하면 STUDIO NATIONS의{' '}
            <button
              type="button"
              onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
              className="text-slate-600 hover:text-black underline cursor-pointer"
            >
              개인정보처리방침
            </button>{' '}
            및{' '}
            <button
              type="button"
              onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
              className="text-slate-600 hover:text-black underline cursor-pointer"
            >
              이용약관
            </button>
            에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAF9F5] text-[#2C2B29] overflow-y-auto select-text font-sans custom-scrollbar">
      {/* ── 최상단 고정 헤더 (로고 & 다른 앱보기 고정, 항상 은은한 흐린 반투명 배경 적용) ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-black/80 backdrop-blur-md py-3 shadow-lg'
            : 'bg-black/40 backdrop-blur-md py-3.5 shadow-sm'
        }`}
      >
        <div className="w-full px-4 sm:px-10 md:px-14 flex items-center justify-between">
          {/* Top-Left Logo: NATIONS STUDIO */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 sm:gap-3 select-none cursor-pointer group"
          >
            <img
              src="/nations-symbol-clean.png"
              alt="NATIONS Logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="h-8 sm:h-9.5 w-auto object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105"
            />
            <div className="flex flex-col text-left leading-tight">
              <span className="font-sans font-bold text-[11px] sm:text-[12.5px] text-white/80 tracking-widest uppercase">
                NATIONS
              </span>
              <span className="font-sans font-extrabold text-[15.5px] sm:text-[18px] text-white tracking-tight drop-shadow-md">
                STUDIO
              </span>
            </div>
          </div>

          {/* Top-Right: '다른 앱보기' 글자만 있는 버튼 및 드롭다운 + (로그인 시) 스튜디오 복귀 버튼 */}
          <div className="flex items-center gap-3">
            {effectiveUser && (
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer border border-white/10"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>스튜디오로 돌아가기</span>
              </button>
            )}

            <div ref={appsMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsAppsMenuOpen(!isAppsMenuOpen)}
                className="text-white/85 hover:text-white text-[13px] sm:text-[14px] font-medium tracking-tight flex items-center gap-1 cursor-pointer transition-colors py-1 select-none drop-shadow-md group"
                title="다른 앱보기"
              >
                <span>다른 앱보기</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isAppsMenuOpen ? 'rotate-180 text-white' : 'text-white/70 group-hover:text-white'
                  }`}
                />
              </button>

              {/* 앱 드롭다운 목록 */}
              {isAppsMenuOpen && (
                <div className="absolute right-0 mt-2 w-max min-w-[175px] max-w-[200px] bg-black/60 backdrop-blur-md rounded-2xl p-1.5 z-50 text-left shadow-2xl animate-fadeIn border border-white/10">
                  <div className="flex flex-col gap-0.5">
                    {/* 1. NATIONS BIBLE */}
                    <a
                      href="https://bible.thenations.kr/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsAppsMenuOpen(false)}
                      className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                    >
                      <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                        네이션스 바이블
                      </span>
                      <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                        설교자를 위한 나만의 주석앱
                      </span>
                    </a>

                    {/* 2. NATIONS VIDEO */}
                    <a
                      href="https://sermon.thenations.kr/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsAppsMenuOpen(false)}
                      className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                    >
                      <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                        NATIONS VIDEO
                      </span>
                      <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                        목사님의 설교를 숏폼으로 제작
                      </span>
                    </a>

                    {/* 3. NATIONS VOTE */}
                    <a
                      href="https://vote.thenations.kr/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsAppsMenuOpen(false)}
                      className="px-3 py-2 rounded-xl hover:bg-white/15 transition-colors flex flex-col cursor-pointer group"
                    >
                      <span className="text-[13px] sm:text-[13.5px] font-bold text-white group-hover:text-white leading-tight">
                        NATIONS VOTE
                      </span>
                      <span className="text-[11px] text-white/80 mt-0.5 font-normal leading-tight">
                        교회선거를 위한 스마트 투표앱
                      </span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {effectiveUser && (
              <button
                type="button"
                onClick={onClose}
                className="sm:hidden w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── 1. 최상단: 홈페이지 히어로 영상 + 문구 ── */}
      <section
        ref={heroSectionRef}
        className="relative w-full h-[68vh] min-h-[490px] max-h-[700px] sm:h-auto sm:min-h-0 sm:max-h-[85vh] sm:aspect-video overflow-hidden bg-black flex items-center justify-start select-none"
      >
        {/* Background Hero Video */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover object-center opacity-85 sm:opacity-90"
            src="/score-hero-video-1.mp4"
          >
            <source src="/score-hero-video-1.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent z-10" />
        </div>

        {/* Overlaid Catchphrase */}
        <div className="relative z-20 w-full max-w-6xl mx-auto px-5 sm:px-12 md:px-16 flex flex-col justify-center pt-16 sm:pt-20">
          <div className="w-full max-w-4xl text-left">
            <h1 className="tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
              <span className="block text-[14px] min-[390px]:text-[15.5px] min-[430px]:text-[17px] sm:text-[19px] md:text-[23px] lg:text-[26px] font-medium text-white/90 mb-1 sm:mb-2">
                {landingData.heroTopText || '찬양 준비와 예배에만 집중하세요'}
              </span>
              <span className="inline-flex flex-wrap items-center text-[22px] min-[390px]:text-[24px] min-[430px]:text-[26px] sm:text-[30px] md:text-[38px] lg:text-[44px] font-bold text-white leading-tight break-keep-all">
                {renderHeroSecondLine()}
                <span className="inline-block w-[3px] sm:w-[4px] h-[0.85em] bg-white ml-2 align-middle animate-pulse flex-shrink-0" />
              </span>
            </h1>
          </div>
        </div>
      </section>

      {/* ── 2. 사역자의 고민 타이핑 카드 ── */}
      <section className="w-full bg-[#F8F9FD] pt-12 pb-10 sm:pt-16 sm:pb-12 px-3 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-5xl lg:max-w-6xl mx-auto w-full flex flex-col items-center gap-5 sm:gap-6">
          <h2 className="text-[#0F172A] font-bold text-[18px] min-[360px]:text-[19.5px] min-[400px]:text-[21px] sm:text-[25px] md:text-[28px] tracking-tight leading-snug break-keep-all text-center px-2">
            <span>{landingData.questionHeading || '예배와 찬양 준비로 분주한 사역자의 고민'}</span>
          </h2>

          {/* Question Card Surface (Outer border removed) */}
          <div className="w-full max-w-4xl lg:max-w-5xl bg-white rounded-[22px] min-[360px]:rounded-[26px] sm:rounded-[32px] md:rounded-[36px] p-2 min-[360px]:p-2.5 sm:p-3.5 md:p-4 shadow-sm border border-slate-200/80">
            <div className="relative w-full bg-[#FAFBFD] hover:bg-white rounded-[18px] min-[360px]:rounded-[20px] sm:rounded-[26px] md:rounded-[28px] border border-slate-200/90 hover:border-slate-300 transition-colors duration-200 p-3.5 min-[360px]:p-4 min-[400px]:p-5 sm:p-7 md:p-8 h-[195px] min-[360px]:h-[205px] min-[400px]:h-[215px] sm:h-[240px] md:h-[255px] flex flex-col justify-between text-left overflow-hidden">
              <div className="w-full">
                <p className="text-[11.2px] min-[360px]:text-[12px] min-[390px]:text-[12.6px] min-[430px]:text-[13.5px] sm:text-[16px] md:text-[17px] text-slate-800 leading-[1.52] min-[360px]:leading-[1.58] sm:leading-[1.78] font-normal tracking-tight break-keep-all whitespace-pre-wrap select-text">
                  <span>{displayedQuestion}</span>
                  <span className="inline-block w-[1.75px] min-[360px]:w-[2px] sm:w-[2.25px] h-[1.22em] bg-[#0F172A] ml-0.5 sm:ml-1 align-middle animate-pulse shrink-0" />
                </p>
              </div>

              <div className="w-full pt-1 sm:pt-2 flex items-center justify-between gap-2 mt-auto">
                <span className="text-slate-400 text-[20px] sm:text-[22px] font-light leading-none select-none pl-1">
                  +
                </span>
                <button
                  type="button"
                  onClick={scrollToCoreValues}
                  aria-label="핵심 기능으로 이동"
                  className="w-7 h-7 min-[360px]:w-7.5 min-[360px]:h-7.5 sm:w-8.5 sm:h-8.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
                >
                  <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. 상단 로그인 카드: 더 깊이 예배하고, 더 편리하게 준비하세요 + 무료로 이용하기 카드 ── */}
      <section id="studio-login-section" ref={loginSectionRef} className="w-full bg-[#F8F9FD] pb-16 sm:pb-24 px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="max-w-2xl mx-auto mb-6 sm:mb-8 flex flex-col items-center">
          <h2 className="text-[20px] sm:text-[25px] md:text-[28px] font-bold text-[#0F172A] leading-snug break-keep-all">
            <span>{landingData.mainHeadingLine1 || '더 깊이 예배하고,'}</span>
            <br />
            <span>{landingData.mainHeadingLine2 || '더 편리하게 준비하세요'}</span>
          </h2>
        </div>
        {renderLoginCard('top-login-card')}
      </section>



      {/* ── 4. 핵심기능 카드들 3개 배치 (Core Values - 홈페이지 ScoreCoreValuesSection과 100% 일치 + 어드민 실시간 연동) ── */}
      <section
        id="core-features-section"
        className="w-full bg-[#F8F9FD] py-16 sm:py-24 border-y border-slate-200/80"
      >
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-8 sm:gap-12">
          {/* Section Header */}
          <div className="flex flex-col text-center items-center gap-1.5 max-w-3xl mx-auto mb-2 sm:mb-4">
            <h2 className="text-[19px] sm:text-[23px] md:text-[27px] font-bold text-[#0F172A] tracking-tight leading-tight break-keep-all">
              {landingData.subHeadingLine1 || '악보준비 번거롭지 않습니다.'}
            </h2>
            <p className="text-[13px] sm:text-[14.5px] text-slate-500 font-normal break-keep-all">
              {landingData.subHeadingLine2 || '편하고 쉽게 관리해요'}
            </p>

            {/* 무료로 앱 이용하기 버튼 */}
            <div className="pt-3 sm:pt-4">
              <button
                type="button"
                onClick={scrollToLoginCard}
                className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-[#0F172A] hover:bg-black text-white text-[13.5px] sm:text-[14.5px] font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <span>무료로 앱 이용하기</span>
                <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
              </button>
            </div>
          </div>

          {/* 3 Core Points List - Alternating 2-Column Showcase (카드는 시각적으로 숨기고 이미지는 깊은 그림자로 강조, 좌우 여백 1.3배 확대) */}
          {/* 이전 복구용 백업 스타일:
              - 카드 컨테이너: className="w-full rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-12 border border-slate-200/70 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
              - 이미지: className="max-w-full max-h-[260px] sm:max-h-[300px] lg:max-h-[340px] w-auto h-auto object-contain rounded-[22px] sm:rounded-[28px] shadow-md border border-slate-200/60 transition-transform duration-300 hover:scale-[1.01]"
          */}
          <div className="flex flex-col gap-12 sm:gap-20 max-w-6xl mx-auto w-full px-6 sm:px-10 lg:px-16">
            {/* Row 1: 매번 반복하는 작업에서 벗어나세요 */}
            <div className="w-full py-6 sm:py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all whitespace-pre-line">
                  {coreCards[0]?.title || '매번 반복하는 작업에서 벗어나세요'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[0]?.desc || '매번 반복되는 악보찾기, 복잡한 편집과 종이 출력의 번거로움에서 벗어나세요. 악보라이브러리, 악보편집, 악보출력, 악보뷰어까지 경험많은 예배전문가가 예배의 언어로 만들었습니다.'}
                </p>
              </div>

              <div className="lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full max-w-[500px] flex items-center justify-center select-none py-2">
                  {coreCards[0]?.image ? (
                    <img
                      src={coreCards[0].image}
                      alt="송폼 자동 정리 콘티 편집"
                      className="max-w-full max-h-[270px] sm:max-h-[310px] lg:max-h-[350px] w-auto h-auto object-contain rounded-[22px] sm:rounded-[28px] shadow-[0_20px_50px_rgba(15,23,42,0.16),0_6px_16px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/10 border border-white/80 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(15,23,42,0.22)] transition-all duration-300"
                    />
                  ) : (
                    <div className="w-full h-[240px] sm:h-[280px] lg:h-[320px] rounded-[22px] sm:rounded-[28px] border-2 border-dashed border-slate-300/70 flex flex-col items-center justify-center text-slate-400 gap-2 p-4">
                      <span className="text-3xl opacity-35">🎵</span>
                      <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                        이미지 등록 대기 중
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: 찬양팀 페이지로 함께 공유해요. (Alternating) */}
            <div className="w-full py-6 sm:py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="order-last lg:order-first lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full max-w-[500px] flex items-center justify-center select-none py-2">
                  {coreCards[1]?.image ? (
                    <img
                      src={coreCards[1].image}
                      alt="찬양팀 실시간 동기화 마스터뷰"
                      className="max-w-full max-h-[270px] sm:max-h-[310px] lg:max-h-[350px] w-auto h-auto object-contain rounded-[22px] sm:rounded-[28px] shadow-[0_20px_50px_rgba(15,23,42,0.16),0_6px_16px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/10 border border-white/80 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(15,23,42,0.22)] transition-all duration-300"
                    />
                  ) : (
                    <div className="w-full h-[240px] sm:h-[280px] lg:h-[320px] rounded-[22px] sm:rounded-[28px] border-2 border-dashed border-slate-300/70 flex flex-col items-center justify-center text-slate-400 gap-2 p-4">
                      <span className="text-3xl opacity-35">👥</span>
                      <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                        이미지 등록 대기 중
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="order-first lg:order-last lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all whitespace-pre-line">
                  {coreCards[1]?.title || '찬양팀 페이지로 함께 공유해요.'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[1]?.desc || '기도로 채워진 콘티와 송폼, 카피곡 유튜브 영상이 찬양팀에게 실시간으로 동기화됩니다. 콘티와 송품은 라이브러리에 관리되고 팀원간의 체팅과 소통이 원할해 집니다.'}
                </p>
              </div>
            </div>

            {/* Row 3: 누구나 악보를 볼수있어요. */}
            <div className="w-full py-6 sm:py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <h3 className="text-[17px] sm:text-[20px] md:text-[23px] font-bold text-[#0F172A] leading-[1.3] tracking-tight break-keep-all whitespace-pre-line">
                  {coreCards[2]?.title || '누구나 악보를 볼수있어요.'}
                </h3>
                <p className="text-[13px] sm:text-[14px] text-slate-600 leading-relaxed mt-3.5 break-keep-all max-w-lg">
                  {coreCards[2]?.desc || '찬양 인도자용, 연주자용, 회중용 악보뷰를 제공합니다. 링크 하나로 누구나 오늘 예배의 전체악보를 볼수 있습니다.'}
                </p>
              </div>

              <div className="lg:col-span-6 w-full flex items-center justify-center">
                <div className="w-full max-w-[500px] flex items-center justify-center select-none py-2">
                  {coreCards[2]?.image ? (
                    <img
                      src={coreCards[2].image}
                      alt="스마트 조옮김 키 변환"
                      className="max-w-full max-h-[270px] sm:max-h-[310px] lg:max-h-[350px] w-auto h-auto object-contain rounded-[22px] sm:rounded-[28px] shadow-[0_20px_50px_rgba(15,23,42,0.16),0_6px_16px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/10 border border-white/80 hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(15,23,42,0.22)] transition-all duration-300"
                    />
                  ) : (
                    <div className="w-full h-[240px] sm:h-[280px] lg:h-[320px] rounded-[22px] sm:rounded-[28px] border-2 border-dashed border-slate-300/70 flex flex-col items-center justify-center text-slate-400 gap-2 p-4">
                      <span className="text-3xl opacity-35">🎼</span>
                      <span className="text-[12px] font-medium text-slate-500/70 tracking-tight">
                        이미지 등록 대기 중
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Differentiation & FAQ 섹션 (홈페이지 ScoreDifferentiationSection과 100% 일치) ── */}
      <section
        id="studio-differentiation"
        className="w-full bg-[#F8F9FD] py-12 sm:py-16 lg:py-20 border-b border-slate-200/80"
      >
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Callout (Left Column) */}
          <div className="flex flex-col justify-center items-start gap-3 lg:col-span-5">
            {/* 무료로 앱 이용하기 버튼 */}
            <button
              type="button"
              onClick={scrollToLoginCard}
              className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-5.5 sm:py-2.5 rounded-full bg-[#0F172A] hover:bg-black text-white text-[13px] sm:text-[14px] font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer mb-1"
            >
              <span>무료로 앱 이용하기</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2px]" />
            </button>

            <div className="flex flex-col gap-1.5">
              <p className="text-[12px] sm:text-[13px] text-[#64748B] font-normal">
                {landingData.diffTag || '찬양사역을 이해하는 앱'}
              </p>

              <h2 className="text-[12.5px] sm:text-[13.5px] font-medium text-[#0F172A] leading-relaxed break-keep-all">
                {landingData.diffHeading ||
                  '찬양 사역자와 반주자의 호흡, 기도의 사모함과 잔잔한 긴장감까지 속속들이 이해하는 경험많은 예배전문가가 예배의 언어로 만든 앱입니다.'}
              </h2>

              <p className="text-[12px] sm:text-[12.5px] text-[#64748B] font-normal leading-relaxed max-w-xl break-keep-all">
                {landingData.diffDesc || '찬양 준비의 모든 번거로움을 덜어내고 예배의 감격과 본질에 온전히 집중하도록 돕습니다.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[11.5px] sm:text-[12px] text-slate-600 font-medium">
              {(landingData.diffBadges || ['클라우드 안전 보관', '실시간 찬양팀 공유', '다양한 악보뷰 제공']).map(
                (badge, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0F172A]" />
                    <span>{badge}</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Q&A Section (Right Column) */}
          <div className="flex flex-col gap-4.5 lg:col-span-7 justify-center">
            {faqList.map((faq, idx) => {
              const isOpenFaq = openFaqIndex === idx;
              return (
                <div key={idx} className="flex flex-col gap-1.5">
                  <h3 className="text-[13.5px] sm:text-[14.5px] font-bold text-[#0F172A] leading-snug break-keep-all">
                    <span className="text-[#0F172A] font-bold mr-1">Q.</span>
                    {faq.q}
                  </h3>

                  <div className="flex flex-col gap-1 w-full pl-3.5 sm:pl-4">
                    <div
                      onClick={() => setOpenFaqIndex(isOpenFaq ? null : idx)}
                      className="flex items-center justify-between gap-3 cursor-pointer group select-none"
                    >
                      <p className="text-[12px] sm:text-[13px] text-slate-400 font-normal leading-snug break-keep-all group-hover:text-slate-600 transition-colors">
                        {faq.preview || faq.a}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFaqIndex(isOpenFaq ? null : idx);
                        }}
                        aria-label="답변 펼치기/접기"
                        className="shrink-0 p-0 text-slate-400 group-hover:text-[#0F172A] bg-transparent border-0 cursor-pointer flex items-center justify-center leading-none focus:outline-none transition-colors"
                      >
                        <span className="text-[18px] font-normal select-none">
                          {isOpenFaq ? '−' : '+'}
                        </span>
                      </button>
                    </div>

                    {isOpenFaq && (
                      <div className="pt-1 text-[11.5px] sm:text-[12.5px] text-[#475569] leading-relaxed break-keep-all animate-fadeIn">
                        {faq.a}
                      </div>
                    )}
                  </div>

                  {idx < faqList.length - 1 && <div className="w-full h-[1px] bg-slate-200/90 mt-2" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 6. 교회를 돕는 모든 것 NATIONS 스마트 생태계 (홈페이지와 100% 동일한 구성 및 빠른 속도) ── */}
      <section className="w-full py-16 sm:py-20 flex flex-col gap-8 bg-white border-b border-slate-200/80 overflow-hidden">
        <div className="flex flex-col gap-2.5 text-center max-w-2xl mx-auto px-4 items-center">
          <h2 className="text-[19px] sm:text-[23px] md:text-[27px] font-bold text-[#0F172A] leading-tight flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[24px] sm:text-[28px] text-[#0F172A] shrink-0">hub</span>
            <span>교회를 돕는 모든 것, NATIONS 스마트 생태계</span>
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[#475569] max-w-xl mx-auto">
            설교, 찬양, 미디어, 행정, 선거, 소그룹 까지 하나로 이어지는 미니스트리 솔루션
          </p>
        </div>

        {/* 옆으로 흐르는 마퀴 트랙 (빠른 속도 18초) */}
        <div className="relative w-full overflow-hidden py-2">
          <style>{`
            @keyframes marqueeScroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .ecosystem-track {
              display: flex;
              gap: 14px;
              width: max-content;
              animation: marqueeScroll 18s linear infinite;
              will-change: transform;
            }
            .ecosystem-track:hover {
              animation-play-state: paused;
            }
          `}</style>

          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

          <div className="ecosystem-track py-1">
            {[
              {
                id: 'sermon',
                title: '네이션스 Sermon Video',
                intro: '유튜브 링크로 설교 숏폼 5개 & 주일 묵상카드 완성',
                icon: 'youtube',
              },
              {
                id: 'bible',
                title: '네이션스 Bible AI',
                intro: '다중 역본 대조와 설교자를 위한 나만의 주석 노트',
                icon: 'menu_book',
              },
              {
                id: 'vote',
                title: '네이션스 교회투표',
                intro: '90% 시간 단축, 실시간 집계 무설치 모바일 교회투표',
                icon: 'how_to_vote',
              },
              {
                id: 'score',
                title: '네이션스 스튜디오 (악보)',
                intro: '악보 라이브러리 편집부터 찬양팀 실시간 동기화',
                icon: 'queue_music',
              },
              {
                id: 'erp',
                title: '네이션스 교회관리',
                intro: '어려운 행정을 덜어낸 간결한 올인원 스마트 교적관리',
                icon: 'church',
              },
              {
                id: 'group',
                title: '네이션스 소그룹',
                intro: '구역·셀 모임의 은혜로운 삶의 나눔과 기도제목 공유',
                icon: 'diversity_3',
              },
              // 무한 롤링용 복제
              {
                id: 'sermon-2',
                title: '네이션스 Sermon Video',
                intro: '유튜브 링크로 설교 숏폼 5개 & 주일 묵상카드 완성',
                icon: 'youtube',
              },
              {
                id: 'bible-2',
                title: '네이션스 Bible AI',
                intro: '다중 역본 대조와 설교자를 위한 나만의 주석 노트',
                icon: 'menu_book',
              },
              {
                id: 'vote-2',
                title: '네이션스 교회투표',
                intro: '90% 시간 단축, 실시간 집계 무설치 모바일 교회투표',
                icon: 'how_to_vote',
              },
              {
                id: 'score-2',
                title: '네이션스 스튜디오 (악보)',
                intro: '악보 라이브러리 편집부터 찬양팀 실시간 동기화',
                icon: 'queue_music',
              },
              {
                id: 'erp-2',
                title: '네이션스 교회관리',
                intro: '어려운 행정을 덜어낸 간결한 올인원 스마트 교적관리',
                icon: 'church',
              },
              {
                id: 'group-2',
                title: '네이션스 소그룹',
                intro: '구역·셀 모임의 은혜로운 삶의 나눔과 기도제목 공유',
                icon: 'diversity_3',
              },
            ].map((app, idx) => (
              <div
                key={`${app.id}-${idx}`}
                className="w-[260px] sm:w-[285px] shrink-0 bg-white rounded-2xl p-4 sm:p-4.5 border border-slate-200/80 transition-all duration-200 select-none flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-lg hover:-translate-y-1"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8.5 h-8.5 rounded-xl bg-slate-100/90 flex items-center justify-center shrink-0 text-slate-800">
                    {app.icon === 'youtube' ? (
                      <MonochromeYouTubeIcon size={19} className="shrink-0" />
                    ) : (
                      <span className="material-symbols-outlined text-[20px] leading-none">
                        {app.icon}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[14px] sm:text-[15px] font-bold text-[#0F172A] leading-snug truncate">
                    {renderTitleWithAi(app.title)}
                  </h3>
                </div>
                <p className="text-[12px] sm:text-[12.5px] text-[#64748B] font-normal leading-relaxed break-keep-all line-clamp-2">
                  {app.intro}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. 하단 로그인 카드 ── */}
      <section className="w-full bg-[#F8F9FD] py-16 sm:py-20 px-4 sm:px-6 flex justify-center border-b border-slate-200/80">
        {renderLoginCard('bottom-login-card')}
      </section>

      {/* ── 8. 네이션스 카카오톡 상담 배너: 어디서부터 시작해야 할지 막막하신가요? ── */}
      <section className="w-full bg-white py-14 sm:py-20 px-4 sm:px-6 flex flex-col items-center text-center gap-6 border-b border-slate-200/80">
        <div className="flex items-center justify-center gap-2 select-none">
          <img
            src="/nations-symbol-clean.png"
            alt="NATIONS 심볼"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="h-8 sm:h-9 w-auto object-contain shrink-0"
          />
          <img
            src="/nations-logo-orig.png"
            alt="NATIONS 로고"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="h-6 sm:h-7 w-auto object-contain shrink-0"
          />
        </div>

        <div className="flex flex-col gap-2 max-w-xl">
          <h2 className="text-[19px] sm:text-[23px] md:text-[26px] font-bold text-[#0F172A] leading-tight break-keep-all">
            어디서부터 시작해야 할지 막막하신가요?
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[#475569] leading-relaxed break-keep-all">
            교회의 규모와 사역 환경에 맞춘 솔루션을 1:1로 제안해 드립니다.{' '}
            <span className="block sm:inline font-medium text-[#0F172A]">작은 문의도 성심껏 동역하겠습니다.</span>
          </p>
        </div>

        <div className="w-full max-w-md mx-auto">
          <a
            href="http://pf.kakao.com/_cxjBxaX/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 sm:py-4 px-6 bg-[#FEE500] hover:bg-[#FDD800] text-[#371D1E] rounded-2xl text-[14.5px] sm:text-[15.5px] font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <KakaoChannelIcon className="w-5.5 h-5.5 shrink-0" />
            <span>카카오채널: 더 네이션스 솔루션</span>
          </a>
        </div>
      </section>

      {/* ── 9. 홈페이지 하단: 간편한 스마트 목회 환경을 추구합니다 & 4열 디렉토리 ── */}
      <footer className="w-full bg-[#FAFBFD] pt-12 pb-16 px-4 sm:px-8 border-t border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          {/* Top Header */}
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1.5 pb-4 border-b border-slate-200/90">
            <div className="flex items-center gap-1.5">
              <CloudIcon className="w-[18px] h-[18px] text-slate-800 shrink-0" />
              <h3 className="text-[14px] sm:text-[15.5px] md:text-[17px] font-bold text-[#0F172A] tracking-tight break-keep-all">
                간편한 스마트 목회 환경을 추구합니다.
              </h3>
            </div>
            <p className="text-[11px] sm:text-[12px] text-[#64748B] font-normal break-keep-all">
              복잡한 설치 없이 웹과 모바일 앱이 어디서나 유기적으로 연동됩니다.
            </p>
          </div>

          {/* 4 Columns Directory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 text-left">
            {/* 1. 제품 (Products) */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">제품 (Products)</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <a href="https://sermon.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS SERMON AI (숏폼 미디어)
                  </a>
                </li>
                <li>
                  <a href="https://vote.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS VOTE (교회 스마트 투표)
                  </a>
                </li>
                <li>
                  <span className="font-semibold text-slate-900">
                    네이션스 스튜디오 (찬양 및 악보)
                  </span>
                </li>
                <li>
                  <a href="https://bible.thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS BIBLE AI (나만의 주석)
                  </a>
                </li>
                <li>
                  <a href="https://thenations.kr" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                    NATIONS CHURCH (교회 관리)
                  </a>
                </li>
              </ul>
            </div>

            {/* 2. 요금안내 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">요금안내</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>가입 후: 무료 서비스</li>
                <li>
                  <button
                    type="button"
                    onClick={() => setShowPricingModal(true)}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    유료요금: 앱에 내부 안내 (요금제 보기)
                  </button>
                </li>
                <li>연간결제: 약 17% 추가 할인 혜택</li>
              </ul>
            </div>

            {/* 3. 고객지원센터 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">고객지원센터</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <a
                    href="http://pf.kakao.com/_cxjBxaX/chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-black transition-colors"
                  >
                    1:1 카톡 문의하기
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={scrollToDifferentiation}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    자주 묻는 질문 (FAQ)
                  </button>
                </li>
                <li className="relative">
                  <button
                    type="button"
                    onClick={() => setShowBusinessInfo(!showBusinessInfo)}
                    className="hover:text-black transition-colors text-left cursor-pointer flex items-center gap-1"
                  >
                    <span>사업자 정보 확인</span>
                    <span className="material-symbols-outlined text-[14px] text-slate-400">
                      {showBusinessInfo ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {showBusinessInfo && (
                    <div className="mt-2 p-3 bg-white border border-slate-200 rounded-xl shadow-md text-[11px] text-slate-600 leading-relaxed animate-fadeIn">
                      <p className="font-semibold text-slate-900">더네이션스 솔루션</p>
                      <p>대표자: 유문식</p>
                      <p>사업자등록번호: 712-14-02380</p>
                    </div>
                  )}
                </li>
              </ul>
            </div>

            {/* 4. 법률 및 정책 */}
            <div className="flex flex-col gap-2.5">
              <h4 className="text-[12.5px] font-bold text-[#0F172A]">법률 및 정책</h4>
              <ul className="flex flex-col gap-1.5 text-[11.5px] text-[#64748B]">
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    서비스 이용약관
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    개인정보 처리방침
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'refund' })}
                    className="hover:text-black transition-colors text-left cursor-pointer"
                  >
                    청약철회 및 환불규정
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* 최하단 카피라이트 */}
          <div className="pt-6 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
            <p>© 2026 NATIONS STUDIO. All rights reserved.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                className="hover:underline cursor-pointer"
              >
                이용약관
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                className="hover:underline cursor-pointer"
              >
                개인정보처리방침
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setPolicyModal({ isOpen: true, tab: 'refund' })}
                className="hover:underline cursor-pointer"
              >
                환불규정
              </button>
              {effectiveUser && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-slate-700 font-bold hover:underline cursor-pointer"
                  >
                    스튜디오로 복귀 →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* ── 7. 플랜 모달 (showPricingModal이 true일 때 팝업) ── */}
      {showPricingModal && (
        <div
          className="fixed inset-0 z-[120] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-start justify-center p-0 sm:p-4 py-0 sm:py-6"
          onClick={() => setShowPricingModal(false)}
        >
          <div
            className="w-full max-w-5xl rounded-none sm:rounded-3xl overflow-hidden shadow-2xl bg-[#FAF9F5] min-h-screen sm:min-h-0 relative animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPricingModal(false)}
              className="absolute top-4 right-4 z-50 w-9 h-9 rounded-xl flex items-center justify-center text-[#8C877D] hover:text-[#1C1A18] hover:bg-[#F3EFE9] transition-colors cursor-pointer bg-white/80 backdrop-blur-xs shadow-xs"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
            {renderPricingSectionContent(true)}
          </div>
        </div>
      )}

      {/* 이용약관 & 개인정보 처리방침 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />
    </div>
  );
};
