"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/features/notifications/services";
import { WHATSAPP_COUNTRIES } from "@/features/notifications/services/whatsappCountries";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategoryPreferences,
  type NotificationPreferences,
} from "@/types/notificationPreferences";

export type NotificationSaveTarget = "channels" | "types" | "whatsapp";

export function useNotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] =
    useState<NotificationSaveTarget | null>(null);

  const [whatsappCountryCode, setWhatsappCountryCode] = useState("+91");
  const [whatsappLocalNumber, setWhatsappLocalNumber] = useState("");
  const [whatsappCountrySearch, setWhatsappCountrySearch] = useState("");
  const [whatsappCountryOpen, setWhatsappCountryOpen] = useState(false);
  const [whatsappConsentChecked, setWhatsappConsentChecked] = useState(false);
  const [whatsappEditing, setWhatsappEditing] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const saved = await getNotificationPreferences(user.uid);
        setPreferences(saved);

        const savedPhone = saved.whatsapp.phone?.trim() ?? "";
        const match = [...WHATSAPP_COUNTRIES]
          .sort((a, b) => b[2].length - a[2].length)
          .find((country) => savedPhone.startsWith(country[2]));

        if (match) {
          setWhatsappCountryCode(match[2]);
          setWhatsappLocalNumber(
            savedPhone.slice(match[2].length).replace(/\D/g, "")
          );
        }

        setWhatsappConsentChecked(Boolean(saved.whatsapp.consentedAt));
        setWhatsappEditing(!(savedPhone && saved.whatsapp.consentedAt));
      } catch (error) {
        console.error("Failed to load notification preferences:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  function toggleChannel(channel: keyof NotificationPreferences["channels"]) {
    setPreferences((current) => ({
      ...current,
      channels: { ...current.channels, [channel]: !current.channels[channel] },
    }));
  }

  function toggleCategory(category: keyof NotificationCategoryPreferences) {
    setPreferences((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: !current.categories[category],
      },
    }));
  }

  async function save(target: NotificationSaveTarget) {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }

    let phone = preferences.whatsapp.phone.trim();

    if (preferences.channels.whatsapp) {
      const local = whatsappLocalNumber.replace(/\D/g, "");
      phone = `${whatsappCountryCode}${local}`;
      const digitCount = phone.replace(/\D/g, "").length;

      if (!local || digitCount < 8 || digitCount > 15) {
        toast.warning("Enter a valid WhatsApp number.");
        return;
      }
      if (!whatsappConsentChecked) {
        toast.warning(
          "Confirm consent to receive transactional WhatsApp updates."
        );
        return;
      }
    }

    try {
      setSavingTarget(target);

      const next: NotificationPreferences = preferences.channels.whatsapp
        ? {
            ...preferences,
            whatsapp: {
              ...preferences.whatsapp,
              phone,
              consentedAt:
                preferences.whatsapp.consentedAt ?? new Date().toISOString(),
            },
          }
        : {
            ...preferences,
            whatsapp: {
              ...preferences.whatsapp,
              consentedAt: undefined,
            },
          };

      await saveNotificationPreferences(user.uid, next);
      setPreferences(next);

      if (target === "whatsapp") {
        setWhatsappEditing(false);
        setWhatsappCountryOpen(false);
        toast.success("WhatsApp settings saved");
      } else if (target === "channels") {
        toast.success("Channels saved");
      } else {
        toast.success("Notification types saved");
      }
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save preferences");
    } finally {
      setSavingTarget(null);
    }
  }

  return {
    preferences,
    loading,
    savingTarget,
    whatsappCountryCode,
    whatsappLocalNumber,
    whatsappCountrySearch,
    whatsappCountryOpen,
    whatsappConsentChecked,
    whatsappEditing,
    setWhatsappCountryCode,
    setWhatsappLocalNumber,
    setWhatsappCountrySearch,
    setWhatsappCountryOpen,
    setWhatsappConsentChecked,
    setWhatsappEditing,
    toggleChannel,
    toggleCategory,
    save,
  };
}
