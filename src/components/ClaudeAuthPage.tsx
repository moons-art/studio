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
  Music,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { type User } from 'firebase/auth';
import { auth } from '../api/firebaseConfig';
import { isInAppBrowser, escapeInAppBrowser } from '../utils/inAppBrowser';
import { startKakaoLogin, startNaverLogin, processUniversalPayment, requestTossPayment } from '../utils/socialAuth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';
import { PolicyViewModal, type PolicyModalType } from './PolicyViewModal';

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

  // 6줄 순차 타이핑 효과 데이터 및 상태
  const typingLines = [
    { from: '매번 악보를 찾아요', to: '악보 라이브러리 저장' },
    { from: '1장에 모아 출력해요', to: 'A4, A3 악보 자르기 편집' },
    { from: '매번 유튜브 영상을 찾아요', to: '악보+유튜브 영상 자동검색 클립 보관' },
    { from: '가사와 코드를 찾아요', to: 'AI 가사, 코드, 송폼 생성, 키변환' },
    { from: '찬양팀 공유가 힘들어요', to: '악보, 콘티, 송폼, 유튜브 영상 원클릭 협업' },
    { from: '매번 악보를 복사해요', to: '소그룹 악보뷰 제공' }
  ];
  const [displayedLengths, setDisplayedLengths] = useState<number[]>([0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    let currentLine = 0;
    let currentChar = 0;
    const interval = setInterval(() => {
      setDisplayedLengths(prev => {
        const next = [...prev];
        const line = typingLines[currentLine];
        const maxLen = line ? line.from.length + 4 + line.to.length : 0;

        if (currentChar <= maxLen) {
          next[currentLine] = currentChar;
          currentChar++;
        } else {
          if (currentLine < typingLines.length - 1) {
            currentLine++;
            currentChar = 0;
          }
        }
        return next;
      });
    }, 40);

    return () => clearInterval(interval);
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
  const handlePlanAction = async (planName: string, isFreePlan = false) => {
    const user = auth.currentUser;
    if (!user) {
      alert(`${planName} 이용을 위해 먼저 로그인을 진행해주세요.\n상단 로그인 화면으로 이동합니다.`);
      loginSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (isFreePlan) {
      onClose();
      return;
    }

    let planId = 'solo';
    let amount = 3900;
    if (planName.includes('TEAM') || planName.includes('팀')) {
      planId = 'team';
      amount = 9900;
    } else if (planName.includes('클라우드') || planName.includes('악보 1000')) {
      planId = 'storage_1000';
      amount = 3000;
    } else if (planName.includes('AI') || planName.includes('크레딧')) {
      planId = 'ai_credit_100';
      amount = 5000;
    }

    const isOneTime = planId === 'ai_credit_100';
    const cycle = isOneTime ? 'onetime' : 'monthly';
    const billingText = isOneTime ? '(단회 결제)' : '(월간 구독)';

    const orderId = `ord_studio_${Date.now()}`;
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
      await requestTossPayment({
        method: '카드',
        amount,
        orderId,
        orderName: `[Nations Studio] ${planName} ${billingText}`,
        customerName: user.displayName || '스튜디오 회원',
        customerEmail: user.email || undefined,
        successUrl: `${hubBase}/payment/success?targetApp=studio&planId=${planId}&planName=${encodeURIComponent(planName)}&billingCycle=${cycle}&uid=${encodeURIComponent(user.uid)}&returnUrl=${encodeURIComponent(currentOriginUrl)}`,
        failUrl: `${hubBase}/payment/fail?returnUrl=${encodeURIComponent(currentOriginUrl)}`,
      });
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

  return (
    <div className="fixed inset-0 z-[100] bg-[#FAF9F5] text-[#2C2B29] overflow-y-auto select-text font-sans custom-scrollbar">
      {/* 1. 상단 고정 헤더: STUDIO NATIONS 로고 적용 */}
      <header className="sticky top-0 z-40 bg-[#FAF9F5]/95 backdrop-blur-md border-b border-[#E8E5DE] transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* 좌측 로고 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2.5 hover:opacity-85 transition-opacity cursor-pointer text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C96442] shadow-2xs">
                <Music className="w-4 h-4 stroke-[2px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-tight text-[#2C2B29] leading-tight">
                  STUDIO NATIONS
                </span>
                <span className="text-[10px] text-[#8C877D] font-medium tracking-wide">
                  찬양 악보 & 콘티 솔루션
                </span>
              </div>
            </button>
          </div>

          {/* 우측 네비게이션 및 돌아가기 버튼 */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hidden sm:inline-block text-xs font-medium text-[#6E6A63] hover:text-[#2C2B29] transition-colors px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              이용권 안내
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('studio-faq-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hidden sm:inline-block text-xs font-medium text-[#6E6A63] hover:text-[#2C2B29] transition-colors px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              자주 묻는 질문
            </button>

            {/* 현재 로그인 유저 정보 뱃지 */}
            {effectiveUser && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white border border-[#E8E5DE] rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-[#4A4741] max-w-[120px] truncate">
                  {effectiveUser.displayName || effectiveUser.email?.split('@')[0]}
                </span>
                <span className="text-[#8C877D]">|</span>
                <span className="text-[#C46A40] font-bold">
                  연동 완료
                </span>
              </div>
            )}

            {/* 스튜디오로 돌아가기 (닫기) 버튼: 로그인된 상태에서만 표시 */}
            {effectiveUser && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#F3EFE9] border border-[#DDD8CE] text-[#2C2B29] rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                title="악보 및 콘티 화면으로 돌아가기"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#6E6A63]" />
                <span>스튜디오로 돌아가기</span>
                <X className="w-3.5 h-3.5 text-[#8C877D] ml-1" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 최상단 히어로 & 로그인 섹션 */}
      <section ref={loginSectionRef} className="pt-12 pb-16 px-4 sm:px-6 max-w-4xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full flex flex-col items-center"
        >
          {/* 헤드카피 */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#1A1918] tracking-tight leading-tight mb-8 max-w-2xl">
            더 깊이 예배하고,<br />
            더 편리하게 준비하세요
          </h1>

          {/* 최상단 서브 문구 (3줄글 & 기능 소개 카드) */}
          <div className="mb-6 text-center text-xs sm:text-sm text-[#4A4741] leading-relaxed">
            <p className="font-semibold text-lg text-[#1C1A18] font-serif mb-2">Nations Studio</p>
            <div className="space-y-1 text-[#66625B]">
              <p><span className="font-bold text-[#1C1A18]">EASY</span> : 쉬워요!</p>
              <p><span className="font-bold text-[#1C1A18]">SIMPLE</span> : 필요한 기능만!</p>
              <p><span className="font-bold text-[#1C1A18]">LIGHT</span> : 부담없어요! 무료로 시작하는 찬양팀 콘티</p>
            </div>

            {/* 6줄 순차 타이핑 효과 영역 (모바일 및 데스크톱에서 글자 잘림 및 줄바꿈 없이 완벽 표시) */}
            <div className="mt-4 w-full max-w-[620px] h-[195px] min-h-[195px] max-h-[195px] mx-auto rounded-2xl border border-[#DA7756]/35 bg-white/95 px-3 sm:px-5 py-3 shadow-2xs flex flex-col justify-between items-center shrink-0 box-border overflow-hidden">
              <div className="w-full flex flex-col justify-between h-full">
                {typingLines.map((item, idx) => {
                  const charCount = displayedLengths[idx];
                  const fromLen = item.from.length;
                  const hasFrom = charCount > 0;
                  const hasArrow = charCount >= fromLen + 3;
                  const toTypedCount = Math.max(0, charCount - (fromLen + 4));

                  const fromText = item.from.slice(0, charCount);
                  const toText = item.to.slice(0, toTypedCount);

                  return (
                    <div
                      key={idx}
                      className="h-5 min-h-[20px] max-h-[20px] flex items-center justify-start gap-1 sm:gap-2 font-medium text-[10.5px] xs:text-[11.5px] sm:text-[12.5px] text-[#2C2B29] whitespace-nowrap"
                    >
                      <span
                        className={`shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all ${
                          hasFrom ? 'bg-[#1C1A18] text-white opacity-100 scale-100' : 'opacity-0 scale-75'
                        }`}
                      >
                        <Check className="w-2 h-2 stroke-[3px]" />
                      </span>

                      <span className="font-sans tracking-tight text-[#5A5751] shrink-0">
                        {fromText}
                      </span>

                      {hasArrow && (
                        <span className="inline-flex items-center text-[#1C1A18] shrink-0 font-bold px-0.5 animate-fadeIn">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3.5 h-3.5 inline-block"
                          >
                            <line x1="3" y1="12" x2="20" y2="12" />
                            <polyline points="15 7 20 12 15 17" />
                          </svg>
                        </span>
                      )}

                      {toTypedCount > 0 && (
                        <span className="font-semibold text-[#1C1A18] tracking-tight shrink-0">
                          {toText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 로그인 카드 컨테이너 */}
          <div className="w-full max-w-md bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-8 shadow-xs text-left">
            {effectiveUser ? (
              /* 이미 로그인된 상태 안내 카드 */
              <div className="flex flex-col items-center text-center gap-4 py-2">
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

                {/* 계정 상태 카드 */}
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
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
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
              /* 비로그인 시: 무료로 이용하기 (Google, 카카오, 네이버) 로그인 카드 */
              <div className="flex flex-col gap-4">
                <div className="text-center pb-1">
                  <h3 className="font-bold text-base text-[#1C1A18]">
                    무료로 이용하기
                  </h3>
                  <p className="text-xs text-[#6E6A63] mt-1 font-medium">
                    1초 만에 시작하는 스마트 찬양 콘티 솔루션
                  </p>
                </div>

                {/* 1. 구글로 계속하기 버튼 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-white hover:bg-[#FAF9F5] active:bg-[#F5F2EB] border border-[#DDD8CE] text-[#2C2B29] rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google로 계속하기</span>
                  {recentProvider === 'google' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F3EFEA] text-[#8C5E43] border border-[#E5DFD5]">
                      최근 로그인
                    </span>
                  )}
                </button>

                {/* 2. 카카오 로그인 버튼 */}
                <button
                  type="button"
                  onClick={() => startKakaoLogin('studio')}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-[#FEE500] hover:bg-[#FDD800] active:bg-[#F5D000] text-[#191919] rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#191919">
                    <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.78 1.884 5.217 4.716 6.578-.154.557-.991 3.588-1.028 3.816-.047.29.106.286.224.208.092-.06 3.658-2.482 5.134-3.489.312.031.63.047.954.047 5.523 0 10-3.463 10-7.735S17.523 3 12 3z" />
                  </svg>
                  <span>카카오로 1초 만에 시작하기</span>
                  {recentProvider === 'kakao' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/10 text-[#191919] border border-black/5">
                      최근 로그인
                    </span>
                  )}
                </button>

                {/* 3. 네이버 로그인 버튼 */}
                <button
                  type="button"
                  onClick={() => startNaverLogin('studio')}
                  disabled={isLoading}
                  className="relative w-full py-3.5 px-4 bg-[#03C75A] hover:bg-[#02B350] active:bg-[#029E46] text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <span className="font-black text-sm leading-none">N</span>
                  <span>네이버로 시작하기</span>
                  {recentProvider === 'naver' && (
                    <span className="absolute right-3 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white border border-white/20">
                      최근 로그인
                    </span>
                  )}
                </button>

                {/* 5. 법적 고지 */}
                <div className="pt-2 text-center">
                  <p className="text-[11px] text-[#8C877D] leading-relaxed">
                    계속 진행하면 STUDIO NATIONS의{' '}
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                      className="text-[#C46A40] underline hover:text-[#B55434] cursor-pointer font-medium"
                    >
                      개인정보처리방침
                    </button>
                    {' '}및{' '}
                    <button
                      type="button"
                      onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                      className="text-[#C46A40] underline hover:text-[#B55434] cursor-pointer font-medium"
                    >
                      이용약관
                    </button>
                    에 동의하는 것으로 간주됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* 3. 이용권 살펴보기 섹션 */}
      <section ref={pricingSectionRef} className="py-16 px-4 sm:px-6 bg-[#F5F2EB]/50 border-t border-[#E8E5DE]">
        <div className="max-w-6xl mx-auto">
          {/* 섹션 타이틀 */}
          <div className="text-center max-w-xl mx-auto mb-10">
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

            {/* 2. SOLO 플랜 (찬양인도자용) */}
            <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xl font-bold text-[#1A1918]">SOLO 플랜</h3>
                  <span className="text-[11px] text-[#DA7756] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">찬양인도자용</span>
                </div>
                <p className="text-xs text-[#8C877D] mb-4">개인 찬양인도자를 위한 완벽한 콘티 솔루션</p>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩3,900</span>
                    <span className="text-xs text-[#8C877D]">/ 월</span>
                  </div>
                  <div className="text-xs text-[#DA7756] font-medium mt-0.5">연간 ₩39,000 (약 17% 절약)</div>
                </div>

                <button
                  onClick={() => handlePlanAction('SOLO 플랜')}
                  className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                >
                  플랜 신청하기
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

            {/* 3. TEAM 플랜 (찬양팀을 운영하는 리더, 팀장 / 추천 플랜) */}
            <div className="bg-white border-2 border-[#D97757] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D97757] text-white px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-2xs">
                추천 플랜
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xl font-bold text-[#1A1918]">TEAM 플랜</h3>
                  <span className="text-[11px] text-[#C46A40] font-semibold bg-[#FAF0EB] px-2 py-0.5 rounded-full border border-[#F1D3C6]">리더 · 팀장용</span>
                </div>
                <p className="text-xs text-[#8C877D] mb-4">찬양팀을 운영하는 리더와 팀원을 위한 원스톱 협업</p>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-serif font-bold text-[#C46A40]">₩9,900</span>
                    <span className="text-xs text-[#8C877D]">/ 월</span>
                  </div>
                  <div className="text-xs text-[#DA7756] font-medium mt-0.5">연간 ₩99,000 (약 17% 절약)</div>
                </div>

                <button
                  onClick={() => handlePlanAction('TEAM 플랜')}
                  className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                >
                  플랜 신청하기
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
                언제든 충전 가능
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. 클라우드 요금제 (악보 1000) */}
              <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[#5A564F] uppercase tracking-wider bg-[#F5F3ED] px-2.5 py-0.5 rounded-full">
                      클라우드 요금제
                    </span>
                    <span className="text-xs text-[#8C877D]">매월 정기결제</span>
                  </div>
                  <h4 className="text-xl font-bold text-[#1A1918] mb-1">악보 1000</h4>
                  <p className="text-xs text-[#8C877D] mb-4">
                    악보가 더 필요한 찬양팀을 위한 대용량 추가 저장 옵션
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-5 pb-4 border-b border-[#EFECE6]">
                    <span className="text-3xl font-serif font-bold text-[#2C2B29]">₩3,000</span>
                    <span className="text-xs text-[#8C877D]">/ 월</span>
                    <span className="text-xs text-[#DA7756] font-medium ml-2">(매월 3천원)</span>
                  </div>

                  <ul className="text-xs text-[#6E6A63] space-y-2.5 mb-6">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span><strong>악보 1000개 저장</strong> (네이션스 클라우드 안전 보관)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>기존 이용 플랜에 1000곡 용량 즉시 추가 누적</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>위약금 없이 언제든 자유롭게 변경 및 해지 가능</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handlePlanAction('클라우드 요금제 (악보 1000)')}
                  className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  악보 1000 추가 신청하기
                </button>
              </div>

              {/* 2. AI 크레딧 요금제 */}
              <div className="bg-white border-2 border-[#D97757]/40 rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[#C46A40] uppercase tracking-wider bg-[#FAF0EB] px-2.5 py-0.5 rounded-full border border-[#F1D3C6]">
                      AI 크레딧 요금제
                    </span>
                    <span className="text-xs text-[#C46A40] font-semibold">단회 결제 충전</span>
                  </div>
                  <h4 className="text-xl font-bold text-[#1A1918] mb-1">AI 분석 100회</h4>
                  <p className="text-xs text-[#8C877D] mb-4">
                    AI 악보 인식, 가사/코드 자동 추출, 스마트 송폼 빌더
                  </p>

                  <div className="flex items-baseline gap-1.5 mb-5 pb-4 border-b border-[#EFECE6]">
                    <span className="text-3xl font-serif font-bold text-[#C46A40]">₩5,000</span>
                    <span className="text-xs text-[#8C877D]">/ 100회</span>
                    <span className="text-xs text-[#DA7756] font-medium ml-2">(단회 5천원 결제)</span>
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
                  onClick={() => handlePlanAction('AI 크레딧 요금제 (100회)')}
                  className="w-full py-2.5 px-4 bg-[#C46A40] hover:bg-[#A8532D] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  AI 분석 100회 충전하기
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

      {/* 4. 자주 묻는 질문 (FAQ) 아코디언 섹션 */}
      <section id="studio-faq-section" className="py-16 px-4 sm:px-6 max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1918] text-center mb-8">
          자주 묻는 질문
        </h2>

        <div className="divide-y divide-[#E8E5DE] border-t border-b border-[#E8E5DE]">
          {faqs.map((faq, idx) => {
            const isOpenFaq = openFaqIndex === idx;
            return (
              <div key={idx} className="py-4">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpenFaq ? null : idx)}
                  className="w-full flex items-center justify-between text-left gap-4 py-2 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-bold text-[#1A1918]">
                    {faq.q}
                  </span>
                  <span className="text-xl text-[#8C877D] font-light shrink-0">
                    {isOpenFaq ? '−' : '+'}
                  </span>
                </button>

                {isOpenFaq && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-2 pb-3 text-xs sm:text-sm text-[#6E6A63] leading-relaxed"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. 최하단 푸터: 네이션스 스튜디오 공식 로고 및 우리회사 제품들 링크 */}
      <footer className="pt-12 pb-16 px-4 sm:px-6 bg-[#FAF9F5] border-t border-[#E8E5DE] text-xs">
        <div className="max-w-6xl mx-auto">
          {/* 고객지원 문의 박스 */}
          <div className="mb-12 max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C96442]">
                <Music className="w-3 h-3 stroke-[2px]" />
              </div>
              <span className="font-serif font-bold text-[#1A1918] text-sm">STUDIO NATIONS Support</span>
            </div>
            <a
              href="http://pf.kakao.com/_cxjBxaX/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-white border border-[#DDD8CE] hover:border-[#2C2B29] rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xs cursor-pointer transition-colors block text-left"
              title="카카오톡 1:1 문의하기"
            >
              <span className="text-xs text-[#8C877D]">
                찬양팀 세팅이나 악보 연동에 도움이 필요하신가요? 카카오톡 1:1 상담하기...
              </span>
              <div className="w-7 h-7 rounded-xl bg-[#FEE500] text-[#3C1E1E] flex items-center justify-center shrink-0 shadow-2xs">
                <Send className="w-3.5 h-3.5" />
              </div>
            </a>
          </div>

          {/* 4단 링크 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">제품 (Products)</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <a
                    href="https://bible.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS BIBLE (성경)
                  </a>
                </li>
                <li>
                  <button onClick={onClose} className="hover:text-[#2C2B29] hover:underline cursor-pointer text-left">
                    NATIONS STUDIO (찬양)
                  </button>
                </li>
                <li>
                  <a
                    href="https://sermon.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS SERMON VIDEO
                  </a>
                </li>
                <li>
                  <a
                    href="https://vote.thenations.kr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    NATIONS VOTE
                  </a>
                </li>
                <li>
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS CHURCH
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">이용권 & 플랜</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    SOLO 플랜
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    TEAM 플랜
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handlePlanAction('Free 플랜', true)}
                    className="hover:text-[#C46A40] font-semibold cursor-pointer"
                  >
                    무료 플랜 혜택
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">고객지원센터</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <a
                    href="http://pf.kakao.com/_cxjBxaX/chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer block"
                  >
                    1:1 카톡 문의하기
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => {
                      const el = document.getElementById('studio-faq-section');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    자주 묻는 질문 (FAQ)
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'business' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    사업자 정보 확인
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-bold text-[#2C2B29] text-xs mb-3.5">법률 및 정책</h5>
              <ul className="space-y-2.5 text-[#6E6A63]">
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    서비스 이용약관
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                    className="hover:text-[#2C2B29] hover:underline cursor-pointer"
                  >
                    개인정보 처리방침
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* 전자상거래법 및 PG사 심사 기준 준수 사업자 정보 표기 */}
          <div className="pt-6 border-t border-[#E8E5DE] text-[11px] leading-relaxed text-[#8C877D] space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>상호명: <strong className="text-[#5A564F]">네이션스 솔루션</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>대표자: <strong className="text-[#5A564F]">최희정</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>사업자등록번호: <strong className="text-[#5A564F] font-mono">120-00-00000</strong></span>
              <span className="text-[#D6D2C9]">|</span>
              <span>통신판매업신고: <strong className="text-[#5A564F]">제 2026-경남창원-00000 호</strong></span>
            </div>
            <div>
              <span>사업장 소재지: <strong className="text-[#5A564F]">창원시 마산합포구 산호시장길 40</strong></span>
            </div>
          </div>

          {/* 하단 카피라이트 및 법적 고지 */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#8C877D]">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#FAF0EB] border border-[#F1D3C6] flex items-center justify-center text-[#C96442]">
                <Music className="w-2.5 h-2.5 stroke-[2px]" />
              </div>
              <span>© {new Date().getFullYear()} STUDIO NATIONS. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPolicyModal({ isOpen: true, tab: 'terms' })}
                className="hover:text-[#2C2B29] cursor-pointer"
              >
                이용약관
              </button>
              <button
                onClick={() => setPolicyModal({ isOpen: true, tab: 'privacy' })}
                className="hover:text-[#2C2B29] cursor-pointer"
              >
                개인정보처리방침
              </button>
              {effectiveUser && (
                <button
                  onClick={onClose}
                  className="text-[#2C2B29] font-bold hover:underline cursor-pointer"
                >
                  스튜디오로 복귀 →
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* 이용약관 & 개인정보 처리방침 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal({ isOpen: false, tab: 'terms' })}
      />

    </div>
  );
};
