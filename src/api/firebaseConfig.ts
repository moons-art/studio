import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDZ6oJraivKbXSrokuYnhhHuxlMW1s1Qac",
  authDomain: "ccm-ymoonsik.firebaseapp.com",
  projectId: "ccm-ymoonsik",
  storageBucket: "ccm-ymoonsik.firebasestorage.app",
  messagingSenderId: "21582961373",
  appId: "1:21582961373:web:e4570b0ae13f1262d79934"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with offline persistence (auto cache + multi-tab support)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
