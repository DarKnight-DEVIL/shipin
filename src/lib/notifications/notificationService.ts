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

async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const snapshot =
      await adminDb
        .collection("users")
        .doc(userId)
        .get();

    if (!snapshot.exists) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    const saved =
      snapshot.data()
        ?.preferences
        ?.notifications;

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
  } catch (error) {
    console.error(
      "Failed to load notification preferences:",
      error
    );

    /*
     * Fall back to safe defaults rather
     * than breaking the order operation.
     */
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
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
  const preferences =
    await getUserNotificationPreferences(
      userId
    );

  let userEmail = "";
  try {
    const userSnapshot =
      await adminDb
        .collection("users")
        .doc(userId)
        .get();

    userEmail =
      userSnapshot.data()?.email || "";
  } catch (error) {
    console.error(
      "Failed to load user email:",
      error
    );
  }

  /*
   * First check whether the customer
   * wants this TYPE of notification.
   */
  if (
    !preferences.categories[
      category
    ]
  ) {
    console.log(
      `Notification skipped: ${category} disabled for user ${userId}`
    );

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