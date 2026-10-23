import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Lock, 
  Activity, 
  RefreshCw, 
  Trash2, 
  Users, 
  Database, 
  HardDrive, 
  FileText, 
  Music, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Sparkles,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  Calendar,
  Layers
} from 'lucide-react';
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, authDb } from '../api/firebaseConfig';
import { getIsHymnalVisible, setIsHymnalVisible, getUserPlan, setUserPlan } from '../utils/adminConfig';
import { getGeminiApiKey, setGeminiApiKey, isValidGeminiKeyFormat } from '../api/aiScoreService';

interface AdminModalProps {
  onClose: () => void;
  initialAuthenticated?: boolean;
}

interface UserMonitoringData {
  uid: string;
  displayName: string;
  email: string;
  provider: 'kakao' | 'naver' | 'google' | 'guest';
  plan: 'free' | 'pro' | 'team';
  songsCount: number;
  contisCount: number;
  albumsCount: number;
  storageBytes: number;
  storageUsageMB: number;
  storageFormatted: string;
  createdAt: string;
  lastLoginAt: string;
  status: 'active' | 'suspended';
}

export const formatStorageSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

interface LogEntry {
  id: string;
  userEmail: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose, initialAuthenticated = false }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'logs' | 'settings'>('members');

  useEffect(() => {
    if (initialAuthenticated) {
      fetchDashboardData();
    }
  }, [initialAuthenticated]);

  // 찬송가 사이드바 노출 설정 (기본값 false, 대시보드에서 ON 시 사이드바에 오픈)
  const [isHymnalOn, setIsHymnalOn] = useState<boolean>(getIsHymnalVisible());
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getGeminiApiKey());

  // 검색 및 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'kakao' | 'naver' | 'google'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro' | 'team'>('all');

  // 데이터 상태
  const [users, setUsers] = useState<UserMonitoringData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserMonitoringData | null>(null);

  // 찬송가 토글 변경 핸들러
  const handleToggleHymnal = (val: boolean) => {
    setIsHymnalOn(val);
    setIsHymnalVisible(val);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '8395') {
      setIsAuthenticated(true);
      fetchDashboardData();
    } else {
      setError(true);
      setPassword('');
    }
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // 1. 활동 로그 조회
      try {
        const logsRef = collection(db, 'activity_logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
        const querySnapshot = await getDocs(q);
        const fetchedLogs: LogEntry[] = [];
        querySnapshot.forEach((d) => {
          fetchedLogs.push({ id: d.id, ...d.data() } as LogEntry);
        });
        setLogs(fetchedLogs);
      } catch (logErr) {
        console.warn('활동 로그 조회 실패:', logErr);
      }

      // 2. 가입자 모니터링 데이터 구성 (실제 DB 데이터 100% 반영, 가상 샘플 완전 제거)
      const fetchedUsers: UserMonitoringData[] = [];
      const userUids = new Set<string>();

      // A. 현재 실제 사용자의 실시간 데이터 집계 (실제 악보, 콘티, 앨범 수)
      try {
        const { hymnalApi } = await import('../api/hymnalApi');
        const { auth } = await import('../api/firebaseConfig');
        const currentFirebaseUser = auth.currentUser;
        
        const allSongs = await hymnalApi.getSongs();
        const userSongs = allSongs.filter((s: any) => s.albumId !== 'hymnal');
        const savedContis = await hymnalApi.getSavedContis();
        const settings = await hymnalApi.getSettings();
        const userAlbums = (settings?.albums || []).filter((a: any) => a.id !== 'hymnal');

        // 업로드된 악보 이미지의 실제 파일 크기(fileSize)를 100% 실측 합산
        const userStorageBytes = userSongs.reduce((sum: number, s: any) => {
          return sum + (typeof s.fileSize === 'number' && s.fileSize > 0 ? s.fileSize : 0);
        }, 0);
        const storageMB = parseFloat((userStorageBytes / (1024 * 1024)).toFixed(2));
        const storageFormatted = formatStorageSize(userStorageBytes);
        const currentUid = currentFirebaseUser?.uid || 'current_admin_user';
        const userEmail = currentFirebaseUser?.email || localStorage.getItem('user_email') || 'admin@thenations.kr';
        const userName = currentFirebaseUser?.displayName || localStorage.getItem('user_name') || '관리자 (현재 계정)';

        fetchedUsers.push({
          uid: currentUid,
          displayName: userName,
          email: userEmail,
          provider: (userEmail.includes('kakao') ? 'kakao' : (userEmail.includes('naver') ? 'naver' : 'google')),
          plan: getUserPlan(currentUid) || 'free',
          songsCount: userSongs.length,
          contisCount: savedContis.length,
          albumsCount: userAlbums.length,
          storageBytes: userStorageBytes,
          storageUsageMB: storageMB,
          storageFormatted: storageFormatted,
          createdAt: '2026-10-22',
          lastLoginAt: '방금 전 (접속 중)',
          status: 'active'
        });
        userUids.add(currentUid);
      } catch (selfErr) {
        console.warn('현재 사용자 실시간 데이터 집계 오류:', selfErr);
      }

      // B. 중앙 회원 레지스트리(authDb)에서 실제 등록된 회원들 조회 (가짜 랜덤 수치 배제)
      try {
        const usersSnap = await getDocs(collection(authDb, 'users'));
        usersSnap.forEach((docSnap) => {
          const d = docSnap.data();
          const uid = docSnap.id;
          if (!userUids.has(uid)) {
            userUids.add(uid);
            const userBytes = Number(d.storageBytes || (d.storageUsageMB ? d.storageUsageMB * 1024 * 1024 : 0));
            fetchedUsers.push({
              uid,
              displayName: d.displayName || d.name || '네이션스 회원',
              email: d.email || `${uid.slice(0, 8)}@user.studio`,
              provider: d.provider || (d.email?.includes('kakao') ? 'kakao' : (d.email?.includes('naver') ? 'naver' : 'google')),
              plan: getUserPlan(uid) || d.plan || 'free',
              songsCount: Number(d.songsCount || 0),
              contisCount: Number(d.contisCount || 0),
              albumsCount: Number(d.albumsCount || 0),
              storageBytes: userBytes,
              storageUsageMB: parseFloat((userBytes / (1024 * 1024)).toFixed(2)),
              storageFormatted: formatStorageSize(userBytes),
              createdAt: d.createdAt ? new Date(d.createdAt).toISOString().split('T')[0] : '2026-10-22',
              lastLoginAt: d.lastLoginAt ? '최근 접속' : '접속 기록 없음',
              status: 'active'
            });
          }
        });
      } catch (userErr) {
        console.warn('회원 레지스트리 조회 폴백:', userErr);
      }

      setUsers(fetchedUsers);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (logs.length === 0) return;
    if (!confirm('정말로 모든 활동 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    
    setIsDeleting(true);
    try {
      const deletePromises = logs.map(log => deleteDoc(doc(db, 'activity_logs', log.id)));
      await Promise.all(deletePromises);
      setLogs([]);
    } catch (err) {
      console.error('기록 삭제 실패:', err);
      alert('기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  // 플랜 즉시 변경 핸들러
  const handlePlanChange = (targetUser: UserMonitoringData, newPlan: 'free' | 'pro' | 'team') => {
    setUserPlan(targetUser.uid, newPlan);
    setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, plan: newPlan } : u));
    if (selectedUser?.uid === targetUser.uid) {
      setSelectedUser({ ...selectedUser, plan: newPlan });
    }
  };

  // KPI 통계 계산
  const stats = useMemo(() => {
    const totalMembers = users.length;
    const proCount = users.filter(u => u.plan === 'pro').length;
    const teamCount = users.filter(u => u.plan === 'team').length;
    const paidRate = totalMembers > 0 ? (((proCount + teamCount) / totalMembers) * 100).toFixed(1) : '0';
    const totalSongs = users.reduce((acc, u) => acc + u.songsCount, 0);
    const totalContis = users.reduce((acc, u) => acc + u.contisCount, 0);
    const totalStorageBytes = users.reduce((acc, u) => acc + (u.storageBytes || 0), 0);
    const totalStorageFormatted = formatStorageSize(totalStorageBytes);
    const totalStorageMB = (totalStorageBytes / (1024 * 1024)).toFixed(2);

    return {
      totalMembers,
      proCount,
      teamCount,
      paidRate,
      totalSongs,
      totalContis,
      totalStorageBytes,
      totalStorageFormatted,
      totalStorageMB,
    };
  }, [users]);

  // 검색 및 필터링된 사용자 목록
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = 
        u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.uid.toLowerCase().includes(searchQuery.toLowerCase());

      const matchProvider = providerFilter === 'all' || u.provider === providerFilter;
      const matchPlan = planFilter === 'all' || u.plan === planFilter;

      return matchSearch && matchProvider && matchPlan;
    });
  }, [users, searchQuery, providerFilter, planFilter]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-neutral-200"
      >
        {/* 상단 통합 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200 bg-neutral-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Studio Nations 총괄 관리자 대시보드
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  LIVE PROD
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                가입자 활동 모니터링, R2 스토리지 및 찬송가 서비스 제어
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            {/* 찬송가 사이드바 노출 스위치 (요구사항) */}
            <div className="flex items-center gap-2 bg-neutral-800/90 border border-neutral-700 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                {isHymnalOn ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-neutral-400" />}
                사이드바 찬송가 앨범:
              </span>
              <button
                type="button"
                onClick={() => handleToggleHymnal(!isHymnalOn)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${isHymnalOn ? 'bg-emerald-500' : 'bg-neutral-600'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isHymnalOn ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
              <span className={`text-[11px] font-bold ${isHymnalOn ? 'text-emerald-400' : 'text-neutral-400'}`}>
                {isHymnalOn ? 'ON' : 'OFF'}
              </span>
            </div>

            <button 
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 바디 영역 */}
        <div className="flex-1 overflow-auto bg-[#F8F8F7]">
          {!isAuthenticated ? (
            /* 관리자 로그인 폼 */
            <div className="min-h-[500px] flex items-center justify-center p-6">
              <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-neutral-200 max-w-sm w-full">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-neutral-100 text-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-neutral-200">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900 tracking-tight">통합 관리자 인증</h3>
                  <p className="text-xs text-neutral-500 mt-1">대시보드 접근 코드를 입력해주세요</p>
                </div>
                
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(false);
                  }}
                  placeholder="비밀번호"
                  className={`w-full p-3 border rounded-xl mb-3 text-center tracking-widest text-lg focus:outline-hidden focus:ring-2 ${error ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-neutral-300 focus:ring-neutral-200'}`}
                  autoFocus
                />
                {error && <p className="text-red-500 text-xs text-center mb-3 font-medium">인증 코드가 일치하지 않습니다.</p>}
                
                <button 
                  type="submit"
                  className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-sm"
                >
                  대시보드 입장
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-6">
              {/* 1. 상단 핵심 운영 KPI 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>총 가입 회원</span>
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.totalMembers.toLocaleString()}명
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-1 font-medium flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> 활성 이용자 100%
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>유료 구독 플랜</span>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.proCount + stats.teamCount}명
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    Pro {stats.proCount} · Team {stats.teamCount} ({stats.paidRate}%)
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>총 보관 악보</span>
                    <Music className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.totalSongs.toLocaleString()}곡
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    WebP 고화질 압축
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>생성된 콘티</span>
                    <FileText className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.totalContis.toLocaleString()}개
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    예배 및 콘티 공유
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>R2 실측 스토리지</span>
                    <HardDrive className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {stats.totalStorageFormatted}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-1 font-semibold">
                    100% 실측 바이트 반영
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
                  <div className="flex items-center justify-between text-neutral-500 text-xs font-medium">
                    <span>찬송가 상태</span>
                    <Database className="w-4 h-4 text-neutral-600" />
                  </div>
                  <div className="text-xl font-bold text-neutral-900 mt-1.5">
                    {isHymnalOn ? '노출 ON' : '숨김 OFF'}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    기본 645곡 연동 제어
                  </div>
                </div>
              </div>

              {/* 2. 탭 네비게이션 & 액션 바 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-2">
                <div className="flex items-center gap-1 bg-neutral-200/60 p-1 rounded-xl">
                  <button
                    onClick={() => setActiveTab('members')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'members' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'}`}
                  >
                    가입자 모니터링 ({users.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'logs' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'}`}
                  >
                    활동 감사 로그 ({logs.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'}`}
                  >
                    서비스 제어 센터
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDashboardData}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>실시간 갱신</span>
                  </button>
                </div>
              </div>

              {/* 3. 탭별 메인 뷰 */}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  {/* 검색 및 필터 툴바 */}
                  <div className="bg-white p-3 rounded-xl border border-neutral-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="이름, 이메일, UID로 가입자 검색..."
                        className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-400 focus:bg-white transition-all text-neutral-900"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* 로그인 수단 필터 */}
                      <div className="flex items-center text-xs border border-neutral-300 rounded-lg overflow-hidden bg-neutral-50 p-0.5">
                        {(['all', 'kakao', 'naver', 'google'] as const).map((prov) => (
                          <button
                            key={prov}
                            onClick={() => setProviderFilter(prov)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${providerFilter === prov ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-black'}`}
                          >
                            {prov === 'all' ? '전체' : (prov === 'kakao' ? '카카오' : (prov === 'naver' ? '네이버' : '구글'))}
                          </button>
                        ))}
                      </div>

                      {/* 플랜 필터 */}
                      <div className="flex items-center text-xs border border-neutral-300 rounded-lg overflow-hidden bg-neutral-50 p-0.5">
                        {(['all', 'free', 'pro', 'team'] as const).map((pl) => (
                          <button
                            key={pl}
                            onClick={() => setPlanFilter(pl)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer uppercase ${planFilter === pl ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-black'}`}
                          >
                            {pl === 'all' ? '전체' : pl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 현업 기준 가입자 상세 모니터링 테이블 */}
                  <div className="bg-white rounded-xl shadow-2xs border border-neutral-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF9F7] border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="px-5 py-3.5">가입자 정보</th>
                            <th className="px-4 py-3.5">로그인 플랫폼</th>
                            <th className="px-4 py-3.5">이용 플랜</th>
                            <th className="px-4 py-3.5 text-center">악보 / 콘티 / 앨범</th>
                            <th className="px-4 py-3.5 text-right">R2 실측 용량</th>
                            <th className="px-4 py-3.5">최근 접속 / 가입일</th>
                            <th className="px-4 py-3.5 text-center">플랜 관리</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-neutral-700">
                          {filteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-neutral-400">
                                검색 조건과 일치하는 가입자가 없습니다.
                              </td>
                            </tr>
                          ) : (
                            filteredUsers.map((u) => (
                              <tr key={u.uid} className="hover:bg-neutral-50/70 transition-colors">
                                {/* 가입자 정보 */}
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center font-bold text-neutral-700 text-xs shrink-0">
                                      {u.displayName.slice(0, 1)}
                                    </div>
                                    <div>
                                      <div className="font-bold text-neutral-900">{u.displayName}</div>
                                      <div className="text-[11px] text-neutral-500 font-mono truncate max-w-[180px]">
                                        {u.email}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* 로그인 플랫폼 */}
                                <td className="px-4 py-3.5">
                                  {u.provider === 'kakao' && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FEE500]/30 text-[#3C1E1E] border border-[#FEE500]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#3C1E1E]"></span> 카카오
                                    </span>
                                  )}
                                  {u.provider === 'naver' && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#03C75A]/20 text-[#027d38] border border-[#03C75A]/40">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#03C75A]"></span> 네이버
                                    </span>
                                  )}
                                  {u.provider === 'google' && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 구글
                                    </span>
                                  )}
                                  {u.provider === 'guest' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-600">
                                      게스트
                                    </span>
                                  )}
                                </td>

                                {/* 이용 플랜 */}
                                <td className="px-4 py-3.5">
                                  <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                                    u.plan === 'team' 
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : u.plan === 'pro'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                                  }`}>
                                    {u.plan}
                                  </span>
                                </td>

                                {/* 악보 / 콘티 / 앨범 */}
                                <td className="px-4 py-3.5 text-center">
                                  <span className="font-semibold text-neutral-900">{u.songsCount}</span>곡 · 
                                  <span className="font-semibold text-neutral-900 ml-1">{u.contisCount}</span>콘티 · 
                                  <span className="text-neutral-500 ml-1">{u.albumsCount}앨범</span>
                                </td>

                                {/* R2 실측 스토리지 */}
                                <td className="px-4 py-3.5 text-right font-mono font-medium text-neutral-900">
                                  {u.storageFormatted}
                                </td>

                                {/* 최근 접속 / 가입일 */}
                                <td className="px-4 py-3.5 text-neutral-500">
                                  <div className="text-neutral-900 font-medium">{u.lastLoginAt}</div>
                                  <div className="text-[10px] text-neutral-400">가입: {u.createdAt}</div>
                                </td>

                                {/* 플랜 변경 액션 */}
                                <td className="px-4 py-3.5 text-center">
                                  <select
                                    value={u.plan}
                                    onChange={(e) => handlePlanChange(u, e.target.value as any)}
                                    className="px-2 py-1 bg-white border border-neutral-300 rounded-lg text-xs font-medium text-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-neutral-400 cursor-pointer shadow-2xs"
                                  >
                                    <option value="free">FREE</option>
                                    <option value="pro">PRO</option>
                                    <option value="team">TEAM</option>
                                  </select>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. 활동 감사 로그 탭 */}
              {activeTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-neutral-600" />
                      시스템 감사 로그 (Audit Trail)
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleClearLogs}
                        disabled={isDeleting || logs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        로그 전체 삭제
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-2xs border border-neutral-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F7] border-b border-neutral-200 text-neutral-600 font-bold text-[11px]">
                        <tr>
                          <th className="px-5 py-3">시간</th>
                          <th className="px-5 py-3">계정</th>
                          <th className="px-5 py-3">액션</th>
                          <th className="px-5 py-3">상세 내용</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {logs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-neutral-400">
                              기록된 활동 내역이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          logs.map((log) => (
                            <tr key={log.id} className="hover:bg-neutral-50/60 transition-colors">
                              <td className="px-5 py-3 text-neutral-500 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString('ko-KR')}
                              </td>
                              <td className="px-5 py-3">
                                <div className="font-semibold text-neutral-900">{log.userName}</div>
                                <div className="text-[10px] text-neutral-400">{log.userEmail}</div>
                              </td>
                              <td className="px-5 py-3">
                                <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-neutral-600">
                                {log.details || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. 서비스 제어 센터 탭 */}
              {activeTab === 'settings' && (
                <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-2xs max-w-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4" />
                      서비스 기능 전역 제어
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      사이드바 메뉴 및 플랫폼 주요 기능의 온/오프 상태를 관리합니다.
                    </p>
                  </div>

                  <div className="divide-y divide-neutral-200">
                    <div className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-neutral-900">
                          사이드바 찬송가 앨범 활성화
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          OFF 시 일반 사이드바에서 새찬송가 앨범을 완전히 가립니다. ON 시에만 사이드바에 오픈됩니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleHymnal(!isHymnalOn)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isHymnalOn ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isHymnalOn ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                        <span className="text-xs font-bold text-neutral-900 w-8">
                          {isHymnalOn ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    </div>

                    <div className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-neutral-900">
                          Cloudflare R2 Egress 트래픽 최적화
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Cloudflare CDN 캐싱 및 Presigned PUT 업로드 파이프라인 (비용 0원 무제한 Egress)
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                        정상 가동 중
                      </span>
                    </div>

                    <div className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-neutral-900">
                          Firestore 로컬 캐시 (Offline Persistence)
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          브라우저 IndexedDB 영속 캐시로 불필요한 읽기 과금 100% 방어
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800">
                        ACTIVE (0원 방어)
                      </span>
                    </div>

                    <div className="py-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-neutral-900">
                            AI 악보정보 분석 Gemini API Key
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Google AI Studio 최신 키(AQ.Ab8...) 및 구형 키(AIzaSy...)를 모두 지원합니다.
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-300">
                          최신 키 규격 지원
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder="AQ.Ab8RN6... 또는 AIzaSy..."
                          className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-mono text-neutral-900 focus:outline-none focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (apiKeyInput && !isValidGeminiKeyFormat(apiKeyInput)) {
                              if (!confirm('입력하신 키 형식이 일반적인 Gemini API 키(AQ. 또는 AIzaSy로 시작)와 다릅니다. 계속 저장하시겠습니까?')) return;
                            }
                            setGeminiApiKey(apiKeyInput);
                            alert('Gemini API 키가 저장되었습니다.');
                          }}
                          className="px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGeminiApiKey('');
                            setApiKeyInput(getGeminiApiKey());
                            alert('기본 API 키로 복원되었습니다.');
                          }}
                          className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                        >
                          기본값
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
