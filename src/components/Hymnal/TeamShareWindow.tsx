import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHymnal } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { gdriveWebService } from '../../api/gdriveWebService';
import { db } from '../../api/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, doc, setDoc, getDocs, updateDoc } from 'firebase/firestore';
import { 
  ChevronLeft, ChevronRight, Share2, Copy, Check, MessageSquare, Send, 
  Trash2, Megaphone, Edit2, Video, Music, Radio, 
  Eye, ScrollText, StickyNote, X, Play, Users, UserCheck, Clock, ShieldCheck, Sparkles, User, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CommentItem {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  timestamp?: number;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  lastActive: number;
}

const SONG_FORM_PRESETS = ['Intro', 'V1', 'V2', 'Chorus', 'Bridge', 'Interlude', 'Outro', '엔딩'];

const ROLE_PRESETS = ['인도자', '드럼', '일렉', '베이스', '어쿠스틱', '메인건반', '세컨건반', '싱어', '엔지니어', '방송실', '기타'];

const EMOJI_PRESETS = ['🙏', '🕊️', '❤️', '👏', '🔥', '🎵', '🎹', '🎸', '🥁', '🎤', '😭', '🙌', '✨', '👍', '😊'];

const SIGNAL_PRESETS = [
  { id: 'repeat', label: '후렴 반복', icon: '🔁', desc: '코러스를 한 번 더 반복합니다' },
  { id: 'ending', label: '엔딩 (Ending)', icon: '🏁', desc: '곡을 마무리합니다' },
  { id: 'next_intro', label: '다음곡 인트로 준비', icon: '⏩', desc: '다음 곡 전주를 준비해주세요' },
  { id: 'piano_only', label: '건반(피아노)만', icon: '🎹', desc: '건반 반주만 잔잔하게 이어갑니다' },
  { id: 'acoustic_only', label: '어쿠스틱만', icon: '🎸', desc: '어쿠스틱 기타 중심으로 연주합니다' },
  { id: 'buildup', label: '드럼 / 빌드업', icon: '🥁', desc: '에너지를 고조시켜 빌드업합니다' },
  { id: 'all_sing', label: '모두 함께 찬양', icon: '👥', desc: '회중과 함께 목소리를 높입니다' },
  { id: 'prayer', label: '기도 / 멘트', icon: '💬', desc: '반주를 깔고 기도/멘트를 진행합니다' },
  { id: 'key_up', label: '1옥타브 UP!', icon: '⬆️', desc: '한 옥타브 올려서 힘차게 부릅니다' },
];

export const TeamShareWindow: React.FC<{
  onClose?: () => void;
  initialContiId?: string | null;
}> = ({ onClose, initialContiId }) => {
  const { savedContis, songs } = useHymnal();

  // 0. 예배팀 이름 상태
  const [worshipTeamName, setWorshipTeamName] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const paramTeam = params.get('team');
    if (paramTeam) return decodeURIComponent(paramTeam);
    return localStorage.getItem('nations-worship-team-name') || localStorage.getItem('ceum-worship-team-name') || 'NATIONS 찬양팀';
  });
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState(worshipTeamName);

  // 팀원 첫 접속 시 담당(파트) 및 이름/별명 설정 모달 상태
  const [showWelcomeModal, setShowWelcomeModal] = useState(() => {
    const hasAuthor = localStorage.getItem('ceum-team-author');
    const hasRole = localStorage.getItem('ceum-team-role');
    const params = new URLSearchParams(window.location.search);
    const isSharedMode = params.get('mode') === 'team-share' || !!params.get('team');
    return isSharedMode && (!hasAuthor || !hasRole);
  });
  const [myRole, setMyRole] = useState(() => localStorage.getItem('ceum-team-role') || '싱어');
  const [customRole, setCustomRole] = useState('');
  const [myNick, setMyNick] = useState(() => localStorage.getItem('ceum-team-author') || '');

  // 인도자 여부: 앱 내부에서 창을 연 경우(onClose 제공됨) 또는 공유 파라미터가 없는 경우
  const isLeader = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return !!onClose || params.get('mode') !== 'team-share';
  }, [onClose]);

  // 팀장(부계정) 및 팀원 목록 상태
  const [managers, setManagers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  // 프로필(담당/별명) 수정 모달 상태
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileRoleDraft, setProfileRoleDraft] = useState(myRole);
  const [profileCustomRoleDraft, setProfileCustomRoleDraft] = useState(customRole);
  const [profileNickDraft, setProfileNickDraft] = useState(myNick);
  const [isMigratingProfile, setIsMigratingProfile] = useState(false);

  // 찬양팀 접속 시 브라우저 뒤로가기로 메인 앱 이탈 방지
  useEffect(() => {
    if (!onClose) {
      window.history.pushState(null, '', window.location.href);
      const handlePopState = (e: PopStateEvent) => {
        window.history.pushState(null, '', window.location.href);
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [onClose]);

  // 내 전체 작성자 식별자 (예: [드럼] 김찬양)
  const myFullAuthor = useMemo(() => {
    const role = localStorage.getItem('ceum-team-role') || myRole;
    const author = localStorage.getItem('ceum-team-author') || myNick;
    if (role && author) return `[${role}] ${author}`;
    if (author) return author;
    return '팀원';
  }, [myRole, myNick]);

  // 관리 권한자(공지/송폼/오래된글 삭제 권한): 인도자이거나 팀장으로 지정된 사람
  const isManager = useMemo(() => {
    if (isLeader) return true;
    return managers.includes(myFullAuthor) || managers.includes(myNick);
  }, [isLeader, managers, myFullAuthor, myNick]);

  // 카카오톡 스타일 채팅 자동 스크롤 Ref
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Firestore 팀장 목록 실시간 구독
  useEffect(() => {
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const roleDocRef = doc(db, 'teams', cleanTeamId, 'meta', 'roles');
    const unsubscribe = onSnapshot(roleDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setManagers(data.managers || []);
      } else {
        setManagers([]);
      }
    }, err => console.warn('[TeamShareWindow] roles onSnapshot error:', err));
    return () => unsubscribe();
  }, [worshipTeamName]);

  // Firestore 등록된 팀원 목록 실시간 구독 (인도자용)
  useEffect(() => {
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const membersColRef = collection(db, 'teams', cleanTeamId, 'members');
    const q = query(membersColRef, orderBy('lastActive', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: TeamMember[] = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        role: d.data().role || '',
        lastActive: d.data().lastActive || Date.now()
      }));
      setTeamMembers(list);
    }, err => console.warn('[TeamShareWindow] members onSnapshot error:', err));
    return () => unsubscribe();
  }, [worshipTeamName]);

  // 팀원 Firestore 등록 헬퍼
  const registerMemberToFirestore = async (roleName: string, authorName: string) => {
    if (!authorName) return;
    try {
      const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
      const memberId = `${roleName}_${authorName}`.replace(/[\/\s#?]/g, '_');
      const memberRef = doc(db, 'teams', cleanTeamId, 'members', memberId);
      await setDoc(memberRef, {
        name: authorName,
        role: roleName,
        lastActive: Date.now()
      }, { merge: true });
    } catch (e) {
      console.warn('Register member failed:', e);
    }
  };

  // 팀장 토글 함수 (인도자 전용)
  const handleToggleManager = async (targetIdentifier: string) => {
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const newManagers = managers.includes(targetIdentifier)
      ? managers.filter(m => m !== targetIdentifier)
      : [...managers, targetIdentifier];
    
    setManagers(newManagers);
    try {
      const roleDocRef = doc(db, 'teams', cleanTeamId, 'meta', 'roles');
      await setDoc(roleDocRef, { managers: newManagers }, { merge: true });
    } catch (e) {
      console.error('Update managers failed:', e);
    }
  };

  // 오래된 글 일괄 삭제 함수 (10일 / 30일)
  const handleDeleteOldComments = async (days: number) => {
    if (!confirm(`정말로 ${days}일 이전의 오래된 대화 글들을 모두 정리하시겠습니까?`)) return;
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const cutoffTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const commentsColRef = collection(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'comments');
      const snap = await getDocs(commentsColRef);
      
      let deletedCount = 0;
      const deletePromises = snap.docs.filter(d => {
        const data = d.data();
        return (data.timestamp || 0) < cutoffTimestamp;
      }).map(d => {
        deletedCount++;
        return deleteDoc(d.ref);
      });

      await Promise.all(deletePromises);
      alert(`${days}일 이전의 대화 ${deletedCount}개가 깨끗하게 정리되었습니다.`);
    } catch (err: any) {
      console.error('Delete old comments error:', err);
      alert('오래된 글 삭제 중 오류 발생: ' + err.message);
    }
  };

  // 프로필(담당 파트/별명) 수정 및 기존 작성 글/데이터 일괄 이양 함수
  const handleUpdateProfileAndMigrate = async () => {
    const finalRole = profileRoleDraft === '기타' ? (profileCustomRoleDraft.trim() || '기타') : profileRoleDraft;
    const finalAuthor = profileNickDraft.trim() || '팀원';
    const newFullAuthor = `[${finalRole}] ${finalAuthor}`;
    const oldFullAuthor = myFullAuthor;
    const oldNick = myNick;
    const oldRole = myRole;

    if (finalRole === oldRole && finalAuthor === oldNick) {
      setShowProfileEditModal(false);
      return;
    }

    setIsMigratingProfile(true);
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');

    try {
      // 1. 내가 남겼던 기존 댓글(채팅)의 작성자명을 새 프로필로 일괄 이양
      if (selectedContiId) {
        const commentsColRef = collection(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'comments');
        const snap = await getDocs(commentsColRef);

        const updatePromises = snap.docs.filter(docSnap => {
          const author = docSnap.data().author || '';
          return author === oldFullAuthor || author === oldNick || (oldNick && author.includes(oldNick));
        }).map(docSnap => {
          return updateDoc(docSnap.ref, { author: newFullAuthor });
        });

        await Promise.all(updatePromises);
      }

      // 2. 팀원 명부 갱신 (이전 멤버 문서 삭제 및 새 멤버 등록)
      const oldMemberId = `${oldRole}_${oldNick}`.replace(/[\/\s#?]/g, '_');
      const newMemberId = `${finalRole}_${finalAuthor}`.replace(/[\/\s#?]/g, '_');
      if (oldMemberId !== newMemberId) {
        try {
          await deleteDoc(doc(db, 'teams', cleanTeamId, 'members', oldMemberId));
        } catch {}
      }
      await setDoc(doc(db, 'teams', cleanTeamId, 'members', newMemberId), {
        name: finalAuthor,
        role: finalRole,
        lastActive: Date.now()
      }, { merge: true });

      // 3. 팀장(부계정) 권한 목록 이양
      if (managers.includes(oldFullAuthor) || managers.includes(oldNick)) {
        const newManagers = managers.map(m => (m === oldFullAuthor || m === oldNick) ? newFullAuthor : m);
        const roleDocRef = doc(db, 'teams', cleanTeamId, 'meta', 'roles');
        await setDoc(roleDocRef, { managers: newManagers }, { merge: true });
        setManagers(newManagers);
      }

      // 4. 로컬 스토리지 및 State 동기화
      localStorage.setItem('ceum-team-role', finalRole);
      localStorage.setItem('ceum-team-author', finalAuthor);
      setMyRole(finalRole);
      setCustomRole(finalRole);
      setMyNick(finalAuthor);
      setNewCommentAuthor(newFullAuthor);

      // 로컬 대화 목록에 즉시 이양 반영
      setComments(prev => prev.map(c => {
        const isMine = c.author === oldFullAuthor || c.author === oldNick || (oldNick && c.author.includes(oldNick));
        return isMine ? { ...c, author: newFullAuthor } : c;
      }));

      setShowProfileEditModal(false);
      alert(`프로필이 '${newFullAuthor}'(으)로 변경되었습니다.\n기존에 남기신 모든 글과 권한이 새 프로필로 안전하게 이양되었습니다.`);
    } catch (err: any) {
      console.error('Profile migration failed:', err);
      alert('프로필 변경 중 오류 발생: ' + err.message);
    } finally {
      setIsMigratingProfile(false);
    }
  };

  // 1. 콘티 선택 상태
  const [selectedContiId, setSelectedContiId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const paramConti = params.get('contiId');
    if (paramConti) return paramConti;
    if (initialContiId) return initialContiId;
    if (savedContis.length > 0) {
      const sorted = [...savedContis].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return sorted[0].id;
    }
    return '';
  });

  useEffect(() => {
    if (!selectedContiId && savedContis.length > 0) {
      setSelectedContiId(savedContis[0].id);
    }
  }, [savedContis, selectedContiId]);

  // Firestore 공유 콘티 상태 (팀원 접속 시 수천곡 악보 DB 없이 오직 이 콘티만 가볍게 수신)
  const [cloudContiData, setCloudContiData] = useState<any>(null);

  // 팀원 접속자: Firestore에서 해당 콘티 데이터 1개만 초경량 실시간 구독
  useEffect(() => {
    if (!selectedContiId) return;
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const contiDocRef = doc(db, 'teams', cleanTeamId, 'contis', selectedContiId);

    const unsubscribe = onSnapshot(contiDocRef, (snap) => {
      if (snap.exists()) {
        setCloudContiData(snap.data());
      }
    }, err => console.warn('[TeamShareWindow] cloud conti snapshot error:', err));

    return () => unsubscribe();
  }, [selectedContiId, worshipTeamName]);

  // 현재 콘티 객체 (인도자는 로컬/구글드라이브의 currentConti, 팀원은 Firestore의 cloudContiData)
  const currentConti = useMemo(() => {
    const local = savedContis.find(c => c.id === selectedContiId);
    if (local) return local;
    if (cloudContiData) return cloudContiData;
    return null;
  }, [savedContis, selectedContiId, cloudContiData]);

  const effectiveConti = currentConti;

  // 콘티에 배치된 곡 목록 (정렬순 - 초경량 호환)
  const contiSongsWithItems = useMemo(() => {
    if (currentConti && currentConti.items && songs.length > 0) {
      return currentConti.items
        .filter((item: any) => item.isVisible !== false)
        .map((item: any, idx: number) => {
          const song = songs.find(s => {
            if (!s || !s.id || !item.songId) return false;
            const sId = s.id.toString();
            const tId = item.songId.toString();
            return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
          });
          return { item, song, index: idx };
        });
    }

    // 팀원 접속자: Firestore의 cloudContiData.songsInfo에서 가볍게 구성!
    if (cloudContiData && cloudContiData.songsInfo) {
      return cloudContiData.songsInfo.map((info: any, idx: number) => ({
        item: {
          id: info.itemId,
          songId: info.songId,
          crop: info.crop,
          memo: info.memo,
          isVisible: true
        },
        song: {
          id: info.songId,
          title: info.title,
          code: info.code,
          meter: info.meter,
          number: info.number,
          filePath: info.filePath,
          fileId: info.fileId,
          youtubeVideos: info.youtubeVideos || []
        },
        index: idx
      }));
    }

    return [];
  }, [currentConti, songs, cloudContiData]);

  // 인도자: 콘티 및 곡 메타데이터를 Firestore에 자동 발행(Publish)하여 팀원이 가볍게 받을 수 있도록 함
  useEffect(() => {
    if (!isLeader || !currentConti || !selectedContiId || contiSongsWithItems.length === 0) return;
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const contiDocRef = doc(db, 'teams', cleanTeamId, 'contis', selectedContiId);

    const songsInfo = contiSongsWithItems.map(({ item, song, index }) => ({
      itemId: item.id,
      songId: song?.id || item.songId,
      title: song?.title || '제목 없음',
      code: song?.code || '',
      meter: song?.meter || '',
      number: song?.number || 0,
      filePath: song?.filePath || '',
      fileId: song?.fileId || '',
      crop: item.crop || null,
      memo: item.memo || '',
      youtubeVideos: song?.youtubeVideos || []
    }));

    setDoc(contiDocRef, {
      id: currentConti.id,
      title: currentConti.title,
      updatedAt: currentConti.updatedAt || new Date().toISOString(),
      items: currentConti.items || [],
      songsInfo,
      publishedAt: Date.now()
    }, { merge: true }).catch(console.warn);
  }, [isLeader, currentConti, selectedContiId, worshipTeamName, contiSongsWithItems.length]);

  // 2. 뷰 모드: 'scroll' (스크롤 종합 뷰) vs 'viewer' (실전 악보 뷰어)
  const [viewMode, setViewMode] = useState<'scroll' | 'viewer'>('scroll');
  const [currentViewerIndex, setCurrentViewerIndex] = useState(0);

  // 3. 복사 피드백
  const [isCopied, setIsCopied] = useState(false);

  // 4. 리더 공지 상태
  const [notice, setNotice] = useState<string>('');
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');

  useEffect(() => {
    if (!selectedContiId) return;
    const cloudNotice = currentConti?.notice;
    const localNotice = localStorage.getItem(`ceum-team-notice-${selectedContiId}`);
    const activeNotice = cloudNotice !== undefined ? cloudNotice : (localNotice || '');
    setNotice(activeNotice);
    setNoticeDraft(activeNotice);
  }, [selectedContiId, currentConti]);

  const handleSaveNotice = async () => {
    setNotice(noticeDraft);
    localStorage.setItem(`ceum-team-notice-${selectedContiId}`, noticeDraft);
    setIsEditingNotice(false);

    // 구글 드라이브 콘티 저장소에도 즉시 영구 반영
    if (currentConti) {
      const updatedConti = { ...currentConti, notice: noticeDraft };
      await hymnalApi.saveConti(updatedConti).catch(console.error);
    }
  };

  // 5. 송폼 (Song Form) 상태
  const [songForms, setSongForms] = useState<Record<string, string>>({});
  const [editingSongFormId, setEditingSongFormId] = useState<string | null>(null);
  const [songFormDraft, setSongFormDraft] = useState<string>('');

  useEffect(() => {
    if (!selectedContiId) return;
    const loaded: Record<string, string> = {};
    const cloudSongForms = currentConti?.songForms || {};
    contiSongsWithItems.forEach(({ item, song }) => {
      const saved = cloudSongForms[item.id] || localStorage.getItem(`ceum-song-form-${selectedContiId}-${item.id}`);
      if (saved) {
        loaded[item.id] = saved;
      } else if (song?.songForm) {
        loaded[item.id] = song.songForm;
      }
    });
    setSongForms(loaded);
  }, [selectedContiId, contiSongsWithItems, currentConti]);

  const handleSaveSongForm = async (itemId: string) => {
    const updatedForms = { ...songForms, [itemId]: songFormDraft };
    setSongForms(updatedForms);
    localStorage.setItem(`ceum-song-form-${selectedContiId}-${itemId}`, songFormDraft);
    setEditingSongFormId(null);

    // 구글 드라이브 콘티 저장소에도 영구 저장
    if (currentConti) {
      const updatedConti = { 
        ...currentConti, 
        songForms: { ...(currentConti.songForms || {}), [itemId]: songFormDraft } 
      };
      await hymnalApi.saveConti(updatedConti).catch(console.error);
    }
  };

  const handleSaveTeamName = async () => {
    const finalName = teamNameDraft.trim() || 'NATIONS 찬양팀';
    setWorshipTeamName(finalName);
    localStorage.setItem('nations-worship-team-name', finalName);
    localStorage.setItem('ceum-worship-team-name', finalName);
    setIsEditingTeamName(false);
  };


  // 6. 글남기기 (찬양팀 소통판) 상태 - Firebase Firestore 실시간 연동
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newCommentAuthor, setNewCommentAuthor] = useState(() => {
    const role = localStorage.getItem('ceum-team-role') || '';
    const author = localStorage.getItem('ceum-team-author') || '';
    if (role && author) return `[${role}] ${author}`;
    if (author) return author;
    return '팀원';
  });
  const [newCommentContent, setNewCommentContent] = useState('');

  // Firestore 실시간 댓글 구독 (onSnapshot) - 시간순(과거 -> 최신) 정렬
  useEffect(() => {
    if (!selectedContiId) return;

    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const commentsColRef = collection(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'comments');
    const q = query(commentsColRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: CommentItem[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          author: data.author || '팀원',
          content: data.content || '',
          createdAt: data.createdAt || '',
          timestamp: data.timestamp
        };
      });
      setComments(loaded);
      try {
        localStorage.setItem(`ceum-team-comments-${selectedContiId}`, JSON.stringify(loaded));
      } catch {}
    }, (err) => {
      console.warn('[TeamShareWindow] Firestore comments onSnapshot fallback:', err);
      try {
        const saved = localStorage.getItem(`ceum-team-comments-${selectedContiId}`);
        if (saved) setComments(JSON.parse(saved));
      } catch {}
    });

    return () => unsubscribe();
  }, [selectedContiId, worshipTeamName]);

  // 카카오톡 스타일: 새 글 또는 진입 시 최하단으로 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleAddComment = async () => {
    if (!newCommentContent.trim()) return;
    const author = newCommentAuthor.trim() || '팀원';
    localStorage.setItem('ceum-team-author', author);

    const role = localStorage.getItem('ceum-team-role') || '팀원';
    registerMemberToFirestore(role, author.replace(/\[.*?\]\s*/, ''));

    const nowStr = new Date().toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const contentToSend = newCommentContent.trim();
    setNewCommentContent('');

    try {
      const commentsColRef = collection(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'comments');
      await addDoc(commentsColRef, {
        author,
        content: contentToSend,
        createdAt: nowStr,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[TeamShareWindow] Firestore addDoc failed:', err);
      // 오프라인/에러 시 로컬 폴백
      const fallback: CommentItem = {
        id: Date.now().toString(),
        author,
        content: contentToSend,
        createdAt: nowStr
      };
      const updated = [fallback, ...comments];
      setComments(updated);
      try {
        localStorage.setItem(`ceum-team-comments-${selectedContiId}`, JSON.stringify(updated));
      } catch {}
    }
  };

  const handleDeleteComment = async (id: string) => {
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    try {
      const docRef = doc(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'comments', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('[TeamShareWindow] Firestore deleteDoc failed:', err);
    }
    setComments(prev => prev.filter(c => c.id !== id));
  };

  // 7. 개인 메모장 (실전 뷰어 모드용)
  const [personalMemos, setPersonalMemos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedContiId) return;
    const loaded: Record<string, string> = {};
    contiSongsWithItems.forEach(({ item }) => {
      const saved = localStorage.getItem(`ceum-personal-memo-${selectedContiId}-${item.id}`);
      if (saved) loaded[item.id] = saved;
    });
    setPersonalMemos(loaded);
  }, [selectedContiId, contiSongsWithItems]);

  const handleUpdatePersonalMemo = (itemId: string, val: string) => {
    setPersonalMemos(prev => ({ ...prev, [itemId]: val }));
    localStorage.setItem(`ceum-personal-memo-${selectedContiId}-${itemId}`, val);
  };

  // 8. 신호 (Signal) 메뉴 및 실시간 브로드캐스트 (Firestore + BroadcastChannel)
  const [isSignalMenuOpen, setIsSignalMenuOpen] = useState(false);
  const [activeSignal, setActiveSignal] = useState<{ id: string; label: string; icon: string; desc: string } | null>(null);

  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // 로컬 탭 간 BroadcastChannel
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('nations_team_signal_channel');
      broadcastRef.current = bc;
      bc.onmessage = (event) => {
        if (event.data && event.data.signal) {
          triggerSignalDisplay(event.data.signal);
        }
      };
      return () => {
        bc.close();
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported', e);
    }
  }, []);

  // Firestore 실시간 원격 신호 수신 (팀원 전체 실시간 동기화)
  useEffect(() => {
    if (!selectedContiId) return;
    const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
    const signalDocRef = doc(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'realtime_signals', 'current');
    
    let lastSignalTimestamp = Date.now();
    const unsubscribe = onSnapshot(signalDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.signal && data.timestamp > lastSignalTimestamp) {
          lastSignalTimestamp = data.timestamp;
          triggerSignalDisplay(data.signal);
        }
      }
    }, (err) => {
      console.warn('[TeamShareWindow] Signal onSnapshot error:', err);
    });

    return () => unsubscribe();
  }, [selectedContiId, worshipTeamName]);

  const triggerSignalDisplay = (sig: typeof SIGNAL_PRESETS[0]) => {
    setActiveSignal(sig);
    setTimeout(() => {
      setActiveSignal(curr => (curr?.id === sig.id ? null : curr));
    }, 6000);
  };

  const handleSendSignal = async (sig: typeof SIGNAL_PRESETS[0]) => {
    triggerSignalDisplay(sig);
    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ signal: sig });
    }
    setIsSignalMenuOpen(false);

    // Firestore 실시간 신호 전송 (모든 팀원 화면에 0.1초 만에 팝업)
    try {
      const cleanTeamId = (worshipTeamName || 'default_team').trim().replace(/[\/\s#?]/g, '_');
      const signalDocRef = doc(db, 'teams', cleanTeamId, 'contis', selectedContiId, 'realtime_signals', 'current');
      await setDoc(signalDocRef, {
        signal: sig,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[TeamShareWindow] Firestore signal broadcast error:', err);
    }
  };

  // 9. 구글 드라이브 Blob 이미지 캐싱
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;
    contiSongsWithItems.forEach(({ song }) => {
      if (!song) return;
      const fileId = song.fileId || song.filePath || song.filename;
      if (fileId && fileId.length > 20 && !fileId.startsWith('/') && !blobUrls[song.id]) {
        gdriveWebService.downloadImageBlob(fileId).then(url => {
          if (isMounted && url) {
            setBlobUrls(prev => ({ ...prev, [song.id]: url }));
          }
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [contiSongsWithItems, blobUrls]);

  // 10. 접속주소 복사
  const handleCopyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?mode=team-share&team=${encodeURIComponent(worshipTeamName)}&contiId=${selectedContiId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    } else {
      hymnalApi.writeClipboard(url);
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  // 11. 유튜브 인라인 플레이어 열림 상태
  const [openVideoKeys, setOpenVideoKeys] = useState<Record<string, boolean>>({});
  const toggleVideo = (key: string) => {
    setOpenVideoKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getYoutubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}?autoplay=1` : null;
  };

  // 키보드 방향키 조작 (실전 뷰어 모드)
  useEffect(() => {
    if (viewMode !== 'viewer') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentViewerIndex(prev => Math.min(contiSongsWithItems.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentViewerIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        setViewMode('scroll');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, contiSongsWithItems.length]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#FAF9F5] flex flex-col overflow-hidden text-[#2B2927] select-none">
      {/* 1. 상단 글로벌 헤더 바 */}
      <header className="px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-[#E5E0D8] flex items-center justify-between gap-3 shadow-2xs z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          {onClose ? (
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-[#F3EFE9] text-[#6A6864] hover:text-[#2B2927] rounded-lg transition-colors cursor-pointer"
              title="메인 화면으로 나가기"
            >
              <ChevronLeft className="w-5 h-5 stroke-[1.8px]" />
            </button>
          ) : (
            /* 팀원 모드: 메인 화면 링크를 전혀 두지 않아 메인 앱으로의 이탈 방지 */
            <div 
              className="w-8 h-8 rounded-xl bg-[#FAF0EB] text-[#D97757] flex items-center justify-center font-bold text-sm border border-[#F1D3C6] shrink-0 shadow-2xs select-none" 
              title="찬양팀 전용 실시간 뷰어"
            >
              🕊️
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <Share2 className="w-4 h-4 text-[#D97757] stroke-[1.8px]" />
            {isEditingTeamName && isLeader ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  className="bg-[#FAF9F5] border border-[#D97757] rounded px-2 py-0.5 text-xs font-bold text-[#2B2927] focus:outline-none w-28 sm:w-36"
                  placeholder="예배팀 이름"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTeamName();
                  }}
                />
                <button
                  onClick={handleSaveTeamName}
                  className="text-[11px] bg-[#D97757] hover:bg-[#C96442] text-white px-2 py-0.5 rounded font-semibold cursor-pointer"
                >
                  저장
                </button>
              </div>
            ) : (
              <div 
                className={`flex items-center gap-1 group/team ${isLeader ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (isLeader) {
                    setTeamNameDraft(worshipTeamName);
                    setIsEditingTeamName(true);
                  }
                }}
                title={isLeader ? "클릭하여 예배팀 이름 변경" : worshipTeamName}
              >
                <h1 className="font-serif text-sm sm:text-base font-bold text-[#2B2927] tracking-tight hover:text-[#D97757] transition-colors">{worshipTeamName}</h1>
                {isLeader && (
                  <Edit2 className="w-3 h-3 text-[#A8A49C] group-hover/team:text-[#D97757] transition-colors" />
                )}
              </div>
            )}
          </div>

          {/* 콘티 셀렉터 드롭다운 (인도자 또는 팀원 초경량 콘티) */}
          <div className="ml-2">
            <select
              value={selectedContiId}
              onChange={(e) => {
                setSelectedContiId(e.target.value);
                setCurrentViewerIndex(0);
              }}
              className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2B2927] focus:outline-none focus:border-[#D97757] cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
            >
              {savedContis.length > 0 ? (
                savedContis.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title || '무제목 콘티'} ({c.items?.length || 0}곡)
                  </option>
                ))
              ) : (
                <option value={selectedContiId}>
                  {effectiveConti?.title || '예배 콘티'} ({contiSongsWithItems.length}곡)
                </option>
              )}
            </select>
          </div>
        </div>

        {/* 우측 조작 액션 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 내 프로필 수정 버튼 (언제든 내 담당 파트와 별명 변경 및 기존 글 이양) */}
          <button
            onClick={() => {
              setProfileRoleDraft(myRole);
              setProfileCustomRoleDraft(customRole);
              setProfileNickDraft(myNick);
              setShowProfileEditModal(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FAF9F5] hover:bg-[#F3EFE9] text-[#2B2927] border border-[#E5E0D8] rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title="내 담당 파트 및 별명 수정 (기존 작성 글 일괄 이양)"
          >
            <User className="w-3.5 h-3.5 text-[#D97757]" />
            <span className="max-w-[90px] sm:max-w-[130px] truncate">{myFullAuthor || '내 프로필'}</span>
            <Edit2 className="w-2.5 h-2.5 text-[#8C877D]" />
          </button>

          {/* 인도자 전용: 팀원 및 팀장(부계정) 관리 버튼 */}
          {isLeader && (
            <button
              onClick={() => setShowManagerModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FAF0EB] hover:bg-[#F7E5DB] text-[#D97757] border border-[#F1D3C6] rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title="팀원 및 부계정(팀장) 권한 관리"
            >
              <Users className="w-3.5 h-3.5 stroke-[2px]" />
              <span className="hidden sm:inline">팀원/팀장 관리</span>
              <span className="inline sm:hidden">팀원/팀장</span>
              {managers.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-[#D97757] text-white text-[10px] rounded-full font-bold leading-none">
                  {managers.length}
                </span>
              )}
            </button>
          )}

          {/* 접속주소 복사 버튼 */}
          <button
            onClick={handleCopyShareLink}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              isCopied 
                ? 'bg-[#EBF7EE] text-[#2E7D32] border border-[#C8E6C9]' 
                : 'bg-[#FAF0EB] hover:bg-[#F7E5DB] text-[#D97757] border border-[#F1D3C6]'
            }`}
            title="찬양팀 전용 접속 링크 복사"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 stroke-[2px]" /> : <Copy className="w-3.5 h-3.5 stroke-[1.8px]" />}
            <span className="hidden sm:inline">{isCopied ? '접속주소 복사됨!' : '접속주소 복사'}</span>
            <span className="inline sm:hidden">{isCopied ? '복사됨' : '주소복사'}</span>
          </button>

          {/* 뷰 모드 전환 버튼 (스크롤 ↔ 실전 뷰어) */}
          <div className="flex bg-[#F3EFE9] p-0.5 rounded-lg border border-[#E5E0D8]">
            <button
              onClick={() => setViewMode('scroll')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'scroll' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5 stroke-[1.8px]" />
              <span className="hidden md:inline">스크롤 뷰</span>
            </button>
            <button
              onClick={() => setViewMode('viewer')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'viewer' ? 'bg-white text-[#2B2927] shadow-2xs font-semibold' : 'text-[#8C877D] hover:text-[#2B2927]'
              }`}
            >
              <Eye className="w-3.5 h-3.5 stroke-[1.8px]" />
              <span>실전 뷰어</span>
            </button>
          </div>

          {/* 인도자 신호 메뉴 버튼 */}
          <div className="relative">
            <button
              onClick={() => setIsSignalMenuOpen(!isSignalMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-lg text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="찬양팀 실시간 신호 보내기"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>신호</span>
            </button>

            {/* 신호 드롭다운 팝업 */}
            <AnimatePresence>
              {isSignalMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  className="absolute right-0 mt-2 w-64 bg-white border border-[#E5E0D8] rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between px-2 py-1 border-b border-[#E5E0D8] mb-1">
                    <span className="text-[11px] font-bold text-[#8C877D] uppercase tracking-wider">인도자 시그널</span>
                    <button onClick={() => setIsSignalMenuOpen(false)} className="text-[#8C877D] hover:text-[#2B2927] cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {SIGNAL_PRESETS.map(sig => (
                    <button
                      key={sig.id}
                      onClick={() => handleSendSignal(sig)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-[#FAF0EB] transition-colors group cursor-pointer"
                    >
                      <span className="text-base">{sig.icon}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#2B2927] group-hover:text-[#D97757]">{sig.label}</span>
                        <span className="text-[10px] text-[#8C877D]">{sig.desc}</span>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* 2. 실시간 신호 알림 오버레이 배너 (화면 중앙/상단) */}
      <AnimatePresence>
        {activeSignal && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.9 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[10000] max-w-md w-[90vw] pointer-events-none"
          >
            <div className="bg-[#2B2927] text-white border-2 border-[#D97757] px-6 py-4 rounded-3xl shadow-2xl flex items-center justify-between gap-4 animate-bounce">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeSignal.icon}</span>
                <div>
                  <h3 className="font-serif text-lg font-black text-[#FAF9F5] leading-tight">{activeSignal.label}</h3>
                  <p className="text-xs text-[#EBE5DC]/80 font-medium">{activeSignal.desc}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveSignal(null)}
                className="p-1 text-white/50 hover:text-white pointer-events-auto cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. 메인 콘텐츠 영역 */}
      {viewMode === 'scroll' ? (
        /* ================= A. 스크롤 종합 뷰 모드 ================= */
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8 space-y-8 max-w-4xl mx-auto w-full">
          {/* 리더 공지사항 배너 */}
          <div className="bg-[#FAF0EB] border border-[#F1D3C6] rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#D97757] stroke-[2px]" />
                <span className="font-serif text-xs font-bold text-[#D97757] uppercase tracking-wider">
                  [{currentConti?.title || '예배 콘티'}{currentConti?.updatedAt ? ` · ${new Date(currentConti.updatedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}` : ''}] {isManager ? '인도자/팀장 공지사항' : '인도자 공지'}
                </span>
              </div>
              {isManager && (
                <button
                  onClick={() => {
                    if (!isEditingNotice) setNoticeDraft(notice);
                    setIsEditingNotice(!isEditingNotice);
                  }}
                  className="text-[11px] font-medium text-[#D97757] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{isEditingNotice ? '닫기' : '공지 작성/수정'}</span>
                </button>
              )}
            </div>

            {isEditingNotice && isManager ? (
              <div className="space-y-2 mt-2">
                <textarea
                  value={noticeDraft}
                  onChange={(e) => setNoticeDraft(e.target.value)}
                  placeholder="찬양팀원들에게 전달할 공지사항을 입력하세요 (예: 연습 시간, 특이사항, 곡 흐름 주의점 등)..."
                  className="w-full bg-white border border-[#E5E0D8] rounded-xl p-3 text-xs text-[#2B2927] focus:outline-none focus:border-[#D97757] resize-none h-24"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditingNotice(false)}
                    className="px-3 py-1.5 text-xs font-medium text-[#6A6864] hover:bg-white rounded-lg transition-colors cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveNotice}
                    className="px-4 py-1.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    공지 저장
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-[#2B2927] font-medium leading-relaxed whitespace-pre-wrap pl-0.5">
                {notice || (isManager ? '등록된 공지사항이 없습니다. [공지 작성/수정]을 눌러 첫 안내를 남겨보세요.' : '등록된 인도자 공지사항이 없습니다.')}
              </p>
            )}
          </div>

          {/* 악보 리스트 섹션 */}
          {contiSongsWithItems.length === 0 ? (
            <div className="py-20 text-center text-[#8C877D]">
              <Music className="w-12 h-12 mx-auto mb-3 opacity-30 stroke-[1.5px]" />
              <p className="font-serif text-sm font-semibold">선택된 콘티에 등록된 악보가 없습니다.</p>
              <p className="text-xs text-[#A8A49C] mt-1">상단에서 다른 콘티를 선택하거나 콘티에디터에서 악보를 담아주세요.</p>
            </div>
          ) : (
            <div className="space-y-12">
              {contiSongsWithItems.map(({ item, song, index }) => {
                const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
                const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
                const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;

                // 상세편집에서 체크된 공유 유튜브 영상 목록
                const sharedVideos = (song?.youtubeVideos || []).filter(v => v.isShared !== false && v.url);
                const currentForm = songForms[item.id] || '';

                return (
                  <div 
                    key={item.id} 
                    className="bg-white border border-[#E5E0D8] rounded-3xl p-5 sm:p-7 shadow-xs space-y-5"
                  >
                    {/* 곡 헤더: 순번, 제목, KEY, 박자 */}
                    <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-[#E5E0D8]">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-xl bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] font-bold text-xs flex items-center justify-center shadow-2xs">
                          {index + 1}
                        </span>
                        <div>
                          <h2 className="font-serif text-base sm:text-lg font-bold text-[#2B2927]">
                            {song?.title || '제목 없음'}
                          </h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            {song?.code && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-[#FAF0EB] text-[#D97757] rounded-md border border-[#F1D3C6]">
                                {song.code} KEY
                              </span>
                            )}
                            {song?.meter && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#F3EFE9] text-[#6A6864] rounded-md border border-[#E5E0D8]">
                                {song.meter}
                              </span>
                            )}
                            {song?.number && song.number > 0 && (
                              <span className="text-[10px] font-medium text-[#8C877D]">
                                #{song.number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {item.memo && (
                        <div className="bg-[#FAF9F5] border border-[#E5E0D8] px-3 py-1.5 rounded-xl max-w-xs text-right">
                          <span className="text-[10px] text-[#8C877D] block font-medium">인도자 멘트/비고</span>
                          <span className="text-xs text-[#2B2927] font-serif font-semibold">{item.memo}</span>
                        </div>
                      )}
                    </div>

                    {/* 송폼 (Song Form) 영역 */}
                    <div className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#8C877D] uppercase tracking-wider flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-[#D97757]" /> 송폼 (Song Form)
                        </span>
                        {isManager && (
                          <button
                            onClick={() => {
                              if (editingSongFormId === item.id) {
                                setEditingSongFormId(null);
                              } else {
                                setEditingSongFormId(item.id);
                                setSongFormDraft(currentForm);
                              }
                            }}
                            className="text-[11px] font-medium text-[#D97757] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{editingSongFormId === item.id ? '닫기' : '송폼 편집'}</span>
                          </button>
                        )}
                      </div>

                      {editingSongFormId === item.id && isManager ? (
                        <div className="space-y-2.5 pt-1">
                          {/* 퀵 칩 추가 버튼군 */}
                          <div className="flex flex-wrap gap-1.5">
                            {SONG_FORM_PRESETS.map(preset => (
                              <button
                                key={preset}
                                onClick={() => {
                                  setSongFormDraft(prev => prev ? `${prev} - ${preset}` : preset);
                                }}
                                className="px-2 py-0.5 bg-white hover:bg-[#FAF0EB] text-[#4A4741] hover:text-[#D97757] border border-[#E5E0D8] hover:border-[#F1D3C6] rounded-md text-[10px] font-semibold transition-colors cursor-pointer"
                              >
                                + {preset}
                              </button>
                            ))}
                            <button
                              onClick={() => setSongFormDraft('')}
                              className="px-2 py-0.5 text-[10px] text-[#8C877D] hover:text-[#D97757] ml-auto cursor-pointer"
                            >
                              초기화
                            </button>
                          </div>

                          <input
                            type="text"
                            value={songFormDraft}
                            onChange={(e) => setSongFormDraft(e.target.value)}
                            placeholder="예: Intro - V1 - C - V2 - C - Bridge - C - Outro"
                            className="w-full bg-white border border-[#E5E0D8] rounded-xl px-3 py-2 text-xs font-semibold text-[#2B2927] focus:outline-none focus:border-[#D97757]"
                          />

                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingSongFormId(null)}
                              className="px-3 py-1 text-xs font-medium text-[#6A6864] hover:bg-white rounded-lg cursor-pointer"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => handleSaveSongForm(item.id)}
                              className="px-4 py-1 bg-[#D97757] hover:bg-[#C96442] text-white rounded-lg text-xs font-semibold shadow-2xs cursor-pointer"
                            >
                              송폼 저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                          {currentForm ? (
                            currentForm.split('-').map((block, bIdx) => (
                              <span
                                key={bIdx}
                                className="px-2.5 py-1 bg-white border border-[#E5E0D8] rounded-lg text-xs font-bold text-[#2B2927] shadow-2xs"
                              >
                                {block.trim()}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[#A8A49C] italic">
                              {isManager ? '작성된 송폼이 없습니다. [송폼 편집]을 눌러 설정하세요.' : '등록된 송폼이 없습니다.'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 악보 이미지 영역 */}
                    <div className="relative overflow-hidden bg-[#FAF9F5] rounded-2xl border border-[#E5E0D8] flex items-center justify-center p-2 sm:p-4">
                      <div className="relative w-full overflow-hidden bg-white shadow-md rounded-xl" style={{ aspectRatio: '1 / 1.414' }}>
                        <img
                          src={blobUrls[song?.id || ''] || hymnalApi.resolveImagePath(song?.filePath || song?.filename || '')}
                          className="absolute block max-w-none top-0 left-0"
                          style={{
                            width: `${100 / visibleWidthFactor}%`,
                            left: `-${(crop.left / visibleWidthFactor)}%`,
                            top: `-${(crop.top / visibleHeightFactor)}%`
                          }}
                          alt={song?.title}
                          draggable={false}
                        />
                      </div>
                    </div>

                    {/* 체크된 유튜브 영상 영역 (복수 가능) */}
                    {sharedVideos.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <span className="text-[11px] font-bold text-[#8C877D] uppercase tracking-wider flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-[#C96442]" /> 찬양팀 참고 영상 ({sharedVideos.length})
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {sharedVideos.map((video, vIdx) => {
                            const vKey = `${item.id}-${vIdx}`;
                            const isPlayerOpen = !!openVideoKeys[vKey];
                            const embedUrl = getYoutubeEmbedUrl(video.url);

                            return (
                              <div 
                                key={vIdx}
                                className="bg-[#FAF9F5] border border-[#E5E0D8] rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 truncate">
                                    <div className="w-7 h-7 bg-[#FAF0EB] text-[#D97757] rounded-lg flex items-center justify-center shrink-0">
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                    </div>
                                    <span className="text-xs font-bold text-[#2B2927] truncate">
                                      {video.name || `참고 영상 ${vIdx + 1}`}
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => toggleVideo(vKey)}
                                    className="px-2.5 py-1 bg-white border border-[#E5E0D8] hover:border-[#D97757] text-[#D97757] rounded-lg text-xs font-semibold shadow-2xs transition-colors shrink-0 cursor-pointer"
                                  >
                                    {isPlayerOpen ? '영상 닫기' : '영상 보기'}
                                  </button>
                                </div>

                                {isPlayerOpen && embedUrl && (
                                  <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-inner border border-[#E5E0D8] mt-1">
                                    <iframe
                                      src={embedUrl}
                                      className="absolute inset-0 w-full h-full"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                      title={video.name}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 글남기기 (카카오톡 스타일 찬양팀 실시간 톡) */}
          <div className="bg-white border border-[#E5E0D8] rounded-3xl p-5 sm:p-7 shadow-xs space-y-4">
            {/* 소통판 상단 헤더 */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E0D8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5 stroke-[2px]" />
                </div>
                <div>
                  <h3 className="font-serif text-sm sm:text-base font-bold text-[#2B2927]">찬양팀 실시간 톡 (소통판)</h3>
                  <p className="text-[11px] text-[#8C877D]">실시간 대화 {comments.length}개 · 콘티와 연습 피드백 나눔</p>
                </div>
              </div>

              {/* 관리자 전용: 오래된 글 정리 메뉴 (10일 / 30일) */}
              {isManager && (
                <div className="relative">
                  <button
                    onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                    className="text-[11px] font-semibold text-[#8C877D] hover:text-[#D97757] flex items-center gap-1 px-2.5 py-1.5 bg-[#FAF9F5] hover:bg-[#F3EFE9] border border-[#E5E0D8] rounded-xl transition-colors cursor-pointer"
                    title="오래된 대화 글 일괄 정리"
                  >
                    <Clock className="w-3 h-3 text-[#D97757]" />
                    <span className="hidden sm:inline">오래된 글 정리</span>
                    <span className="inline sm:hidden">정리</span>
                  </button>

                  {showDeleteMenu && (
                    <div className="absolute right-0 mt-1.5 w-40 bg-white border border-[#E5E0D8] rounded-2xl shadow-xl p-1.5 z-30 flex flex-col gap-1">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-[#8C877D] border-b border-[#E5E0D8] mb-0.5">
                        대화 일괄 삭제
                      </div>
                      <button
                        onClick={() => {
                          setShowDeleteMenu(false);
                          handleDeleteOldComments(10);
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-[#4A4741] hover:bg-[#FAF0EB] hover:text-[#D97757] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3 text-[#D97757]" />
                        <span>10일 이전 글 삭제</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteMenu(false);
                          handleDeleteOldComments(30);
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-[#4A4741] hover:bg-[#FAF0EB] hover:text-[#D97757] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3 text-[#D97757]" />
                        <span>30일 이전 글 삭제</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 카카오톡 스타일 대화 피드 (위->아래 시간순, 자동 스크롤) */}
            <div className="h-[380px] overflow-y-auto custom-scrollbar p-4 space-y-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E5E0D8]">
              {comments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#8C877D] text-xs">
                  <span className="text-2xl mb-1">💬</span>
                  <p className="font-semibold">아직 남겨진 대화가 없습니다.</p>
                  <p className="text-[11px] text-[#A8A49C] mt-0.5">찬양팀원들과 첫 인사나 연습 의견을 자유롭게 나눠보세요!</p>
                </div>
              ) : (
                comments.map((c) => {
                  const isMe = c.author === myFullAuthor || (myNick && (c.author === myNick || c.author.includes(myNick)));

                  return isMe ? (
                    /* 내가 쓴 글 (우측 정렬 말풍선) */
                    <div key={c.id} className="flex flex-col items-end group">
                      <div className="flex items-end gap-1.5 max-w-[85%] sm:max-w-[75%] justify-end">
                        {/* 시간 및 삭제 버튼 (말풍선 좌측) */}
                        <div className="flex flex-col items-end text-[10px] text-[#A8A49C] shrink-0 pb-0.5">
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="opacity-0 group-hover:opacity-100 text-[#8C877D] hover:text-[#D97757] transition-opacity p-0.5 cursor-pointer"
                            title="내 글 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span>{c.createdAt ? (c.createdAt.split(' ').slice(1).join(' ') || c.createdAt) : ''}</span>
                        </div>

                        {/* 내 말풍선 본문 */}
                        <div className="bg-[#D97757] text-white px-3.5 py-2.5 rounded-2xl rounded-tr-xs shadow-2xs text-xs sm:text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">
                          {c.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 다른 사람이 쓴 글 (좌측 정렬 말풍선) */
                    <div key={c.id} className="flex flex-col items-start group">
                      {/* 상대방 작성자명 / 역할 */}
                      <span className="text-[11px] font-bold text-[#6A6864] ml-1 mb-1 flex items-center gap-1">
                        <span>{c.author}</span>
                        {managers.includes(c.author) && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] rounded font-bold">팀장</span>
                        )}
                      </span>

                      <div className="flex items-end gap-1.5 max-w-[85%] sm:max-w-[75%] justify-start">
                        {/* 상대방 말풍선 본문 */}
                        <div className="bg-white border border-[#E5E0D8] text-[#2B2927] px-3.5 py-2.5 rounded-2xl rounded-tl-xs shadow-2xs text-xs sm:text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">
                          {c.content}
                        </div>

                        {/* 시간 및 관리자 삭제 버튼 (말풍선 우측) */}
                        <div className="flex flex-col items-start text-[10px] text-[#A8A49C] shrink-0 pb-0.5">
                          {isManager && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="opacity-0 group-hover:opacity-100 text-[#8C877D] hover:text-[#D97757] transition-opacity p-0.5 cursor-pointer"
                              title="관리자 권한으로 삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          <span>{c.createdAt ? (c.createdAt.split(' ').slice(1).join(' ') || c.createdAt) : ''}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* 자동 스크롤 앵커 */}
              <div ref={messagesEndRef} />
            </div>

            {/* 이모티콘 퀵 리액션 바 */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1 px-1 border-t border-[#E5E0D8] pt-2">
              <span className="text-[11px] text-[#8C877D] font-bold shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#D97757]" /> 이모티콘:
              </span>
              {EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewCommentContent(prev => prev + emoji)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#FAF0EB] text-sm hover:scale-125 transition-transform shrink-0 cursor-pointer"
                  title={`${emoji} 추가`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* 메시지 입력창 영역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#8C877D] px-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">내 프로필:</span>
                  <span className="font-bold text-[#D97757]">{newCommentAuthor || '팀원'}</span>
                </div>
                <button
                  onClick={() => {
                    setProfileRoleDraft(myRole);
                    setProfileCustomRoleDraft(customRole);
                    setProfileNickDraft(myNick);
                    setShowProfileEditModal(true);
                  }}
                  className="text-[10px] text-[#8C877D] hover:text-[#D97757] flex items-center gap-1 hover:underline cursor-pointer"
                  title="내 담당 파트 및 별명 수정"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                  <span>프로필 수정</span>
                </button>
              </div>

              <div className="flex gap-2">
                <textarea
                  value={newCommentContent}
                  onChange={(e) => setNewCommentContent(e.target.value)}
                  placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)..."
                  className="flex-1 bg-[#FAF9F5] border border-[#E5E0D8] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-[#2B2927] focus:outline-none focus:border-[#D97757] resize-none h-14"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <button
                  onClick={handleAddComment}
                  className="px-5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>전송</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= B. 실전 악보 뷰어 모드 (찬양예배 실전) ================= */
        <div className="flex-1 flex flex-col overflow-hidden relative bg-[#FAF9F5]">
          {contiSongsWithItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#8C877D]">
              <p className="font-serif text-base font-bold">표시할 악보가 없습니다.</p>
            </div>
          ) : (
            (() => {
              const current = contiSongsWithItems[currentViewerIndex] || contiSongsWithItems[0];
              const { item, song, index } = current;
              const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
              const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
              const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;
              const currentForm = songForms[item.id] || '';
              const myMemo = personalMemos[item.id] || '';

              return (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* 이전/다음 좌우 네비게이션 버튼 */}
                  <button
                    onClick={() => setCurrentViewerIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentViewerIndex === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-3 bg-white/85 hover:bg-white text-[#6A6864] hover:text-[#D97757] disabled:opacity-0 rounded-full border border-[#E5E0D8] shadow-lg transition-all z-40 cursor-pointer"
                    title="이전 곡"
                  >
                    <ChevronLeft className="w-7 h-7 stroke-[2px]" />
                  </button>

                  <button
                    onClick={() => setCurrentViewerIndex(prev => Math.min(contiSongsWithItems.length - 1, prev + 1))}
                    disabled={currentViewerIndex === contiSongsWithItems.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-white/85 hover:bg-white text-[#6A6864] hover:text-[#D97757] disabled:opacity-0 rounded-full border border-[#E5E0D8] shadow-lg transition-all z-40 cursor-pointer"
                    title="다음 곡"
                  >
                    <ChevronRight className="w-7 h-7 stroke-[2px]" />
                  </button>

                  {/* 악보 상단 정보 바 (순번, 곡명, KEY, 송폼 뱃지) */}
                  <div className="px-6 py-2 bg-white border-b border-[#E5E0D8] flex items-center justify-between gap-4 shrink-0 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-[#FAF0EB] text-[#D97757] font-bold text-xs flex items-center justify-center border border-[#F1D3C6]">
                        {index + 1}
                      </span>
                      <h2 className="font-serif text-sm sm:text-base font-bold text-[#2B2927]">
                        {song?.title}
                      </h2>
                      {song?.code && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-[#FAF0EB] text-[#D97757] rounded-md border border-[#F1D3C6]">
                          {song.code} KEY
                        </span>
                      )}
                    </div>

                    {/* 송폼 요약 뱃지 */}
                    <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                      {currentForm ? (
                        currentForm.split('-').map((block, bIdx) => (
                          <span
                            key={bIdx}
                            className="px-2 py-0.5 bg-[#FAF9F5] border border-[#E5E0D8] rounded text-[10px] font-bold text-[#4A4741] shrink-0"
                          >
                            {block.trim()}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#8C877D] font-medium">송폼 미지정</span>
                      )}
                    </div>

                    <span className="text-xs text-[#8C877D] font-bold shrink-0">
                      {currentViewerIndex + 1} / {contiSongsWithItems.length}
                    </span>
                  </div>

                  {/* 대형 악보 화면 */}
                  <div className="flex-1 overflow-auto custom-scrollbar flex items-center justify-center p-3 sm:p-5">
                    <div className="relative overflow-hidden bg-white rounded-2xl shadow-xl border border-[#E5E0D8] max-w-[750px] w-full" style={{ aspectRatio: '1 / 1.414' }}>
                      <img
                        src={blobUrls[song?.id || ''] || hymnalApi.resolveImagePath(song?.filePath || song?.filename || '')}
                        className="absolute block max-w-none top-0 left-0"
                        style={{
                          width: `${100 / visibleWidthFactor}%`,
                          left: `-${(crop.left / visibleWidthFactor)}%`,
                          top: `-${(crop.top / visibleHeightFactor)}%`
                        }}
                        alt={song?.title}
                        draggable={false}
                      />
                    </div>
                  </div>

                  {/* 하단: 본인이 메모할 것 (개인 맞춤 메모 영역) */}
                  <div className="bg-white border-t border-[#E5E0D8] px-6 py-2.5 shrink-0 shadow-lg flex items-center gap-3">
                    <div className="flex items-center gap-1.5 shrink-0 text-[#D97757]">
                      <StickyNote className="w-4 h-4 stroke-[1.8px]" />
                      <span className="text-xs font-bold font-serif hidden sm:inline">나의 개인 메모</span>
                    </div>
                    <input
                      type="text"
                      value={myMemo}
                      onChange={(e) => handleUpdatePersonalMemo(item.id, e.target.value)}
                      placeholder="이 곡에 대한 개인 연주/진행 메모를 입력하세요 (자동 저장)..."
                      className="flex-1 bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl px-3 py-1.5 text-xs font-medium text-[#2B2927] focus:outline-none focus:border-[#D97757]"
                    />
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* 4. 팀원 최초 접속 시 파트 및 닉네임 설정 웰컴 모달 */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <div className="text-center space-y-1.5">
                <span className="text-3xl">🕊️</span>
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#2B2927]">
                  {worshipTeamName} 찬양팀 접속
                </h2>
                <p className="text-xs text-[#6A6864] leading-relaxed">
                  찬양팀 소통과 원활한 연습 진행을 위해<br />
                  <strong>담당 파트</strong>와 <strong>이름(별명)</strong>을 설정해 주세요.
                </p>
              </div>

              {/* 파트 선택 칩 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#6A6864]">담당 파트 선택</label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_PRESETS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setMyRole(role)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        myRole === role
                          ? 'bg-[#D97757] text-white shadow-2xs'
                          : 'bg-[#FAF9F5] hover:bg-[#F3EFE9] text-[#6A6864] border border-[#E5E0D8]'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                {/* '기타' 선택 시 직접 입력 인풋 필드 */}
                {myRole === '기타' && (
                  <div className="pt-2 space-y-1">
                    <label className="text-xs font-bold text-[#D97757]">기타 담당 파트 직접 입력</label>
                    <input
                      type="text"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="예: 색소폰, 퍼커션, 바이올린, 해금, 미디어 등"
                      className="w-full bg-[#FAF9F5] border border-[#D97757] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2B2927] focus:outline-none"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* 이름/별명 입력 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6A6864]">이름 또는 별명</label>
                <input
                  type="text"
                  value={myNick}
                  onChange={(e) => setMyNick(e.target.value)}
                  placeholder="예: 김찬양, 이은혜"
                  className="w-full bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#2B2927] focus:outline-none focus:border-[#D97757]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const finalRole = myRole === '기타' ? (customRole.trim() || '기타') : myRole;
                      const finalAuthor = myNick.trim() || '팀원';
                      localStorage.setItem('ceum-team-role', finalRole);
                      localStorage.setItem('ceum-team-author', finalAuthor);
                      setNewCommentAuthor(`[${finalRole}] ${finalAuthor}`);
                      registerMemberToFirestore(finalRole, finalAuthor);
                      setShowWelcomeModal(false);
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const finalRole = myRole === '기타' ? (customRole.trim() || '기타') : myRole;
                  const finalAuthor = myNick.trim() || '팀원';
                  localStorage.setItem('ceum-team-role', finalRole);
                  localStorage.setItem('ceum-team-author', finalAuthor);
                  setNewCommentAuthor(`[${finalRole}] ${finalAuthor}`);
                  registerMemberToFirestore(finalRole, finalAuthor);
                  setShowWelcomeModal(false);
                }}
                className="w-full py-3 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-sm font-bold shadow-xs transition-colors cursor-pointer"
              >
                찬양팀 입장하기
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. 인도자 전용: 등록된 찬양팀원 목록 및 팀장(부계정) 복수 지정 모달 */}
      <AnimatePresence>
        {showManagerModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 flex flex-col max-h-[85vh]"
            >
              {/* 모달 상단 헤더 */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E0D8]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] flex items-center justify-center">
                    <Users className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-base sm:text-lg font-bold text-[#2B2927]">
                      찬양팀원 & 부계정(팀장) 관리
                    </h2>
                    <p className="text-xs text-[#8C877D]">
                      등록된 팀원 중 팀장을 지정하여 권한을 위임하세요
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowManagerModal(false)}
                  className="p-1.5 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 안내 카드 */}
              <div className="bg-[#FAF0EB] border border-[#F1D3C6] rounded-2xl p-3.5 text-xs text-[#6A6864] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#D97757]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>팀장(부계정) 권한 안내</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  체크된 팀원은 <strong>공지사항 작성/수정</strong>, <strong>곡별 송폼 편집</strong>, <strong>오래된 글 일괄 정리(10일/30일)</strong> 권한을 갖습니다. 복수 선택이 가능합니다.
                </p>
              </div>

              {/* 등록된 팀원 목록 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[200px]">
                {teamMembers.length === 0 ? (
                  <div className="py-12 text-center text-[#8C877D] space-y-2">
                    <Users className="w-10 h-10 mx-auto opacity-30 stroke-[1.5px]" />
                    <p className="text-xs font-semibold">아직 접속/등록된 찬양팀원이 없습니다.</p>
                    <p className="text-[11px] text-[#A8A49C]">
                      상단의 [접속주소 복사]를 통해 팀원들에게 링크를 공유해주세요.<br />
                      팀원이 입장하면 여기에 실시간으로 표시됩니다.
                    </p>
                  </div>
                ) : (
                  teamMembers.map((member) => {
                    const fullIdentifier = `[${member.role}] ${member.name}`;
                    const isAssignedManager = managers.includes(fullIdentifier) || managers.includes(member.name);

                    return (
                      <div 
                        key={member.id}
                        onClick={() => handleToggleManager(fullIdentifier)}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                          isAssignedManager 
                            ? 'bg-[#FAF0EB]/70 border-[#D97757] shadow-2xs' 
                            : 'bg-[#FAF9F5] border-[#E5E0D8] hover:bg-[#F3EFE9]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isAssignedManager 
                              ? 'bg-[#D97757] text-white shadow-2xs' 
                              : 'bg-white border border-[#E5E0D8] text-[#6A6864]'
                          }`}>
                            {member.role ? member.role.slice(0, 2) : '팀'}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#2B2927]">{member.name}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 bg-white border border-[#E5E0D8] text-[#6A6864] rounded-md">
                                {member.role || '팀원'}
                              </span>
                              {isAssignedManager && (
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-[#D97757] text-white rounded-md flex items-center gap-1 shadow-2xs">
                                  <ShieldCheck className="w-3 h-3" /> 팀장
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#8C877D] mt-0.5 block">
                              최근 활동: {new Date(member.lastActive).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        {/* 체크박스 인디케이터 */}
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                          isAssignedManager 
                            ? 'bg-[#D97757] border-[#D97757] text-white shadow-2xs' 
                            : 'bg-white border-[#D97757]/40 text-transparent'
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[2.5px]" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 모달 하단 액션 */}
              <div className="pt-2 border-t border-[#E5E0D8] flex items-center justify-between">
                <span className="text-xs text-[#8C877D]">
                  현재 팀장 <strong>{managers.length}</strong>명 지정됨
                </span>
                <button
                  onClick={() => setShowManagerModal(false)}
                  className="px-5 py-2.5 bg-[#2B2927] hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  설정 완료
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. 내 프로필(담당/별명) 수정 및 작성 글/데이터 일괄 이양 모달 */}
      <AnimatePresence>
        {showProfileEditModal && (
          <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white border border-[#E5E0D8] rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5"
            >
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E0D8]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] text-[#D97757] border border-[#F1D3C6] flex items-center justify-center shadow-2xs">
                    <User className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-base sm:text-lg font-bold text-[#2B2927]">
                      내 프로필 수정 & 글 이양
                    </h2>
                    <p className="text-xs text-[#8C877D]">
                      담당 파트와 별명을 변경하고 기존 글을 이양합니다
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowProfileEditModal(false)}
                  className="p-1.5 text-[#8C877D] hover:text-[#2B2927] hover:bg-[#F3EFE9] rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 담당 파트 선택 칩 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#6A6864]">담당 파트 선택</label>
                <div className="flex flex-wrap gap-1.5">
                  {ROLE_PRESETS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setProfileRoleDraft(role)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        profileRoleDraft === role
                          ? 'bg-[#D97757] text-white shadow-2xs'
                          : 'bg-[#FAF9F5] hover:bg-[#F3EFE9] text-[#6A6864] border border-[#E5E0D8]'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                {/* '기타' 선택 시 직접 입력 인풋 필드 */}
                {profileRoleDraft === '기타' && (
                  <div className="pt-2 space-y-1">
                    <label className="text-xs font-bold text-[#D97757]">기타 담당 파트 직접 입력</label>
                    <input
                      type="text"
                      value={profileCustomRoleDraft}
                      onChange={(e) => setProfileCustomRoleDraft(e.target.value)}
                      placeholder="예: 색소폰, 퍼커션, 바이올린, 해금, 미디어 등"
                      className="w-full bg-[#FAF9F5] border border-[#D97757] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#2B2927] focus:outline-none"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* 이름/별명 입력 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#6A6864]">이름 또는 별명</label>
                <input
                  type="text"
                  value={profileNickDraft}
                  onChange={(e) => setProfileNickDraft(e.target.value)}
                  placeholder="예: 김찬양, 이은혜"
                  className="w-full bg-[#FAF9F5] border border-[#E5E0D8] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#2B2927] focus:outline-none focus:border-[#D97757]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateProfileAndMigrate();
                    }
                  }}
                />
              </div>

              {/* 이양 안내 알림 카드 */}
              <div className="bg-[#FAF0EB] border border-[#F1D3C6] rounded-2xl p-3.5 text-xs text-[#6A6864] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#D97757]">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>데이터 자동 이양 안내</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  프로필을 수정하시면, <strong>지금까지 내가 작성했던 모든 대화 글의 작성자 정보</strong>와 <strong>팀장 권한</strong>이 새 프로필(
                  <span className="text-[#D97757] font-bold">
                    [{profileRoleDraft === '기타' ? (profileCustomRoleDraft || '기타') : profileRoleDraft}] {profileNickDraft || '이름'}
                  </span>
                  )로 안전하게 즉시 일괄 이양됩니다.
                </p>
              </div>

              {/* 하단 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E0D8]">
                <button
                  type="button"
                  onClick={() => setShowProfileEditModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-[#6A6864] hover:bg-[#F3EFE9] rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleUpdateProfileAndMigrate}
                  disabled={isMigratingProfile}
                  className="px-5 py-2.5 bg-[#D97757] hover:bg-[#C96442] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isMigratingProfile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>이양 처리 중...</span>
                    </>
                  ) : (
                    <span>수정 및 글 이양하기</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
