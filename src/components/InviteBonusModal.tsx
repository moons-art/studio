import React, { useState } from 'react';
import { X, Gift } from 'lucide-react';
import { shareInviteViaKakao } from '../utils/socialAuth';

interface InviteBonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  inviteCode?: string;
}

export const InviteBonusModal: React.FC<InviteBonusModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  inviteCode
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const resolvedCode =
    inviteCode ||
    (currentUser?.uid
      ? currentUser.uid.replace(/^(kakao:|naver:)/, '').slice(0, 8)
      : 'nations');
  const inviteUrl = `${window.location.origin}/?ref=${resolvedCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleKakaoShare = () => {
    shareInviteViaKakao({
      inviteUrl,
      userName: currentUser?.displayName || '성도',
      appName: 'NATIONS STUDIO',
      title: `[초대] ${currentUser?.displayName || '성도'}님이 찬양 콘티 스튜디오에 초대하셨습니다!`,
      description:
        '초대링크로 가입 후 무료 앨범 만들기 + 무료 첫 악보를 출력하면 SOLO 플랜 혜택을 함께 받으실 수 있습니다.'
    });
  };

  return (
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#EAE8E1] rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative text-[#1C1A18]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-[#8C877D] hover:text-[#1C1A18] p-1 rounded-lg cursor-pointer transition-colors"
          title="닫기"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 타이틀 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#DA7756]/15 flex items-center justify-center text-[#DA7756] shrink-0">
            <Gift className="w-5 h-5 stroke-[2px]" />
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg text-[#1C1A18] leading-tight">
              친구 초대 1+1 보너스
            </h3>
            <p className="text-[11px] text-[#8C877D] mt-0.5">찬양팀 동역자와 함께 나누는 특별한 혜택</p>
          </div>
        </div>

        {/* 혜택 박스 영역 */}
        <div className="space-y-3 mb-5">
          {/* 기본 혜택 카드 */}
          <div className="bg-[#FAF9F7] p-4 rounded-2xl border border-[#EAE8E1] text-xs text-[#4A4741] space-y-2.5">
            <div className="leading-relaxed text-[#2C2B29]">
              초대링크로 가입 한 친구(무료 앨범 만들기+무료 첫 악보를 출력한 친구에 한해){' '}
              <span className="font-bold text-[#DA7756]">5명을 모으면 SOLO 플랜 3개월 이용권</span> 지급!
            </div>
            <div className="pt-2 border-t border-[#EAE8E1] leading-relaxed text-[#2C2B29]">
              + 5명을 더 모으면(총 10명){' '}
              <span className="font-bold text-[#1C1A18]">SOLO 플랜 3개월 이용권 (or TEAM 플랜 1개월 이용권)</span> 지급!
            </div>
          </div>

          {/* 특별 혜택 카드 */}
          <div className="bg-white p-4 rounded-2xl border border-[#DA7756]/30 text-xs text-[#4A4741] space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-[#DA7756] text-xs">
              <span>★ 특별 혜택</span>
            </div>
            <p className="text-[12px] text-[#2C2B29] leading-relaxed">
              위 조건에 <strong>+5명을 추가(총 15명)</strong>하면{' '}
              <strong className="text-[#DA7756]">
                Nations Bible(네이션스 바이블: 나만의 성경주석) 6개월 구독권(or Nations Studio 3개월 이용권)
              </strong>
              을 드립니다.
            </p>
          </div>
        </div>

        {/* 초대 링크 복사 & 카카오톡 공유 */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#7D786F] block mb-1.5">
              나의 초대 링크
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full text-xs bg-[#F3EFE9] border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-[#4A4741] select-all outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 px-4 py-2.5 bg-[#1C1A18] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                {copiedLink ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleKakaoShare}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-[0.99]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#191919]" aria-hidden="true">
              <path d="M12 3C6.477 3 2 6.463 2 10.735c0 2.773 1.883 5.206 4.706 6.567-.156.567-.565 2.054-.647 2.375-.103.398.146.392.307.285.126-.084 2.01-1.365 2.818-1.919.908.132 1.849.202 2.816.202 5.523 0 10-3.463 10-7.51C22 6.463 17.523 3 12 3z" />
            </svg>
            <span>카카오톡으로 초대장 보내기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
