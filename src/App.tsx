import React, { useState, useEffect } from 'react';
import { HymnalProvider, useHymnal } from './stores/HymnalProvider';
import { HymnalModule } from './components/Hymnal/HymnalModule';
import { HymnalSidebar } from './components/Hymnal/HymnalSidebar';
import { ContiEditor } from './components/Hymnal/ContiEditor';
import { MobilePdfLayout } from './components/Hymnal/MobilePdfLayout';
import { TooltipIcon } from './components/TooltipIcon';
import { Menu, Music, Settings, X, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { initGoogleApi, IS_LOCAL_DEV } from './api/gdriveWebService';

const AdminModal = React.lazy(() => import('./components/AdminModal').then(m => ({ default: m.AdminModal })));

const MainApp: React.FC = () => {
  // PDF 인쇄 모드 확인
  const params = new URLSearchParams(window.location.search);
  const isPrintMode = params.get('mode') === 'print-pdf';

  if (isPrintMode) {
    return <MobilePdfLayout />;
  }

  // 구글 API 초기화
  const [, setIsApiLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(IS_LOCAL_DEV);
  const [userProfile, setUserProfile] = useState<{name: string, email: string, picture: string} | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { isEditorOpen, showAllTooltips, setShowAllTooltips } = useHymnal();

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
    };
  }, []);

  return (
    <div className="flex h-screen bg-background text-slate-200 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "fit-content", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="glass border-r border-slate-200 h-full relative z-30 bg-white shadow-xl shrink-0 group/sidebar"
          >
            <div className="p-5 h-full flex flex-col w-[16vw] min-w-[180px] max-w-[260px]">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h1 className="font-bold bg-gradient-to-r from-red-600 to-red-400 bg-clip-text text-transparent flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-tighter opacity-80">studio</span>
                  <span className="text-xl">nations</span>
                </h1>
                <Music className="w-5 h-5 text-red-500" />
              </div>

              {/* Auth (Login / Profile) Section */}
              <div className="mb-6 relative z-10">
                {!isAuthenticated ? (
                  <div className="relative">
                    <button
                      onClick={async () => {
                        const { gdriveWebService } = await import('./api/gdriveWebService');
                        const success = await gdriveWebService.login();
                        if (success) {
                          await gdriveWebService.getOrCreateFolder('CEUM_ccm_data');
                          setTimeout(() => window.dispatchEvent(new Event('gdrive_authenticated')), 500);
                        } else {
                          alert('로그인 실패: 구글 인증이 완료되지 않았습니다.');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2.5 py-3 px-3 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-[0.97] group relative overflow-hidden"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-[13px] font-extrabold tracking-tight">Google</span>
                        <span className="text-[13px] font-extrabold tracking-tight">로그인</span>
                      </div>
                    </button>
                    
                    <div className="absolute top-2 right-2">
                      <TooltipIcon text="개인사용자화를 위해 구글 계정으로 로그인하세요. 모든 기기에서 악보와 설정이 실시간 연동됩니다." />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col bg-slate-50 border border-slate-200 p-3 rounded-2xl gap-3 shadow-sm">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {userProfile?.picture ? (
                        <img src={userProfile.picture} alt="Profile" className="w-9 h-9 rounded-full shadow-sm shrink-0 border border-slate-200" />
                      ) : (
                        <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-black shrink-0 border border-indigo-200">
                          {userProfile?.name?.charAt(0) || 'U'}
                        </div>
                      )}
                      
                      <div className="flex flex-col flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-slate-800 truncate">{userProfile?.name || '사용자'}</span>
                          {isOffline && (
                            <div className="shrink-0 p-0.5 bg-red-100 rounded-full" title="오프라인 모드">
                              <WifiOff className="w-3 h-3 text-red-500" />
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 truncate leading-tight">{userProfile?.email || ''}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        if (confirm('로그아웃 하시겠습니까?')) {
                          localStorage.removeItem('gdrive_token');
                          localStorage.removeItem('gdrive_token_expires_at');
                          window.location.reload();
                        }
                      }}
                      className="w-full flex items-center justify-center py-2 text-xs font-black text-red-600 bg-white hover:bg-red-50 hover:text-red-700 rounded-xl transition-all border border-red-100 shadow-sm"
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>

              {/* Hymnal Sidebar Content */}
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <HymnalSidebar />
              </div>

              {/* Footer Settings */}
              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-2 px-4 py-3 w-full hover:bg-slate-50 rounded-xl transition-colors text-slate-500 hover:text-red-600">
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-3 flex-1"
                  >
                    <Settings className="w-5 h-5" />
                    <span className="text-sm font-medium">설정</span>
                  </button>
                  <TooltipIcon text="캐쉬삭제: 기기용량확보를 위해 기기에 저장된 캐쉬를 삭제하세요. 구글드라이브, 악보 목록 및 설정 어디에도 영향주지 않고 보호됩니다." />
                </div>
                <div className="mt-4 px-4 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">제작: CEUM ministry</p>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="min-h-16 border-b border-slate-200 flex items-center px-4 md:px-6 py-3 gap-4 bg-white sticky top-0 z-30 shadow-sm overflow-x-auto custom-scrollbar flex-row">
          <div className="flex items-center gap-3 shrink-0 flex-nowrap w-auto">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 shrink-0 shadow-sm border border-transparent hover:border-slate-200"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 ml-auto shrink-0 flex-nowrap">
            <div className="hidden sm:block text-sm font-bold text-slate-800 whitespace-nowrap">찬송/CCM 관리자</div>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => setShowAllTooltips(!showAllTooltips)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${showAllTooltips ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'} whitespace-nowrap shrink-0`}
              >
                말풍선 {showAllTooltips ? '끄기' : '켜기'}
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition-all active:scale-95 group shadow-sm border border-red-200 whitespace-nowrap shrink-0"
              >
                <span className="text-xs font-black shrink-0">사용법</span>
                <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500 shrink-0" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-slate-50">
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white border border-slate-100 rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-xl">
                    <Settings className="w-6 h-6 text-red-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">찬양앱 설정 가이드</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-5 bg-red-50 rounded-2xl border border-red-100">
                  <p className="text-xs font-bold text-red-800 leading-relaxed">목사님의 사역이 이 도구를 통해 더욱 풍성해지길 기도합니다. 🕊️🙏</p>
                </div>

                {/* 로컬 캐시 관리 섹션 */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">로컬 캐시 관리</h4>
                    <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded-lg">
                      현재 로컬 캐쉬 용량: {cacheSize}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                    해당 앱은 모든 악보를 구글 드라이브에 저장하여 불러옵니다. 빠른 앱의 구동을 위해 한번 읽은 악보는 기기의 캐쉬에 저장됩니다. 기기의 저장 공간을 확보하고 싶을때 로컬캐시 관리를 실행하여 삭제 하십시오. 구글 드라이브의 원본악보와 앱의 모든 앨범과 설정은 삭제되지 않고 안전하게 보호 됩니다.
                  </p>
                  <button
                    onClick={async () => {
                      if (confirm('기기에 저장된 모든 악보 캐시를 삭제하시겠습니까? \n삭제 후 악보를 열 때 구글 드라이브에서 다시 새로 다운로드합니다.')) {
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
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl text-xs font-bold transition-all border border-red-100 shadow-sm"
                  >
                    로컬 악보 캐시 지우기
                  </button>
                </div>

                <div className="space-y-6">
                  <section>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                      찬양앱 기능
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100 space-y-2 font-medium">
                      <p>• <strong>앨범만들어 악보넣기</strong></p>
                      <p>• <strong>악보 관리하기:</strong> 주제, 코드, 박자, 가사 검색, 유튜브 영상 추가하여 카피곡 관리</p>
                      <p>• <strong>콘티악보만들기:</strong> 콘티만들기, 악보 자르기, 찬양멘트 넣기, 콘티 저장 및 불러오기, 콘티를 PDF로 만들어 카톡으로 전송하기, 인쇄하기</p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                      맥(macOS) 보안 설정 안내
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100">
                      <p>앱 실행 시 "확인되지 않은 개발자" 경고가 뜨면:</p>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4 font-bold">
                        <li><strong>시스템 설정</strong> &gt; <strong>개인정보 보호 및 보안</strong>으로 이동</li>
                        <li>아래쪽 <strong>확인 없이 열기 (Open Anyway)</strong> 버튼 클릭</li>
                        <li>암호 입력 후 최종 실행 승인</li>
                      </ul>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-4 bg-red-500 rounded-full" />
                      악보관리 하기
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl text-[11px] text-slate-600 leading-relaxed border border-slate-100 space-y-3 font-medium">
                      <p>- PC, 모바일에서 앱을 통해 업로드한 악보는 본인 계정의 구글드라이브에 저용량으로 저장되며, 로그인 된 모든 기기에서 악보를 볼 수 있도록 연동됩니다.</p>
                      <p>- 구글 드라이브에 업로드한 악보를 한 기기에서 최초로 열었을 때, 약간의 로딩 시간이 걸리지만, 이후 캐쉬로 저장되어 시간이 걸리지 않습니다.</p>
                      <p>- 모바일 등 저장용량이 적은 기기에서는 수시로 캐쉬를 삭제하여 용량관리를 할 수 있습니다.</p>
                      <p>- 찬송가 악보 업로드: 용량 관계로 악보 목록만 빌드 되어 있으니, 관리자로부터 찬송가 악보를 제공받아 업로드 합니다.</p>
                    </div>
                  </section>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 text-center shrink-0">
                <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">
                  STUDIO NATIONS V1.0.0
                </p>
                <p className="text-[9px] text-slate-300 font-bold tracking-tight">
                  © 2026 CEUM ministry. All rights reserved.
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                      setShowAdminModal(true);
                    }}
                    className="ml-2 w-2.5 h-2.5 bg-slate-200 rounded-full opacity-20 hover:opacity-100 hover:bg-indigo-500 transition-all"
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
            <AdminModal onClose={() => setShowAdminModal(false)} />
          </React.Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorOpen && <ContiEditor />}
      </AnimatePresence>
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
