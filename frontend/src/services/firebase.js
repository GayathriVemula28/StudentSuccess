import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, setDoc, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'appId']
export const isFirebaseConfigured = requiredConfig.every((key) => Boolean(firebaseConfig[key]))

const firebaseApp = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
export const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const getProfileReference = (uid) => doc(firebaseDb, 'studentProfiles', uid)

export const toSessionUser = async (user) => {
  if (!user) return null

  let profile = {}
  try {
    const profileSnapshot = await getDoc(getProfileReference(user.uid))
    if (profileSnapshot.exists()) profile = profileSnapshot.data()
  } catch (error) {
    console.warn('Could not load the optional student profile:', error.message)
  }

  let tokenClaims = {}
  try {
    tokenClaims = (await user.getIdTokenResult()).claims
  } catch {
    // The Firebase user is still authenticated if custom claims are unavailable.
  }

  return {
    id: profile.studentId || user.uid,
    uid: user.uid,
    name: user.displayName || profile.fullName || user.email?.split('@')[0] || 'Student',
    email: user.email || profile.email || '',
    photoURL: user.photoURL || profile.photoURL || '',
    role: tokenClaims.role || 'student',
    authProvider: 'firebase',
    profile,
  }
}

export const subscribeToFirebaseAuth = (callback, onError) => {
  if (!firebaseAuth) return () => {}
  return onAuthStateChanged(firebaseAuth, callback, onError)
}

export const createFirebaseStudent = async ({ email, password, fullName, profile }) => {
  if (!firebaseAuth) throw new Error('Firebase is not configured. Follow the setup steps in README.md.')
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
  if (fullName) await updateProfile(credential.user, { displayName: fullName })
  await setDoc(getProfileReference(credential.user.uid), {
    ...profile,
    fullName,
    email: credential.user.email,
    photoURL: credential.user.photoURL || '',
    role: 'student',
    authProvider: 'password',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return toSessionUser(credential.user)
}

export const signInFirebaseStudent = async ({ email, password }) => {
  if (!firebaseAuth) throw new Error('Firebase is not configured. Follow the setup steps in README.md.')
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password)
  return toSessionUser(credential.user)
}

export const signInWithGoogle = async ({ emailHint = '', profile = null } = {}) => {
  if (!firebaseAuth) throw new Error('Google sign-in is not configured. Follow the Firebase setup steps in README.md.')
  if (emailHint) googleProvider.setCustomParameters({ prompt: 'select_account', login_hint: emailHint })
  else googleProvider.setCustomParameters({ prompt: 'select_account' })

  const credential = await signInWithPopup(firebaseAuth, googleProvider)
  const user = credential.user
  await setDoc(getProfileReference(user.uid), {
    ...(profile || {}),
    fullName: user.displayName || profile?.fullName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    role: 'student',
    authProvider: 'google',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })
  return toSessionUser(user)
}

export const sendFirebasePasswordReset = async (email) => {
  if (!firebaseAuth) throw new Error('Password reset requires Firebase configuration. Follow the setup steps in README.md.')
  await sendPasswordResetEmail(firebaseAuth, email)
}

export const signOutFirebase = async () => {
  if (firebaseAuth) await signOut(firebaseAuth)
}

export const getFirebaseAuthError = (error) => {
  const messages = {
    'auth/email-already-in-use': 'An account already exists for this email. Try signing in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-disabled': 'This account is disabled. Contact your administrator.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before completing authentication.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups and try again.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled. Please try again.',
    'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication settings.',
    'auth/operation-not-allowed': 'Enable this sign-in method in Firebase Authentication settings.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
  }
  return messages[error?.code] || error?.message || 'Authentication failed. Please try again.'
}
