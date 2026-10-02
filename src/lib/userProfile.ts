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

  /**
   * Administrator role.
   *
   * Normal customers do not need this field.
   */
  role?: "admin" | "customer";

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
       * merge=true means an existing
       * role field will NOT be removed.
       *
       * This is important for admins.
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