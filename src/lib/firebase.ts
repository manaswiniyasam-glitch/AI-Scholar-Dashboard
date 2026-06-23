import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setDoc, serverTimestamp, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

let isUsingEmulator = false;

const LOCAL_NETWORK_HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalDevelopmentHost = LOCAL_NETWORK_HOSTNAME === 'localhost'
  || LOCAL_NETWORK_HOSTNAME === '127.0.0.1'
  || LOCAL_NETWORK_HOSTNAME === '0.0.0.0'
  || /^192\.168\.\d+\.\d+$/.test(LOCAL_NETWORK_HOSTNAME)
  || /^10\.\d+\.\d+\.\d+$/.test(LOCAL_NETWORK_HOSTNAME)
  || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(LOCAL_NETWORK_HOSTNAME);

// Use Firebase Emulator in development to bypass OAuth restrictions
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && isLocalDevelopmentHost) {
  try {
    // Use the current page host so that browsers on other devices will
    // connect to the emulator running on the development machine (via LAN IP).
    const emulatorHost = window.location.hostname || 'localhost';
    const authUrl = `http://${emulatorHost}:9099`;
    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    isUsingEmulator = true;
    console.log('✓ Firebase Emulator configured ->', authUrl);
  } catch (error) {
    console.warn('Firebase emulator configuration failed:', error);
    isUsingEmulator = false;
  }
}

// Suppress verbose Firestore logs in development
if (process.env.NODE_ENV === 'development') {
  // Set log level to suppress connection warnings
  if (typeof window !== 'undefined' && window.console) {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      const message = String(args[0] || '');
      // Suppress Firestore connection warnings - expected in local development
      if (message.includes('@firebase/firestore') || message.includes('WebChannelConnection')) {
        return;
      }
      originalWarn.apply(console, args);
    };
  }
}

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  
  // Sync user profile
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    lastLogin: serverTimestamp()
  }, { merge: true });
  
  return result;
};
export const logout = () => signOut(auth);

// Test Connection
async function testConnection() {
  try {
    if (isUsingEmulator) {
      // Skip test for emulator - it operates in offline mode
      return;
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase connection successful');
  } catch (error) {
    // Silently fail - app will work in offline mode
  }
}
testConnection();
