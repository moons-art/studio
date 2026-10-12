import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Check,
  CreditCard,
  Send,
  ArrowLeft,
  Music,
  Users,
  FolderSync,
  Share2,
  Smartphone
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  type User
} from 'firebase/auth';
import { auth } from '../api/firebaseConfig';
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
  // 로그인/회원가입 상태
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [displayName, setDisplayName] = useState('');
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

  // 섹션 참조 (요금제 바로 스크롤용)
  const pricingSectionRef = useRef<HTMLDivElement>(null);
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 페이지 열릴 때 지정된 섹션으로 자동 스크롤
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
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

  // 리다이렉트 로그인 결과 자동 감지 (구글 로그인 완료 후 복귀 시 자동 닫힘)
  useEffect(() => {
    let isMounted = true;
    const checkRedirect = async () => {
      try {
        const { processRedirectResult } = await import('../api/gdriveWebService');
        const restored = await processRedirectResult();
        if (restored && isMounted) {
          if (onSuccess) onSuccess();
          onClose();
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
        await gdriveWebService.getNationsRootFolderId();
        await gdriveWebService.getAppFolderId('Nations Studio');
        setTimeout(() => window.dispatchEvent(new Event('gdrive_authenticated')), 500);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMsg('로그인 창이 닫혔거나 구글 인증이 완료되지 않았습니다.');
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

  // 비밀번호 재설정 발송
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('비밀번호를 재설정할 이메일 주소를 입력해주세요.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg('비밀번호 재설정 이메일이 발송되었습니다! 메일함(또는 스팸함)의 링크를 확인해주세요.');
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setErrorMsg('등록되지 않은 이메일 주소입니다.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('올바른 이메일 형식이 아닙니다.');
      } else {
        setErrorMsg('이메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 이메일 로그인 / 회원가입
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (tab === 'signup' && password !== passwordConfirm) {
      setErrorMsg('비밀번호와 비밀번호 확인이 서로 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (tab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        alert('회원가입이 완료되었습니다! 환영합니다.');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error('[ClaudeAuthPage] Email auth error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('이미 등록된 이메일 주소입니다. 로그인을 진행해주세요.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('이메일 또는 비밀번호가 일치하지 않습니다.');
      } else if (err.code === 'auth/user-not-found') {
        setErrorMsg('등록되지 않은 이메일입니다. 회원가입을 진행해주세요.');
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('올바른 이메일 형식이 아닙니다.');
      } else {
        setErrorMsg('인증 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 플랜 액션 핸들러
  const handlePlanAction = (planName: string, isFreePlan = false) => {
    if (isFreePlan) {
      onClose();
      return;
    }

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
      q: '구글 드라이브(Google Drive) 연동은 왜 필요한가요?',
      a: '사용자의 악보와 콘티 데이터를 본인의 구글 드라이브(무료)에 안전하게 보관하기 위함입니다. 앱은 사용자의 악보를 안전하게 구글드라이브에 저장하여 모든 기기에서 실시간으로 악보와 콘티를 불러올수 있습니다.'
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

            {/* 스튜디오로 돌아가기 (닫기) 버튼 */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white hover:bg-[#F3EFE9] border border-[#DDD8CE] text-[#2C2B29] rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="악보 및 콘티 화면으로 돌아가기"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#6E6A63]" />
              <span>스튜디오로 돌아가기</span>
              <X className="w-3.5 h-3.5 text-[#8C877D] ml-1" />
            </button>
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
                    {effectiveUser.email || '구글 계정'}으로 로그인되어 있습니다.
                  </p>
                </div>

                {/* 계정 상태 카드 */}
                <div className="w-full p-4 bg-[#FAF9F5] border border-[#E8E5DE] rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex flex-col text-left">
                    <span className="text-[#8C877D]">구글 드라이브 연동</span>
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
              /* 비로그인 시: Google 및 이메일 로그인 카드 */
              <div className="flex flex-col gap-4">
                {/* 1. 구글로 계속하기 버튼 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-white hover:bg-[#FAF9F5] active:bg-[#F5F2EB] border border-[#DDD8CE] text-[#2C2B29] rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google로 계속하기</span>
                </button>

                {/* 2. 구분선 '또는' */}
                <div className="relative flex items-center justify-center my-1">
                  <div className="border-t border-[#E8E5DE] w-full" />
                  <span className="bg-white px-3 text-xs text-[#8C877D] font-normal shrink-0">
                    또는
                  </span>
                </div>

                {/* 3. 이메일로 계속하기 버튼 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailAuth(!showEmailAuth);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full py-3.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] active:bg-black text-white rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Mail className="w-4 h-4 text-white/80" />
                  <span>이메일로 계속하기</span>
                  {showEmailAuth ? (
                    <ChevronUp className="w-3.5 h-3.5 text-white/80" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-white/80" />
                  )}
                </button>

                {/* 4. 이메일 폼 상세 영역 */}
                {showEmailAuth && (
                  <div className="flex flex-col gap-3 pt-2">
                    {isResetMode ? (
                      <div className="flex flex-col gap-3 bg-[#FAF9F5] p-4 rounded-2xl border border-[#E8E5DE]">
                        <div className="flex items-center gap-2 text-[#2C2B29]">
                          <KeyRound className="w-4 h-4 text-[#C46A40]" />
                          <h4 className="font-bold text-xs">비밀번호 재설정 링크 발송</h4>
                        </div>
                        <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                          가입하신 이메일 주소를 입력하시면 비밀번호를 안전하게 재설정할 수 있는 링크를 보내드립니다.
                        </p>

                        {errorMsg && (
                          <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMsg}</span>
                          </div>
                        )}
                        {successMsg && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{successMsg}</span>
                          </div>
                        )}

                        <form onSubmit={handlePasswordReset} className="flex flex-col gap-2.5">
                          <input
                            type="email"
                            placeholder="가입 이메일 주소"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="flex-1 py-2 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                            >
                              발송하기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsResetMode(false);
                                setErrorMsg(null);
                                setSuccessMsg(null);
                              }}
                              className="px-3 py-2 bg-white border border-[#DDD8CE] text-[#6E6A63] rounded-xl text-xs font-medium cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <>
                        <div className="flex bg-[#F0EEE6] p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setTab('login');
                              setPasswordConfirm('');
                              setErrorMsg(null);
                              setSuccessMsg(null);
                            }}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                              tab === 'login' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'
                            }`}
                          >
                            로그인
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTab('signup');
                              setPasswordConfirm('');
                              setErrorMsg(null);
                              setSuccessMsg(null);
                            }}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                              tab === 'signup' ? 'bg-white text-[#2C2B29] shadow-2xs' : 'text-[#8C877D] hover:text-[#2C2B29]'
                            }`}
                          >
                            간편 회원가입
                          </button>
                        </div>

                        {errorMsg && (
                          <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMsg}</span>
                          </div>
                        )}

                        <form onSubmit={handleEmailAuth} className="flex flex-col gap-2.5">
                          {tab === 'signup' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">
                                이름 <span className="text-[#C46A40]">(사역자/이용자명)</span>
                              </label>
                              <input
                                type="text"
                                placeholder="홍길동"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                required
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">이메일</label>
                            <input
                              type="email"
                              placeholder="user@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                              required
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-[#6E6A63]">비밀번호</label>
                              {tab === 'login' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsResetMode(true);
                                    setErrorMsg(null);
                                  }}
                                  className="text-[10px] text-[#C46A40] hover:underline cursor-pointer"
                                >
                                  비밀번호 찾기
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 pr-9 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-2.5 text-[#8C877D] hover:text-[#2C2B29]"
                              >
                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {tab === 'signup' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-[#6E6A63] mb-1">비밀번호 확인</label>
                              <div className="relative">
                                <input
                                  type={showPasswordConfirm ? 'text' : 'password'}
                                  placeholder="••••••••"
                                  value={passwordConfirm}
                                  onChange={(e) => setPasswordConfirm(e.target.value)}
                                  className="w-full bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl px-3.5 py-2 pr-9 text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                                  className="absolute right-2.5 top-2.5 text-[#8C877D] hover:text-[#2C2B29]"
                                >
                                  {showPasswordConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={isLoading}
                            className="mt-1 w-full py-2.5 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-semibold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <span>{tab === 'login' ? '이메일로 로그인' : '가입 완료하기'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}

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
                      <span>예배 콘티 작성</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                      <span>악보 수정 및 콘티 프린트</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                      <span>콘티 악보 찬양팀, 회중 링크 공유</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#8C877D] shrink-0 mt-0.5" />
                      <span>개인 기기 로컬 저장</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 2. SOLO 플랜 */}
            <div className="bg-white border border-[#E8E5DE] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
              <div>
                <h3 className="text-xl font-bold text-[#1A1918] mb-4">SOLO 플랜</h3>

                <div className="mb-6">
                  <div className="text-3xl font-serif font-bold text-[#2C2B29]">₩15,000</div>
                  <div className="text-xs text-[#8C877D] mt-0.5">월간 이용권</div>
                </div>

                <button
                  onClick={() => handlePlanAction('SOLO 플랜')}
                  className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                >
                  플랜 신청하기
                </button>

                <div className="border-t border-[#EFECE6] pt-4">
                  <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">Free플랜 + 포함된 혜택:</span>
                  <ul className="text-xs text-[#6E6A63] space-y-2.5">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>구글 드라이브 자동 동기화</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>찬양 앨범 추가 기능</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>콘티 저장 기능</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>악보 마다 카피곡 유튜브 링크 저장</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>모든 기기에서 악보, 콘티 실시간 연동</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 3. TEAM 플랜 (추천 플랜) */}
            <div className="bg-white border-2 border-[#D97757] rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-md relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D97757] text-white px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-2xs">
                추천 플랜
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#1A1918] mb-4">TEAM 플랜</h3>

                <div className="mb-6">
                  <div className="text-3xl font-serif font-bold text-[#C46A40]">₩25,000</div>
                  <div className="text-xs text-[#8C877D] mt-0.5">월간 이용권</div>
                </div>

                <button
                  onClick={() => handlePlanAction('TEAM 플랜')}
                  className="w-full py-2.5 px-4 bg-[#2C2B29] hover:bg-[#1A1918] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer mb-6"
                >
                  플랜 신청하기
                </button>

                <div className="border-t border-[#EFECE6] pt-4">
                  <span className="text-[11px] font-bold text-[#5A564F] block mb-2.5">SOLO 플랜+포함된 혜택:</span>
                  <ul className="text-xs text-[#6E6A63] space-y-2.5">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>찬양팀 공유 기능</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>찬양팀 악보, 송폼 공유</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#C46A40] shrink-0 mt-0.5" />
                      <span>찬양팀 톡 교제</span>
                    </li>
                  </ul>
                </div>
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
                  <span className="hover:text-[#2C2B29] cursor-pointer">
                    NATIONS VOTE
                  </span>
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

          {/* 하단 카피라이트 및 법적 고지 */}
          <div className="pt-6 border-t border-[#E8E5DE] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#8C877D]">
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
              <button
                onClick={onClose}
                className="text-[#2C2B29] font-bold hover:underline cursor-pointer"
              >
                스튜디오로 복귀 →
              </button>
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
