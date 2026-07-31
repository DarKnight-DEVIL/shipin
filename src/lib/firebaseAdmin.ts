import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  getAuth,
} from "firebase-admin/auth";

const privateKey =
  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

if (
  !process.env.FIREBASE_ADMIN_PROJECT_ID ||
  !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  !privateKey
) {
  throw new Error(
    "Missing Firebase Admin environment variables."
  );
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId:
            process.env
              .FIREBASE_ADMIN_PROJECT_ID,

          clientEmail:
            process.env
              .FIREBASE_ADMIN_CLIENT_EMAIL,

          privateKey,
        }),
      });

export const adminDb =
  getFirestore(adminApp);

export const adminAuth =
  getAuth(adminApp);