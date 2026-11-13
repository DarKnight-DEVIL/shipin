export interface NotificationCategoryPreferences {
  quote: boolean;
  payment: boolean;
  warehouse: boolean;
  shipping: boolean;
  delivery: boolean;
  support: boolean;
}

export interface NotificationPreferences {
  channels: {
    inApp: boolean;
    email: boolean;
    whatsapp: boolean;
  };

  whatsapp: {
    phone: string;
    consentedAt?: string;
  };

  categories: NotificationCategoryPreferences;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: {
    inApp: true,
    email: true,
    whatsapp: false,
  },

  whatsapp: {
    phone: "",
  },

  categories: {
    quote: true,
    payment: true,
    warehouse: true,
    shipping: true,
    delivery: true,
    support: true,
  },
};