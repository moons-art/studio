import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// 1. 스튜디오 앱 고유 데이터 저장소 (ccm-ymoonsik) - 찬양 악보, 콘티, 찬양팀 공유방 등 100% 보존
const firebaseConfig = {
  apiKey: "AIzaSyDZ6oJraivKbXSrokuYnhhHuxlMW1s1Qac",
  authDomain: "studio.thenations.kr",
  projectId: "ccm-ymoonsik",
  storageBucket: "ccm-ymoonsik.firebasestorage.app",
  messagingSenderId: "21582961373",
  appId: "1:21582961373:web:e4570b0ae13f1262d79934"
};

// 2. 네이션스 통합 인증 허브 (sermon-ym) - 4개 앱 통합 로그인 및 중앙 회원 레지스트리 전용
const sermonFirebaseConfig = {
  apiKey: "AIzaSyDP3M5o7eNBJ1dsxq_54BBW03ZgUijHh5A",
  authDomain: "studio.thenations.kr",
  projectId: "sermon-ym",
  storageBucket: "sermon-ym.firebasestorage.app",
  messagingSenderId: "833556498310",
  appId: "1:833556498310:web:a38ea2f5baf012851ace07"
};

// Initialize Content Firebase (ccm-ymoonsik)
const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

// Initialize Auth Hub Firebase (sermon-ym)
export const authApp = getApps().find(a => a.name === 'AUTH_APP') || initializeApp(sermonFirebaseConfig, 'AUTH_APP');

// Initialize Firestore with offline persistence for Studio app data (ccm-ymoonsik)
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;

// Initialize Hub Firestore for central user registry sync (sermon-ym)
export const authDb = getFirestore(authApp);

// Initialize Functions (ccm-ymoonsik 서울 리전 asia-northeast3)
export const functions = getFunctions(app, 'asia-northeast3');

// Initialize Unified Auth (sermon-ym)
export const auth = getAuth(authApp);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebaseConfig] Auth persistence set error:', err);
});
export const googleProvider = new GoogleAuthProvider();
