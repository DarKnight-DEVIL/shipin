import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export interface UserProfile {
  displayName: string;
  email: string;
  phone: string;
  photoURL?: string;

  createdAt?: any;
  updatedAt?: any;
}

export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const ref = doc(
    db,
    "users",
    userId
  );

  const snapshot =
    await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as UserProfile;
}

export async function createUserProfile(
  userId: string,
  profile: {
    displayName: string;
    email: string;
    phone?: string;
    photoURL?: string;
  }
) {
  const ref = doc(
    db,
    "users",
    userId
  );

  await setDoc(
    ref,
    {
      displayName:
        profile.displayName,

      email:
        profile.email,

      phone:
        profile.phone ?? "",

      photoURL:
        profile.photoURL ?? "",

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),
    },
    {
      /*
       * VERY IMPORTANT:
       *
       * Your user document may already
       * contain preferences/settings.
       * Do not overwrite them.
       */
      merge: true,
    }
  );
}

export async function updateUserProfile(
  userId: string,
  updates: {
    displayName?: string;
    email?: string;
    phone?: string;
    photoURL?: string;
  }
) {
  const ref = doc(
    db,
    "users",
    userId
  );

  await updateDoc(
    ref,
    {
      ...updates,
      updatedAt:
        serverTimestamp(),
    }
  );
}