import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { sendMail } from "@/lib/mailer";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type NotificationCategoryPreferences,
} from "@/types/notificationPreferences";

interface NotificationChannels {
  inApp?: boolean;
  email?: boolean;
  whatsapp?: boolean;
}

type NotificationCategory =
  keyof NotificationCategoryPreferences;

export type { NotificationCategory };

interface WhatsAppTemplate {
  templateName: string;
  languageCode?: string;

  components?: Array<{
    type: string;

    parameters?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
}

interface SendNotificationParams {
  userId: string;
  requestId: string;

  title: string;
  message: string;
  type: string;

  category: NotificationCategory;

  /*
   * Which channels THIS event supports.
   *
   * The customer's preferences are
   * checked separately.
   */
  channels?: NotificationChannels;

  whatsapp?: WhatsAppTemplate;
}

interface UserData {
  email?: string;
  preferences?: {
    notifications?: Partial<NotificationPreferences>;
  };
}

/**
 * Fetch user document ONCE and extract both preferences and email.
 * The previous implementation performed two separate Firestore reads
 * (one for preferences, one for email), doubling latency.
 */
async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const snapshot =
      await adminDb
        .collection("users")
        .doc(userId)
        .get();

    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as UserData;
  } catch (error) {
    console.error(
      "Failed to load user data:",
      error
    );
    return null;
  }
}

async function resolvePreferences(
  userData: UserData | null
): Promise<NotificationPreferences> {
  const saved =
    userData?.preferences?.notifications;

  if (!saved) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  /*
   * Merge with defaults so older
   * users continue working if new
   * settings are added later.
   */
  return {
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...(saved.channels ?? {}),
    },

    whatsapp: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.whatsapp,
      ...(saved.whatsapp ?? {}),
    },

    categories: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.categories,
      ...(saved.categories ?? {}),
    },
  };
}

export async function sendNotification({
  userId,
  requestId,
  title,
  message,
  type,
  category,

  channels = {
    inApp: true,
    email: false,
    whatsapp: false,
  },

  whatsapp,
}: SendNotificationParams) {
  // Single Firestore read — extracts both preferences and email
  const userData = await getUserData(userId);
  const preferences = await resolvePreferences(userData);
  const userEmail = userData?.email ?? "";

  /*
   * First check whether the customer
   * wants this TYPE of notification.
   */
  if (
    !preferences.categories[
      category
    ]
  ) {
    return;
  }

  /*
   * IN-APP
   *
   * Requires:
   * 1. Event supports in-app
   * 2. Customer enabled in-app
   */
  if (
    channels.inApp !== false &&
    preferences.channels.inApp
  ) {
    try {
      await adminDb
        .collection("notifications")
        .add({
          userId,
          requestId,

          title,
          message,
          type,
          category,

          read: false,

          createdAt:
            new Date(),
        });
    } catch (error) {
      console.error(
        "In-app notification failed:",
        error
      );
    }
  }

  /*
   * WHATSAPP
   *
   * Requires:
   * 1. Event supports WhatsApp
   * 2. Customer enabled WhatsApp
   * 3. WhatsApp template information
   *    was provided
   */
  if (
    channels.whatsapp === true &&
    preferences.channels.whatsapp &&
    preferences.whatsapp.consentedAt &&
    preferences.whatsapp.phone &&
    whatsapp
  ) {
    try {
      await sendWhatsAppTemplate({
        to: preferences.whatsapp.phone,

        templateName:
          whatsapp.templateName,

        languageCode:
          whatsapp.languageCode ??
          "en_US",

        components:
          whatsapp.components ?? [],
      });
    } catch (error) {
      /*
       * WhatsApp failure must not fail
       * the order/status operation.
       */
      console.error(
        "WhatsApp notification failed:",
        error
      );
    }
  }

  /*
   * EMAIL
   *
   * Requires:
   * 1. Event supports email
   * 2. Customer enabled email
   * 3. Customer has an email address
   */
  if (
    channels.email === true &&
    preferences.channels.email &&
    userEmail
  ) {
    try {
      await sendMail({
        to: userEmail,

        subject: `${title} - ShipIN`,

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 0 auto;
              color: #111827;
            "
          >
            <h2>
              ${title}
            </h2>

            <p>
              ${message}
            </p>

            <p>
              Request:
              <strong>
                #${requestId.slice(0, 6)}
              </strong>
            </p>

            <p
              style="
                margin-top: 32px;
                color: #6b7280;
                font-size: 14px;
              "
            >
              ShipIN
            </p>
          </div>
        `,
      });
    } catch (error) {
      /*
       * Email failure must not fail the
       * underlying ShipIN operation.
       */
      console.error(
        "Email notification failed:",
        error
      );
    }
  }
}