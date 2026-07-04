import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDo5qUJ_ho1Bp0qjKp_1IYAHUFW3nsmfb4",
  authDomain: "shipin-9576a.firebaseapp.com",
  projectId: "shipin-9576a",
  storageBucket: "shipin-9576a.firebasestorage.app",
  messagingSenderId: "1088532314053",
  appId: "1:1088532314053:web:28fb6afe2726ef4c46fdac",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;