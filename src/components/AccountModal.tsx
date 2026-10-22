import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  ChevronRight, 
  Folder, 
  Music, 
  FileText, 
  Share2, 
  HardDrive, 
  Trash2,
  Copy,
  Check,
  RotateCcw
} from 'lucide-react';
import { type User as FirebaseUser } from 'firebase/auth';
import { useHymnal } from '../stores/HymnalProvider';
import { shareInviteViaKakao } from '../utils/socialAuth';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPricing?: () => void;
  currentUser?: FirebaseUser | null;
  userProfile?: { name: string; email?: string; picture?: string } | null;
  onLogout?: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onOpenPricing,
  currentUser,
  userProfile,
  onLogout
}) => {
  const { albums, songs, savedContis } = useHymnal();
  const [cacheSize, setCacheSize] = useState<string>('계산 중...');
  const [sharedContisCount, setSharedContisCount] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // 현재 유저의 플랜 상태 (기본 'free', 로컬스토리지에 저장되어 있거나 solo, team일 수 있음)
  const currentPlan: 'free' | 'solo' | 'team' = (() => {
    try {
      const saved = localStorage.getItem('user_plan_level');
      if (saved === 'solo' || saved === 'team') return saved;
    } catch {}
    return 'free';
  })();

  const planName = currentPlan === 'team' ? 'TEAM 플랜' : currentPlan === 'solo' ? 'SOLO 플랜' : 'Free 플랜';

  useEffect(() => {
    if (!isOpen) return;

    // 브라우저 저장소 캐시 용량 산출
    const calculateStorage = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const usageMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
          setCacheSize(`${usageMB} MB`);
        } else {
          setCacheSize('약 12.5 MB');
        }
      } catch {
        setCacheSize('계산 불가');
      }
    };
    calculateStorage();

    // 공유된 찬양콘티 수
    try {
      const teamContisLocal = Object.keys(localStorage).filter(k => k.startsWith('ceum-team-') || k.startsWith('nations-team-'));
      setSharedContisCount(Math.max(teamContisLocal.length > 0 ? 1 : 0, savedContis.length > 0 ? 1 : 0));
    } catch {
      setSharedContisCount(0);
    }
  }, [isOpen, savedContis]);

  if (!isOpen) return null;

  const displayName = currentUser?.displayName || userProfile?.name || currentUser?.email?.split('@')[0] || '사용자';
  const email = currentUser?.email || userProfile?.email || '소셜 로그인 계정';
  const photo = currentUser?.photoURL || userProfile?.picture;

  // 통계 계산
  const albumCount = albums.length;
  const songCount = songs.length;
  const contiCount = savedContis.length;

  // 무료 플랜일 경우 제한
  const albumLimit = 1;
  const songLimit = 100;
  const contiLimit = 1;

  // 가로바 프로그레스 계산 (%)
  const albumPercent = currentPlan === 'free' ? Math.min(100, Math.round((albumCount / albumLimit) * 100)) : 100;
  const songPercent = currentPlan === 'free' ? Math.min(100, Math.round((songCount / songLimit) * 100)) : 100;
  const contiPercent = currentPlan === 'free' ? Math.min(100, Math.round((contiCount / contiLimit) * 100)) : 100;

  // 초대 링크
  const inviteCode = currentUser?.uid ? currentUser.uid.replace(/^(kakao:|naver:)/, '').slice(0, 8) : 'nations';
  const inviteUrl = `${window.location.origin}/?ref=${inviteCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // 기기 캐시 지우기 핸들러
  const handleClearCache = async () => {
    if (window.confirm('기기에 임시 저장된 악보 이미지 캐시를 지우시겠습니까?\n구글 드라이브 및 원본 악보 데이터는 안전하게 보관됩니다.')) {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        sessionStorage.clear();
        alert('기기 캐시가 안전하게 정리되었습니다.');
        setCacheSize('0.0 MB');
      } catch (err) {
        console.error('캐시 삭제 오류:', err);
        alert('캐시 정리 중 문제가 발생했습니다.');
      }
    }
  };

  // 계정 삭제 핸들러
  const handleDeleteAccount = async () => {
    const confirm1 = window.confirm(
      '정말로 계정을 삭제하시겠습니까?\n계정의 모든 캐시 데이터와 로그인 정보가 삭제됩니다.'
    );
    if (!confirm1) return;

    const confirm2 = window.prompt('계속 진행하시려면 "삭제"라고 입력해 주세요.');
    if (confirm2 !== '삭제') {
      alert('입력값이 일치하지 않아 취소되었습니다.');
      return;
    }

    try {
      localStorage.clear();
      sessionStorage.clear();
      alert('계정 정보가 초기화되었습니다.');
      onClose();
      if (onLogout) onLogout();
      else window.location.reload();
    } catch (err) {
      console.error('계정 삭제 중 오류:', err);
      alert('삭제 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn text-[#1C1A18]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-[#EAE8E1] rounded-3xl shadow-2xl overflow-hidden my-auto text-[#1C1A18]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="relative px-6 pt-6 pb-4 border-b border-[#EAE8E1] flex items-center justify-between bg-[#FBFBF9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FAF2ED] border border-[#F2DDD1] flex items-center justify-center text-[#DA7756] overflow-hidden shrink-0">
              {photo ? (
                <img src={photo} alt="User" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1C1A18] flex items-center gap-2">
                <span>{displayName}</span>
                <span className="text-[11px] font-semibold text-[#DA7756] bg-[#FAF2ED] px-2 py-0.5 rounded-full border border-[#F2DDD1]">
                  {planName}
                </span>
              </h2>
              <p className="text-xs text-[#7D786F] mt-0.5">{email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8C877D] hover:text-[#1C1A18] hover:bg-[#EFECE6] transition-colors cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 스크롤 영역 */}
        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto custom-scrollbar">
          {/* 플랜 업그레이드 배너 */}
          <div className="flex items-center justify-between bg-[#FAF9F7] border border-[#EAE8E1] rounded-2xl p-4">
            <div>
              <span className="text-xs font-bold text-[#1C1A18]">{planName} 이용 중</span>
              <p className="text-[11px] text-[#7D786F] mt-0.5">
                {currentPlan === 'free' ? '더 많은 앨범과 찬양팀 공유 기능을 원하시면 업그레이드하세요.' : '사역에 필요한 모든 기능을 사용하고 계십니다.'}
              </p>
            </div>
            {onOpenPricing && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPricing();
                }}
                className="text-xs font-bold text-[#DA7756] hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
              >
                플랜 업그레이드 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 1. 라이브러리 사용량 (가로바 형태) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#7D786F] tracking-wider uppercase">
              라이브러리 사용량
            </h3>

            <div className="bg-[#FAF9F7] border border-[#EAE8E1] rounded-2xl p-4 sm:p-5 space-y-4">
              {/* 앨범 가로바 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2C2B29]">앨범</span>
                  <span className="font-mono text-[11px] text-[#7D786F]">
                    {currentPlan === 'free' ? (
                      <>
                        <strong className="text-[#1C1A18] text-xs">{albumCount}</strong> / {albumLimit} free
                      </>
                    ) : (
                      <>
                        <strong className="text-[#DA7756] text-xs">100%</strong> ({planName})
                      </>
                    )}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#EAE6DF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1C1A18] rounded-full transition-all duration-500"
                    style={{ width: `${albumPercent}%` }}
                  />
                </div>
              </div>

              {/* 악보 수 가로바 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2C2B29]">악보 수</span>
                  <span className="font-mono text-[11px] text-[#7D786F]">
                    {currentPlan === 'free' ? (
                      <>
                        <strong className="text-[#1C1A18] text-xs">{songCount}</strong> / {songLimit} free
                      </>
                    ) : (
                      <>
                        <strong className="text-[#DA7756] text-xs">100%</strong> ({planName})
                      </>
                    )}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#EAE6DF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1C1A18] rounded-full transition-all duration-500"
                    style={{ width: `${songPercent}%` }}
                  />
                </div>
              </div>

              {/* 콘티 가로바 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2C2B29]">콘티</span>
                  <span className="font-mono text-[11px] text-[#7D786F]">
                    {currentPlan === 'free' ? (
                      <>
                        <strong className="text-[#1C1A18] text-xs">{contiCount}</strong> / {contiLimit} free
                      </>
                    ) : (
                      <>
                        <strong className="text-[#DA7756] text-xs">100%</strong> ({planName})
                      </>
                    )}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#EAE6DF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1C1A18] rounded-full transition-all duration-500"
                    style={{ width: `${contiPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. 라이브러리 현황 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#7D786F] tracking-wider uppercase">
              라이브러리 현황
            </h3>

            <div className="bg-[#FAF9F7] border border-[#EAE8E1] rounded-2xl p-4 space-y-3 text-xs">
              {/* 앨범이름 - 악보 개 */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#7D786F]">앨범 목록 및 악보 수</div>
                <div className="bg-white border border-[#EAE8E1] rounded-xl p-3 divide-y divide-[#F0EBE1] max-h-40 overflow-y-auto custom-scrollbar">
                  {albums.length === 0 ? (
                    <div className="py-2 text-center text-[#8C877D] text-[11px]">생성된 앨범이 없습니다.</div>
                  ) : (
                    albums.map(album => {
                      const count = songs.filter(s => (s as any).albumId === album.id).length;
                      return (
                        <div key={album.id} className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between">
                          <span className="font-medium text-[#2C2B29] truncate pr-2">{album.name}</span>
                          <span className="font-mono text-[#7D786F] shrink-0 font-bold">{count}개</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 콘티 개수 */}
              <div className="flex items-center justify-between p-3 bg-white border border-[#EAE8E1] rounded-xl">
                <span className="font-semibold text-[#2C2B29]">콘티</span>
                <span className="font-mono text-xs font-bold text-[#1C1A18]">{contiCount}개</span>
              </div>

              {/* 찬양팀공유콘티 개수 (TEAM 플랜 전용) */}
              <div className="flex items-center justify-between p-3 bg-white border border-[#EAE8E1] rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#2C2B29]">찬양팀공유콘티</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FAF0EB] text-[#DA7756] border border-[#F1D3C6]">
                    TEAM 플랜
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-[#1C1A18]">{sharedContisCount}개</span>
              </div>
            </div>
          </div>

          {/* 3. 기기 캐시 지우기 (단정하고 심플한 설명 디자인) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#7D786F] tracking-wider uppercase">
              기기 캐시 관리
            </h3>
            <div className="bg-[#FAF9F7] border border-[#EAE8E1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#1C1A18] flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-[#7D786F]" />
                  <span>기기 캐시 지우기</span>
                  <span className="font-mono text-[11px] text-[#8C877D] ml-1">({cacheSize})</span>
                </div>
                <p className="text-[11px] text-[#6E6A63] leading-relaxed">
                  악보 이미지를 빠르게 표시하기 위해 기기에 임시 보관된 데이터를 정리합니다.
                  구글 드라이브와 콘티 원본 데이터는 안전하게 보존되며, 용량 확보가 필요할 때 안심하고 실행하셔도 됩니다.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClearCache}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-white border border-[#DDD8CE] hover:bg-[#F3EFE9] text-[#2C2B29] text-xs font-semibold transition-all cursor-pointer shadow-2xs self-start sm:self-center"
              >
                캐시 지우기
              </button>
            </div>
          </div>

          {/* 4. 친구 초대 링크 */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#7D786F] tracking-wider uppercase">
              친구 초대 링크
            </h3>
            <div className="p-4 rounded-2xl bg-[#FAF9F7] border border-[#EAE8E1] space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className="w-full text-xs bg-white border border-[#E5E0D8] rounded-xl px-3 py-2 text-[#4A4741] select-all outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 px-3.5 py-2 bg-[#1C1A18] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  {copiedLink ? '복사됨!' : '복사'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  shareInviteViaKakao({
                    inviteUrl,
                    userName: displayName,
                    appName: 'NATIONS STUDIO'
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#191919]" aria-hidden="true">
                  <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
                </svg>
                <span>카카오톡으로 초대장 보내기</span>
              </button>
            </div>
          </div>

          {/* 5. 계정 삭제 */}
          <div className="pt-2 border-t border-[#EAE8E1]">
            <div className="p-4 rounded-2xl bg-[#FAF9F7] border border-[#EAE8E1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#1C1A18] flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>계정 삭제</span>
                </div>
                <p className="text-[11px] text-[#7D786F]">
                  로그인 정보와 로컬 캐시가 완전히 삭제되며 스튜디오에서 로그아웃됩니다.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDeleteAccount}
                className="shrink-0 px-3.5 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-all cursor-pointer"
              >
                계정 삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
