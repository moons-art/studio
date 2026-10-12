import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';

export interface SitePolicy {
  businessName: string;         // 서비스 / 상호명
  representative: string;       // 대표자명
  contactEmail: string;         // 고객센터 / 문의 이메일
  businessNumber: string;       // 사업자등록번호
  ecommerceNumber: string;      // 통신판매업신고번호
  copyright: string;            // 저작권 문구
  kakaoChannelName: string;     // 카카오톡 채널 이름
  kakaoChannelUrl: string;      // 카카오톡 채널 홈 URL
  kakaoChatUrl: string;         // 카카오톡 채널 1:1 채팅 URL
  termsOfService: string;       // 서비스 이용약관
  privacyPolicy: string;        // 개인정보 처리방침
  updatedAt?: number;
}

export const DEFAULT_SITE_POLICY: SitePolicy = {
  businessName: '네이션스 솔루션',
  representative: '',
  contactEmail: 'ymoonsik@gmail.com',
  businessNumber: '',
  ecommerceNumber: '',
  copyright: 'Copyright © 2026 Nations. All rights reserved.',
  kakaoChannelName: '네이션스 솔루션',
  kakaoChannelUrl: 'http://pf.kakao.com/_cxjBxaX',
  kakaoChatUrl: 'http://pf.kakao.com/_cxjBxaX/chat',
  termsOfService: `제1조 (목적)
본 약관은 네이션스 솔루션(이하 "회사")이 제공하는 찬양 악보, 콘티 작성, 예배 지원 및 관련 디지털 콘텐츠 서비스(이하 "서비스")의 이용 조건 및 절차에 관한 제반 사항을 규정함을 목적으로 합니다.

제2조 (용어의 정의)
1. "이용자"란 본 서비스에 접속하여 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.
2. "회원"이란 서비스에 개인정보를 제공하여 회원등록을 한 자로서, 서비스의 정보를 지속적으로 제공받으며 서비스를 계속적으로 이용할 수 있는 자를 말합니다.

제3조 (약관의 효력 및 변경)
1. 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.
2. 회사는 합리적인 사유가 발생할 경우 관련 법령에 위배되지 않는 범위 안에서 본 약관을 개정할 수 있습니다.

제4조 (서비스의 제공 및 변경)
1. 회사는 찬양 악보 검색, 콘티 편집, 팀 공유, 리더 뷰어, 클라우드 드라이브 연동 등 다양한 예배 지원 기능을 제공합니다.
2. 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 하나 시스템 점검 등 필요한 경우 일시 중단될 수 있습니다.

제5조 (지적재산권의 귀속 및 악보의 관리)
1. 서비스 내의 모든 UI 디자인 및 자체 소프트웨어 저작권은 회사에 귀속됩니다.
2. 찬양 악보 및 관련 음원 저작권은 원저작자 또는 한국음악저작권협회/사단법인 한국CCM사랑연합회 등에 귀속되며, 이용자가 소장하여 업로드하거나 연동한 악보는 개인 및 비영리 예배 활용 목적에 한하여 관리 및 이용되어야 합니다.

제6조 (면책조항)
1. 회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
2. 회사는 무료로 제공되는 서비스 이용과 관련하여 관련 법령에 특별한 규정이 없는 한 책임을 지지 않습니다.

부칙
본 약관은 2026년 1월 1일부터 시행됩니다.`,

  privacyPolicy: `네이션스 솔루션(이하 "회사")은 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다.

1. 개인정보의 수집 항목 및 수집 방법
- 필수 항목: 구글 계정 고유 식별자(UID), 이메일 주소, 이름(닉네임), 프로필 이미지 URL
- 자동 수집 항목: 접속 기기 환경 정보(OS, 브라우저 유형), 로그인 일시 및 횟수, 서비스 이용 기록
- 수집 방법: 구글 소셜 로그인 및 회원가입 시 이용자의 동의를 통한 수집

2. 개인정보의 수집 및 이용 목적
- 회원 식별 및 가입 의사 확인
- 개인별 콘티 데이터, 앨범 구성 및 구글 드라이브 폴더의 안전한 동기화
- 고객 문의 및 1:1 상담 응대

3. 개인정보의 보유 및 이용 기간
- 이용자의 개인정보는 회원 탈퇴 시까지 보유하며, 회원 탈퇴 시 지체 없이 파기합니다.
- 단, 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 관련 법령에서 정한 일정한 기간 동안 개인정보를 보관합니다.

4. 개인정보의 제3자 제공
회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우나 법령의 규정에 의한 경우는 예외로 합니다.

5. 개인정보 처리 위탁
- 인프라 및 데이터 저장: Google Cloud Platform (Firebase)
- 클라우드 드라이브 연동: Google Drive API (사용자 본인의 개인 구글 드라이브 스토리지와 직접 연동)

6. 이용자의 권리와 그 행사 방법
이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.

7. 개인정보 보호책임자 및 담당 부서
- 담당자: 네이션스 솔루션 개인정보보호팀
- 이메일: ymoonsik@gmail.com
- 카카오톡 1:1 문의: http://pf.kakao.com/_cxjBxaX/chat

공고일자: 2026년 1월 1일
시행일자: 2026년 1월 1일`
};

const STORAGE_KEY = 'nations_site_policy_cache_v1';

export async function getSitePolicy(): Promise<SitePolicy> {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      fetchRemoteSitePolicy().catch(() => {});
      return { ...DEFAULT_SITE_POLICY, ...parsed };
    }
  } catch (e) {}

  return await fetchRemoteSitePolicy();
}

export async function fetchRemoteSitePolicy(): Promise<SitePolicy> {
  try {
    const docRef = doc(db, 'settings', 'site_policy');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SitePolicy;
      const merged = { ...DEFAULT_SITE_POLICY, ...data };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    }
  } catch (err) {
    console.warn('[policyService] fetchRemoteSitePolicy fallback to default:', err);
  }
  return DEFAULT_SITE_POLICY;
}

export async function saveSitePolicy(policy: Partial<SitePolicy>): Promise<void> {
  const docRef = doc(db, 'settings', 'site_policy');
  const updated = {
    ...policy,
    updatedAt: Date.now()
  };

  await setDoc(docRef, updated, { merge: true });

  try {
    const full = { ...DEFAULT_SITE_POLICY, ...updated };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    window.dispatchEvent(new CustomEvent('site-policy-updated', { detail: full }));
  } catch (e) {}
}

export function subscribeSitePolicy(onUpdate: (policy: SitePolicy) => void): () => void {
  const docRef = doc(db, 'settings', 'site_policy');
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      const merged = { ...DEFAULT_SITE_POLICY, ...(snap.data() as SitePolicy) };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {}
      onUpdate(merged);
    } else {
      onUpdate(DEFAULT_SITE_POLICY);
    }
  }, (err) => {
    console.warn('[policyService] subscribeSitePolicy error:', err);
    onUpdate(DEFAULT_SITE_POLICY);
  });
}
