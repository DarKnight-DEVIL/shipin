export const PRICING = {
  // Service fee calculation
  FREE_SERVICE_LIMIT: 10,
  FLAT_FEE_LIMIT: 30,
  FLAT_FEE: 5,

  PERCENTAGE_LIMIT: 500,
  PERCENTAGE: 0.1,
  MIN_PERCENTAGE_FEE: 10,

  // Inspection options
  inspection: {
    none: {
      id: "none",
      name: "No Inspection",
      description: "Package will not be opened before shipping.",
      price: 0,
    },

    standard: {
      id: "standard",
      name: "Standard Inspection",
      description:
        "Verify correct item and check for visible damage.",
      price: 0,
    },

    detailed: {
      id: "detailed",
      name: "Detailed Inspection",
      description:
        "Detailed inspection with multiple photos and accessory verification.",
      price: 5,
    },
  },

  // Shipping preferences
  shipping: {
    auto: {
      id: "auto",
      name: "Auto Ship",
      description:
        "Ship internationally immediately after warehouse processing.",
      price: 0,
    },

    approval: {
      id: "approval",
      name: "Wait For Approval",
      description:
        "Inspection photos will be uploaded before shipping.",
      price: 0,
    },

    hold: {
      id: "hold",
      name: "Hold Package",
      description:
        "We'll safely store your package until you ask us to ship it.",
      price: 5,
    },
  },

  // Storage fees
  storage: {
    graceHours: 48,

    extendedStoragePerDay: 3,
  },
} as const;