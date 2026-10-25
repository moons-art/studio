import React, { useState, useEffect } from 'react';
import { HymnalProvider, useHymnal } from './stores/HymnalProvider';
import { HymnalModule } from './components/Hymnal/HymnalModule';
import { HymnalSidebar } from './components/Hymnal/HymnalSidebar';
import { ContiEditor } from './components/Hymnal/ContiEditor';
import { MobilePdfLayout } from './components/Hymnal/MobilePdfLayout';
import { TeamShareWindow } from './components/Hymnal/TeamShareWindow';
import { CongregationViewer } from './components/Hymnal/CongregationViewer';
import { TooltipIcon } from './components/TooltipIcon';
import { PanelLeft, Music, Settings, X, WifiOff, Library, Layout, RotateCcw, HelpCircle, Share2, CreditCard, Gift, User as UserIcon, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { initGoogleApi, IS_LOCAL_DEV } from './api/gdriveWebService';
import { auth } from './api/firebaseConfig';
import { startKakaoLogin, startNaverLogin, processOAuthCallback, syncUserWithHub, getSocialUserMeta } from './utils/socialAuth';
import { logActivity } from './utils/logger';
import { ClaudeAuthPage } from './components/ClaudeAuthPage';
import { InviteBonusModal } from './components/InviteBonusModal';
import { AccountModal } from './components/AccountModal';
import { PolicyViewModal, type PolicyModalType } from './components/PolicyViewModal';

const AdminModal = React.lazy(() => import('./components/AdminModal').then(m => ({ default: m.AdminModal })));

const MainApp: React.FC = () => {
  // URL 파라미터 확인 (PDF 인쇄 모드, 찬양팀 공유 모드, 회중 뷰어 모드)
  const params = new URLSearchParams(window.location.search);
  const isPrintMode = params.get('mode') === 'print-pdf';
  const isTeamShareMode = params.get('mode') === 'team-share' || params.get('view') === 'team';
  const isCongregationMode = params.get('mode') === 'congregation' || params.get('view') === 'congregation';
  const initialContiId = params.get('contiId');

  if (isPrintMode) {
    return <MobilePdfLayout />;
  }

  if (isTeamShareMode) {
    return <TeamShareWindow initialContiId={initialContiId} />;
  }

  if (isCongregationMode) {
    return <CongregationViewer initialContiId={initialContiId} />;
  }

  // 구글 API 초기화
  const [, setIsApiLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(IS_LOCAL_DEV);
  const [userProfile, setUserProfile] = useState<{name: string, email: string, picture: string} | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminInitialAuth, setAdminInitialAuth] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [authPageSection, setAuthPageSection] = useState<'login' | 'pricing'>('login');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('studio-left-sidebar-width');
    return saved ? parseInt(saved, 10) : 230;
  });
  const [isResizingLeftSidebar, setIsResizingLeftSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isTeamShareOpen, setIsTeamShareOpen] = useState(false);
  const [showTeamNameModal, setShowTeamNameModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; tab: PolicyModalType }>({
    isOpen: false,
    tab: 'terms'
  });
  const [worshipTeamNameDraft, setWorshipTeamNameDraft] = useState(() => {
    return localStorage.getItem('nations-worship-team-name') || localStorage.getItem('ceum-worship-team-name') || 'NATIONS 찬양팀';
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingLeftSidebar) return;
      const newWidth = e.clientX;
      if (newWidth < 120) {
        setIsSidebarOpen(false);
        setIsResizingLeftSidebar(false);
      } else {
        const clampedWidth = Math.min(Math.max(newWidth, 180), 400);
        setLeftSidebarWidth(clampedWidth);
        localStorage.setItem('studio-left-sidebar-width', clampedWidth.toString());
      }
    };

    const handleMouseUp = () => {
      if (isResizingLeftSidebar) {
        setIsResizingLeftSidebar(false);
      }
    };

    if (isResizingLeftSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeftSidebar]);

  const { 
    isEditorOpen, 
    setIsEditorOpen, 
    isLibraryOpen, 
    setIsLibraryOpen, 
    clearConti, 
    contiItems, 
    showAllTooltips, 
    setShowAllTooltips,
    isSyncing,
    uploadProgress,
    isListOpen
  } = useHymnal();

  // 로컬 캐시 용량 상태
  const [cacheSize, setCacheSize] = useState<string>('계산 중...');
  const updateCacheSize = async () => {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usageMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
        setCacheSize(`${usageMB} MB`);
      } else {
        setCacheSize('지원 불가 (브라우저 제한)');
      }
    } catch {
      setCacheSize('계산 실패');
    }
  };

  useEffect(() => {
    if (showSettings) {
      updateCacheSize();
    }
  }, [showSettings]);

  useEffect(() => {
    processOAuthCallback(auth).then((res) => {
      if (res && !res.success && res.error) {
        alert(res.error);
      }
    }).catch((err) => {
      console.warn('[App] processOAuthCallback warning:', err);
    });

    // 토스페이먼츠 결제 승인 완료 후 복귀 감지 (?payment=success)
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('payment') === 'success') {
        const plan = sp.get('plan') || 'solo';
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('payment');
        cleanUrl.searchParams.delete('plan');
        cleanUrl.searchParams.delete('orderId');
        window.history.replaceState({}, '', cleanUrl.toString());

        const user = auth.currentUser;
        if (user) {
          import('firebase/firestore').then(({ doc, setDoc }) => {
            import('./api/firebaseConfig').then(({ db }) => {
              setDoc(doc(db, 'users', user.uid), {
                plan,
                subscribedAt: Date.now(),
              }, { merge: true }).catch(console.warn);
            });
          });
        }
        alert(`🎉 결제가 성공적으로 승인되었습니다!\n[${plan.toUpperCase()}] 플랜 권한이 즉시 적용되었습니다.`);
      }
    }

    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const socialMeta = getSocialUserMeta(user);
        const resolvedEmail = user.email || socialMeta?.email || '';
        const resolvedName = user.displayName || socialMeta?.displayName || resolvedEmail.split('@')[0] || '사용자';
        const resolvedPhoto = user.photoURL || socialMeta?.photoURL || '';
        setIsAuthenticated(true);
        setUserProfile({
          name: resolvedName,
          email: resolvedEmail,
          picture: resolvedPhoto,
        });
        // 카카오/네이버 로그인 시에도 오프라인 프로필 및 활동 로그(logActivity)가 정상 동작하도록 보장
        if (!localStorage.getItem('gdrive_token')) {
          try {
            localStorage.setItem('offline_user_profile', JSON.stringify({
              id: user.uid,
              name: resolvedName,
              email: resolvedEmail,
              picture: resolvedPhoto,
            }));
          } catch (e) {}
          logActivity('로그인');
        }
        syncUserWithHub(user, 'studio').catch(() => {});
      }
    });

    initGoogleApi(() => {
      console.log('[App] Google API successfully initialized.');
      setIsApiLoaded(true);
    });

    const handleAuth = async () => {
      setIsAuthenticated(true);
      const { gdriveWebService, fetchUserProfile } = await import('./api/gdriveWebService');
      const token = gdriveWebService.getAccessToken();
      if (token && token !== 'mock_local_token_123') {
        const profile = await fetchUserProfile(token);
        if (profile) {
          setUserProfile(profile);
          const { logActivity } = await import('./utils/logger');
          logActivity('로그인');
          // 폴더 구조 점검 및 New Folder / 비정상 파일 자동 정리 실행
          gdriveWebService.ensureNationsFolders().catch(console.warn);
        }
      }
    };

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('gdrive_authenticated', handleAuth);
    
    return () => {
      window.removeEventListener('gdrive_authenticated', handleAuth);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubAuth();
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#FAF9F5] text-[#2C2B29] overflow-y-auto overflow-x-hidden font-sans custom-scrollbar relative">

      {/* Sidebar */}
      {/* Sidebar Overlay (Drawer) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop: 사이드바 외부 클릭 시 닫힘 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[0.5px]"
            />

            {/* Sidebar Drawer: 메인 창 위로 슬라이드 인 (메인 창 레이아웃 밀림 방지) */}
            <motion.aside
              initial={{ x: -leftSidebarWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -leftSidebarWidth, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              style={{ width: `${leftSidebarWidth}px` }}
              className="fixed top-0 left-0 bottom-0 z-50 border-r border-[#EBE6DF] bg-[#FBF9F7] shadow-2xl group/sidebar select-none flex flex-col"
            >
              {/* Claude Style Resize Border Handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingLeftSidebar(true);
                }}
                className={`
                  absolute -right-2 top-0 bottom-0 w-4 z-50 cursor-col-resize flex items-center justify-center group/resizer transition-all
                  ${isResizingLeftSidebar ? 'opacity-100' : 'opacity-0 hover:opacity-100'}
                `}
                title="드래그하여 너비 조절"
              >
                <div className={`w-0.5 h-full transition-colors ${isResizingLeftSidebar ? 'bg-[#D97757]' : 'bg-[#D97757]/70 group-hover/resizer:bg-[#D97757]'}`} />
              </div>

              <div className="p-3.5 h-full flex flex-col w-full overflow-x-hidden text-[#4A4741]">
                {/* Header: NATIONS STUDIO 로고 & 닫기 버튼 */}
                <div className="flex items-center justify-between mb-3 px-1.5 pt-1 pb-2 border-b border-[#F0EBE1]">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src="/icon.png" 
                      alt="NATIONS STUDIO" 
                      className="w-7 h-7 rounded-lg object-contain shadow-2xs border border-[#F0EBE1]"
                    />
                    <div className="flex flex-col">
                      <span className="font-serif font-bold text-base text-[#2B2927] tracking-tight leading-tight">NATIONS</span>
                      <span className="font-serif font-bold text-base text-[#2B2927] tracking-tight leading-tight">STUDIO</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      onMouseEnter={() => setIsSidebarOpen(false)}
                      className="p-1 rounded-lg hover:bg-[#EBE5DC] text-[#6E6A63] hover:text-[#2B2927] transition-colors cursor-pointer"
                      title="사이드바 닫기"
                    >
                      <X className="w-4 h-4 stroke-[2px]" />
                    </button>
                  </div>
                </div>

              {/* Hymnal Sidebar Content */}
              <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                <HymnalSidebar />
              </div>

              {/* 최하단: 플랜, 친구초대, 프로필, 계정, 푸터 영역 (SERMON 앱과 동일 레이아웃) */}
              <div className="mt-auto pt-2 border-t border-[#F0EBE1] space-y-1.5 shrink-0 bg-[#FAF9F6] p-1.5 rounded-2xl">
                {/* 1. 플랜 이름 & 플랜 업그레이드 */}
                <div className="flex items-center justify-between px-2 pt-1">
                  <span className="text-xs font-bold text-[#1C1A18]">무료 플랜</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPageSection('pricing');
                      setShowAuthModal(true);
                      setIsSidebarOpen(false);
                    }}
                    className="text-[11px] font-bold text-[#DA7756] hover:text-[#C46A40] hover:underline cursor-pointer"
                  >
                    플랜 업그레이드
                  </button>
                </div>

                {/* 2. 친구 초대 1+1 보너스 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(true);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-[#F3EFE9] transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Gift className="w-4 h-4 text-[#DA7756] shrink-0" />
                    <span className="text-xs font-semibold text-[#2C2B29] group-hover:text-[#DA7756] truncate">
                      친구 초대 1+1 보너스
                    </span>
                  </div>
                </button>

                                <div className="border-t border-[#EAE8E1] my-1" />

                {/* 3. 사용자 프로필 박스 (or 로그인/간편가입) */}
                {!isAuthenticated ? (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setAuthPageSection('login');
                        setShowAuthModal(true);
                        setIsSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-2 py-2 px-2.5 bg-[#F3EFE9]/70 border border-[#E5E0D8] text-[#4A4741] rounded-xl hover:bg-[#EBE5DC] transition-all group cursor-pointer shadow-2xs"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <span className="text-xs font-semibold text-[#4A4741]">로그인 / 간편가입</span>
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => startKakaoLogin('studio')}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] rounded-xl text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="#191919">
                          <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.78 1.884 5.217 4.716 6.578-.154.557-.991 3.588-1.028 3.816-.047.29.106.286.224.208.092-.06 3.658-2.482 5.134-3.489.312.031.63.047.954.047 5.523 0 10-3.463 10-7.735S17.523 3 12 3z" />
                        </svg>
                        <span>카카오</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startNaverLogin('studio')}
                        className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#03C75A] hover:bg-[#02B350] text-white rounded-xl text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="font-black text-[11px] leading-none">N</span>
                        <span>네이버</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-[#F3EFE9]/70 border border-[#E8E2D9] p-1.5 rounded-xl">
                    <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-1">
                      {userProfile?.picture ? (
                        <img src={userProfile.picture} alt="Profile" className="w-6 h-6 rounded-full shrink-0 border border-[#E5E0D8]" />
                      ) : (
                        <div className="w-6 h-6 bg-[#EBE5DC] text-[#4A4741] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                          {userProfile?.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-normal text-[#2B2927] truncate">
                          {userProfile?.name || '사용자'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAdminInitialAuth(true);
                            setShowAdminModal(true);
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold text-[#6E6A63] hover:text-white bg-[#EBE5DC] hover:bg-neutral-900 border border-[#DDD8CE] hover:border-neutral-900 rounded-md transition-all cursor-pointer shadow-2xs flex items-center gap-0.5"
                          title="관리자 대시보드 열기"
                        >
                          <ShieldCheck className="w-2.5 h-2.5 stroke-[2.5px]" />
                          admin
                        </button>
                        {isOffline && (
                          <WifiOff className="w-3 h-3 text-[#D97757] shrink-0 stroke-[1.5px]" title="오프라인 모드" />
                        )}
                      </div>
                    </div>
                    <button
                      disabled={isSyncing}
                      onClick={async () => {
                        if (isSyncing) {
                          alert('악보 업로드가 진행 중입니다. 업로드가 완료된 후 로그아웃해 주세요.');
                          return;
                        }
                        if (confirm('로그아웃 하시겠습니까?')) {
                          const { gdriveWebService } = await import('./api/gdriveWebService');
                          await gdriveWebService.logout();
                          window.location.reload();
                        }
                      }}
                      className={`px-2 py-0.5 text-[10px] font-normal transition-all rounded-md border shrink-0 ${
                        isSyncing 
                          ? 'opacity-40 text-neutral-400 bg-neutral-100 border-neutral-200 cursor-not-allowed'
                          : 'text-[#D97757] bg-[#F7EEE9] hover:bg-[#F2DFD5] border-[#F0DCD3] cursor-pointer'
                      }`}
                      title={isSyncing ? "악보 업로드 중에는 로그아웃할 수 없습니다." : "로그아웃"}
                    >
                      로그아웃
                    </button>
                  </div>
                )}

                {/* 4. 계정 버튼 (클릭 시 계정 모달 오픈) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountModal(true);
                    setIsSidebarOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 w-full rounded-xl text-xs font-normal text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] transition-all cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 stroke-[1.5px] text-[#6E6A63]" />
                  <span className="text-xs font-normal">계정</span>
                </button>
              </div>
            </div>
          </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - 플랫한 에디토리얼 상단바 (카드 스타일 X, 아이콘+글자) */}
        <header className="min-h-12 border-b border-[#E7E5DF] flex items-center px-3 md:px-5 py-2 gap-4 bg-white/95 backdrop-blur-md sticky top-0 z-30 overflow-x-auto custom-scrollbar flex-row relative">
          {/* 사이드바 토글 버튼 (악보목록이 열렸을 때 악보뷰 패널 상단 왼쪽으로 부드럽게 이동) */}
          <div 
            style={{ 
              marginLeft: isListOpen ? 'clamp(260px, 22vw, 320px)' : '0px' 
            }}
            className="flex items-center gap-1 shrink-0 transition-all duration-300 ease-in-out"
          >
            <button 
              onClick={() => setIsSidebarOpen(prev => !prev)}
              onMouseEnter={() => { if (!isSidebarOpen) setIsSidebarOpen(true); }}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isSidebarOpen 
                  ? 'bg-[#FAF0EB] text-[#C96442]' 
                  : 'hover:bg-[#F3EFE9] text-[#6E6A63] hover:text-[#2B2927]'
              }`}
              title={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기 (마우스를 올리면 열립니다)"}
            >
              <PanelLeft className="w-[21px] h-[21px] stroke-[1.8px]" />
            </button>
          </div>

          {/* 사이드바 밖에서도 실시간 확인 가능한 글로벌 업로드 진행 가로바 */}
          {uploadProgress && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#FAF9F5] border border-[#E8E2D9] rounded-xl shadow-2xs animate-in fade-in duration-200">
              <span className="w-2 h-2 rounded-full bg-black animate-ping" />
              <span className="text-xs font-bold text-black tracking-tight">업로드 중...</span>
              <div className="w-24 sm:w-36 h-2 bg-neutral-200 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-black rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, (uploadProgress.processed / uploadProgress.total) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-extrabold text-black bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-300">
                {uploadProgress.processed} / {uploadProgress.total} ({Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%)
              </span>
            </div>
          )}

          {/* 메인 액션 버튼: 저장소, 콘티에디터, 선택취소 */}
          <div className="flex items-center gap-3 ml-auto shrink-0 flex-nowrap">
            {/* 저장소 */}
            <button 
              onClick={() => setIsLibraryOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-normal text-[#4A4741] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
              title="저장된 콘티 저장소 열기"
            >
              <Library className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
              <span>저장소</span>
            </button>

            {/* 콘티에디터 */}
            <button 
              onClick={() => {
                setIsEditorOpen(true);
                logActivity('콘티 에디터', '콘티 에디터 실행');
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#D97757] hover:bg-[#FAF0EB] rounded-lg transition-colors cursor-pointer relative"
              title="콘티 편집기 열기"
            >
              <Layout className="w-4 h-4 stroke-[1.8px]" />
              <span>콘티에디터</span>
              {contiItems.length > 0 && (
                <span className="w-4 h-4 bg-[#D97757] text-white text-[9px] font-bold flex items-center justify-center rounded-full ml-0.5 animate-pulse">
                  {contiItems.length}
                </span>
              )}
            </button>

            {/* 선택취소 */}
            <button 
              onClick={clearConti}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-normal text-[#6E6A63] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
              title="선택한 악보 전체 취소"
            >
              <RotateCcw className="w-4 h-4 text-[#6E6A63] stroke-[1.8px]" />
              <span>선택취소</span>
            </button>

            {/* 찬양팀 공유 (새창 모드) */}
            <button 
              onClick={() => {
                setWorshipTeamNameDraft(localStorage.getItem('nations-worship-team-name') || localStorage.getItem('ceum-worship-team-name') || 'NATIONS 찬양팀');
                setShowTeamNameModal(true);
                logActivity('찬양팀 공유', '찬양팀 공유 설정 모달 열림');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#D97757] bg-[#FAF0EB] hover:bg-[#F7E5DB] border border-[#F1D3C6] rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="찬양팀 공유 전용 창 열기 (예배팀 이름 설정)"
            >
              <Share2 className="w-3.5 h-3.5 text-[#D97757] stroke-[2px]" />
              <span>찬양팀 공유</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[#FAF9F5]">
          <HymnalModule />
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-[#2C2B29]/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-2xl bg-white border border-[#E7E5DF] rounded-3xl shadow-2xl p-7 max-h-[88vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E7E5DF] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#FAF0EB] border border-[#F1D3C6] rounded-2xl">
                    <Settings className="w-5 h-5 text-[#C96442] stroke-[1.5px]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-xl font-bold text-[#2C2B29]">찬양앱 설정 가이드</h2>
                    <p className="text-[11px] text-[#A3A19B] font-medium mt-0.5">STUDIO NATIONS 사용법 및 데이터 관리</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-[#F5F3ED] rounded-full transition-colors text-[#A3A19B] hover:text-[#2C2B29] cursor-pointer"
                >
                  <X className="w-5 h-5 stroke-[1.5px]" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                <div className="p-4 bg-[#FAF0EB] rounded-2xl border border-[#F1D3C6]">
                  <p className="text-xs font-semibold text-[#C96442] leading-relaxed">목사님의 사역이 이 도구를 통해 더욱 풍성해지길 기도합니다. 🕊️🙏</p>
                </div>

                {/* 전용 클라우드 저장소 안내 섹션 */}
                <div className="p-5 bg-white rounded-2xl border border-[#D97757]/30 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">☁️</span>
                    <h4 className="text-xs font-bold text-[#2C2B29] uppercase tracking-wide">네이션스 클라우드 전용 저장소 안내</h4>
                    <span className="ml-auto text-[10px] font-bold text-[#2E7D32] bg-[#EBF7EE] border border-[#C8E6C9] px-2 py-0.5 rounded-md">
                      초경량 고화질 WebP 영구 보관
                    </span>
                  </div>
                  <p className="text-xs text-[#4A4741] leading-relaxed">
                    앱의 모든 악보, 콘티, 설정 데이터는 <strong>네이션스 스튜디오의 전용 클라우드 서버</strong>에 안전하게 암호화되어 영구 저장됩니다. 구글, 카카오 등 어떤 계정으로 로그인하든 모든 기기(PC, 태블릿, 모바일)에서 동일한 내 악보 라이브러리가 실시간으로 동기화됩니다.
                  </p>
                  <div className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl p-3 text-[11px] font-mono space-y-1.5 text-[#5C584F]">
                    <div className="flex items-center gap-2 font-bold text-[#2B2927]">
                      <span>☁️ Nations Studio Cloud/</span>
                      <span className="font-sans font-normal text-[10px] text-[#D97757]">(스튜디오 중앙 클라우드 스토리지)</span>
                    </div>
                    <div className="pl-4 space-y-1 text-[#6A6864]">
                      <div>├── 📂 <strong>Sheets/</strong> <span className="font-sans text-[10px] text-[#8C877D]">- 초경량 고화질 WebP 악보 원본 영구 보관</span></div>
                      <div>├── 📂 <strong>Albums/</strong> <span className="font-sans text-[10px] text-[#8C877D]">- 새찬송가, 마커스 등 사용자별 맞춤 앨범 분류</span></div>
                      <div>├── 📂 <strong>Contis/</strong> <span className="font-sans text-[10px] text-[#8C877D]">- 자르기 좌표, 송폼, 멘트가 포함된 예배 콘티</span></div>
                      <div>└── 📂 <strong>Cache/</strong> <span className="font-sans text-[10px] text-[#8C877D]">- 오프라인 0초 로딩을 위한 기기 로컬 IndexedDB 캐시</span></div>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8C877D] leading-relaxed">
                    💡 <strong>실시간 연동:</strong> 예배 인도자나 반주자가 콘티나 악보를 수정하면, 같은 계정으로 로그인된 보면대 태블릿이나 스마트폰에도 딜레이 없이 실시간으로 반영됩니다.
                  </p>
                </div>

                {/* 로컬 캐시 관리 섹션 */}
                <div className="p-5 bg-[#F5F3ED] rounded-2xl border border-[#E7E5DF]">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-[#2C2B29] uppercase tracking-wide">로컬 캐시 관리</h4>
                    <span className="text-[11px] font-semibold text-[#C96442] bg-white border border-[#E7E5DF] px-2.5 py-1 rounded-xl shadow-2xs">
                      현재 로컬 캐쉬 용량: {cacheSize}
                    </span>
                  </div>
                  <p className="text-xs text-[#6A6864] mb-4 leading-relaxed">
                    빠른 앱 구동과 예배 중 오프라인 연주를 위해 한 번 열람한 악보는 기기의 로컬 캐시(IndexedDB)에 자동 보관됩니다. 기기의 저장 공간을 확보하고 싶을 때 로컬 캐시를 삭제하십시오. 클라우드 서버의 원본 악보와 앨범/콘티 설정은 삭제되지 않고 안전하게 보존됩니다.
                  </p>
                  <button
                    onClick={async () => {
                      if (confirm('기기에 저장된 모든 악보 로컬 캐시를 삭제하시겠습니까? \n삭제 후 악보를 열 때 클라우드 서버에서 다시 새로 다운로드합니다.')) {
                        try {
                          const { imageCache } = await import('./utils/imageCache');
                          await imageCache.clearCache();
                          alert('로컬 악보 캐시가 성공적으로 삭제되었습니다.');
                          setCacheSize('0.00 MB');
                          setTimeout(updateCacheSize, 1000);
                        } catch (e: any) {
                          alert('캐시 삭제 중 오류 발생: ' + e.message);
                        }
                      }
                    }}
                    className="px-4 py-2 bg-white hover:bg-[#FAF0EB] text-[#C96442] hover:border-[#C96442] rounded-xl text-xs font-semibold transition-all border border-[#E7E5DF] shadow-2xs cursor-pointer"
                  >
                    로컬 악보 캐시 지우기
                  </button>
                </div>

                <div className="space-y-4">
                  <section>
                    <h3 className="text-sm font-bold text-[#2C2B29] flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-3.5 bg-[#C96442] rounded-full" />
                      찬양앱 주요 기능
                    </h3>
                    <div className="bg-[#F5F3ED] p-4 rounded-2xl text-xs text-[#6A6864] leading-relaxed border border-[#E7E5DF] space-y-2">
                      <p>• <strong>앨범 만들어 악보 넣기:</strong> 폴더별/주제별로 앨범을 분류하여 악보 관리</p>
                      <p>• <strong>악보 스마트 검색:</strong> 제목, 가사, 번호, 코드, 박자 검색 및 카피곡 유튜브 영상 링크</p>
                      <p>• <strong>콘티 에디터:</strong> 악보 자르기(크롭), 찬양 멘트 삽입, 콘티 저장/불러오기, 인쇄 및 PDF 내보내기</p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-bold text-[#2C2B29] flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-3.5 bg-[#C96442] rounded-full" />
                      맥(macOS) 보안 설정 안내
                    </h3>
                    <div className="bg-[#F5F3ED] p-4 rounded-2xl text-xs text-[#6A6864] leading-relaxed border border-[#E7E5DF]">
                      <p>앱 실행 시 "확인되지 않은 개발자" 경고가 뜨면:</p>
                      <ul className="mt-2 space-y-1 list-disc pl-4 font-medium">
                        <li><strong>시스템 설정</strong> &gt; <strong>개인정보 보호 및 보안</strong>으로 이동</li>
                        <li>아래쪽 <strong>확인 없이 열기 (Open Anyway)</strong> 버튼 클릭</li>
                        <li>암호 입력 후 최종 실행 승인</li>
                      </ul>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-bold text-[#2C2B29] flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-3.5 bg-[#C96442] rounded-full" />
                      악보 및 클라우드 연동 안내
                    </h3>
                    <div className="bg-[#F5F3ED] p-4 rounded-2xl text-xs text-[#6A6864] leading-relaxed border border-[#E7E5DF] space-y-2">
                      <p>- PC, 모바일에서 업로드한 악보는 전용 클라우드 서버에 안전하게 보관되며 모든 기기에서 실시간 동기화됩니다.</p>
                      <p>- 최초 1회 다운로드 후에는 기기 캐시에 보관되어 오프라인에서도 즉시 악보를 열람할 수 있습니다.</p>
                    </div>
                  </section>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E7E5DF] text-center shrink-0">
                <p className="text-[10px] font-bold text-[#A3A19B] tracking-widest uppercase mb-1">
                  STUDIO NATIONS V2.0.0
                </p>
                <p className="text-[9px] text-[#A3A19B] tracking-tight">
                  © 2026 NATIONS ministry. All rights reserved.
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                      setShowAdminModal(true);
                    }}
                    className="ml-2 w-2 h-2 bg-[#A3A19B] rounded-full opacity-30 hover:opacity-100 hover:bg-[#C96442] transition-all cursor-pointer inline-block"
                    title="관리자 모드"
                  />
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminModal && (
          <React.Suspense fallback={null}>
            <AdminModal 
              initialAuthenticated={adminInitialAuth}
              onClose={() => {
                setShowAdminModal(false);
                setAdminInitialAuth(false);
              }} 
            />
          </React.Suspense>
        )}
      </AnimatePresence>

      {/* 예배팀 이름 설정 및 찬양팀 공유 진입 모달 */}
      <AnimatePresence>
        {showTeamNameModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] flex items-center justify-center shadow-2xs">
                  <Share2 className="w-6 h-6 stroke-[2px]" />
                </div>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#2B2927]">
                  찬양팀 공유 설정
                </h2>
                <p className="text-xs text-[#6A6864] leading-relaxed">
                  팀원들에게 전송되는 공유 화면 및 링크에 표시될<br />
                  <strong>예배팀 이름</strong>을 정해주세요.
                </p>
              </div>

              {/* 예배팀 이름 입력창 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6A6864]">예배팀 이름</label>
                <input
                  type="text"
                  value={worshipTeamNameDraft}
                  onChange={(e) => setWorshipTeamNameDraft(e.target.value)}
                  placeholder="예: NATIONS 찬양팀, 할렐루야 찬양대 등"
                  className="w-full bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#2B2927] focus:outline-none focus:border-[#D97757]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const finalName = worshipTeamNameDraft.trim() || 'NATIONS 찬양팀';
                      localStorage.setItem('nations-worship-team-name', finalName);
                      localStorage.setItem('ceum-worship-team-name', finalName);
                      setShowTeamNameModal(false);
                      setIsTeamShareOpen(true);
                    }
                  }}
                />
              </div>

              {/* 추천 프리셋 칩 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#8C877D]">빠른 선택 추천:</label>
                <div className="flex flex-wrap gap-1.5">
                  {['NATIONS 찬양팀', '할렐루야 찬양대', '호산나 찬양팀', '청년부 워십팀', '금요기도회 찬양팀'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWorshipTeamNameDraft(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        worshipTeamNameDraft === preset
                          ? 'bg-[#D97757] text-white shadow-2xs font-bold'
                          : 'bg-[#FAF9F5] hover:bg-[#F3EFE9] text-[#6A6864] border border-[#E5E0D8]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 하단 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E0D8]">
                <button
                  type="button"
                  onClick={() => setShowTeamNameModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-[#6A6864] hover:bg-[#F3EFE9] rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const finalName = worshipTeamNameDraft.trim() || 'NATIONS 찬양팀';
                    localStorage.setItem('nations-worship-team-name', finalName);
                    localStorage.setItem('ceum-worship-team-name', finalName);
                    setShowTeamNameModal(false);
                    setIsTeamShareOpen(true);
                  }}
                  className="px-5 py-2.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  찬양팀 공유 창 열기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorOpen && <ContiEditor />}
      </AnimatePresence>

      <AnimatePresence>
        {isTeamShareOpen && (
          <TeamShareWindow onClose={() => setIsTeamShareOpen(false)} />
        )}
      </AnimatePresence>

      {/* 클로드 스타일 전체화면 로그인 & 요금제 페이지 (랜딩 페이지) */}
      <ClaudeAuthPage
        isOpen={showAuthModal}
        initialSection={authPageSection}
        onClose={() => setShowAuthModal(false)}
        currentUser={auth.currentUser}
        userProfile={userProfile}
      />

      {/* 친구 초대 1+1 보너스 팝업 */}
      <InviteBonusModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        currentUser={auth.currentUser}
      />

      {/* 계정 관리 모달 (SERMON 스타일 데이터 및 용량 현황) */}
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onOpenPricing={() => {
          setAuthPageSection('pricing');
          setShowAuthModal(true);
        }}
        onOpenPolicy={(tab) => setPolicyModal({ isOpen: true, tab })}
        currentUser={auth.currentUser}
        userProfile={userProfile}
        onLogout={async () => {
          const { gdriveWebService } = await import('./api/gdriveWebService');
          await gdriveWebService.logout();
          window.location.reload();
        }}
      />

      {/* 이용약관 및 개인정보처리방침/사업자정보 모달 */}
      <PolicyViewModal
        isOpen={policyModal.isOpen}
        initialTab={policyModal.tab}
        onClose={() => setPolicyModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <HymnalProvider>
      <MainApp />
    </HymnalProvider>
  );
};

export default App;
