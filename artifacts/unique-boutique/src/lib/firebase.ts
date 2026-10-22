import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  type User,
} from "firebase/auth";
import { doc, getDoc, getFirestore } from "firebase/firestore";

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(
    `Missing Firebase configuration: ${missingConfig.join(", ")}`,
  );
}

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        ...requiredConfig,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      });

export const auth = getAuth(app);
export const firestore = getFirestore(app);

export type StoreAdminCheck =
  | { authorized: true }
  | { authorized: false; reason: "missing_document" | "invalid_role" };

export async function checkStoreAdmin(
  user: User,
): Promise<StoreAdminCheck> {
  const adminSnapshot = await getDoc(doc(firestore, "admins", user.uid));
  if (!adminSnapshot.exists()) {
    return { authorized: false, reason: "missing_document" };
  }
  if (adminSnapshot.data().role !== "admin") {
    return { authorized: false, reason: "invalid_role" };
  }
  return { authorized: true };
}
