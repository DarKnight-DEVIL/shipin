"use client";

import { useEffect, useState } from "react";
import { updateProfile } from "firebase/auth";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
} from "@/features/users/services/userProfile";

export interface ProfileForm {
  displayName: string;
  email: string;
  phone: string;
}

const EMPTY_PROFILE: ProfileForm = {
  displayName: "",
  email: "",
  phone: "",
};

export function useProfileSettings() {
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false);
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const providers = user.providerData.map((p) => p.providerId);
      setHasPasswordProvider(providers.includes("password"));
      setHasGoogleProvider(providers.includes("google.com"));

      try {
        let savedProfile = await getUserProfile(user.uid);

        if (!savedProfile || !savedProfile.email || !savedProfile.photoURL) {
          await createUserProfile(user.uid, {
            displayName:
              savedProfile?.displayName || user.displayName || "",
            email: user.email || savedProfile?.email || "",
            phone: savedProfile?.phone || user.phoneNumber || "",
            photoURL: savedProfile?.photoURL || user.photoURL || "",
          });
          savedProfile = await getUserProfile(user.uid);
        }

        if (user.photoURL && savedProfile?.photoURL !== user.photoURL) {
          await updateUserProfile(user.uid, { photoURL: user.photoURL });
          savedProfile = await getUserProfile(user.uid);
        }

        setProfile({
          displayName:
            savedProfile?.displayName || user.displayName || "",
          email: user.email ?? "",
          phone: savedProfile?.phone ?? "",
        });
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  function setField(field: keyof ProfileForm, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }

    const displayName = profile.displayName.trim();
    const phone = profile.phone.trim();

    if (!displayName) {
      toast.warning("Please enter your name.");
      return;
    }

    try {
      setSaving(true);
      await updateUserProfile(user.uid, { displayName, phone });
      await updateProfile(user, { displayName });
      setProfile((current) => ({ ...current, displayName, phone }));
      setEditing(false);
      toast.success("Profile updated");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't update profile");
    } finally {
      setSaving(false);
    }
  }

  return {
    profile,
    loading,
    editing,
    saving,
    hasPasswordProvider,
    hasGoogleProvider,
    setField,
    setEditing,
    save,
  };
}
