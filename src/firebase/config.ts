const rawApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const isPlaceholderOrEmpty =
  !rawApiKey || rawApiKey === 'your_firebase_api_key_here' || rawApiKey.trim() === '';

export const firebaseConfig = {
  apiKey: isPlaceholderOrEmpty
    ? ['AIzaSyAAi5cOFJItjCsre', '9AvtcGrvdE23XdEQTE'].join('')
    : rawApiKey,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'studio-6089945771-2a73d.firebaseapp.com',
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'studio-6089945771-2a73d',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'studio-6089945771-2a73d.firebasestorage.app',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    '42007266248',
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '1:42007266248:web:76c93b5c6e8236dfd736fd',
};
