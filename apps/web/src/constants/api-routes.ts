const path = (endpoint: string) => endpoint;

export const API_ROUTES = {
  AUTH: {
    LOGIN: path("/auth/login"),
    REFRESH: path("/auth/refresh"),
    LOGOUT: path("/auth/logout"),
    ME: path("/auth/me"),
  },

  DEVICE_TOKENS: {
    REGISTER: path("/device-tokens"),
    DEACTIVATE: (token: string) => path(`/device-tokens/${token}`),
  },

  WORKSHOPS: {
    LIST: path("/workshops"),
    DETAIL: (workshopId: string) => path(`/workshops/${workshopId}`),
    AVAILABILITY: (workshopId: string) =>
      path(`/workshops/${workshopId}/availability`),
  },

  REGISTRATIONS: {
    CREATE: path("/registrations"),
    CANCEL: (registrationId: string) =>
      path(`/registrations/${registrationId}`),
    MY_LIST: path("/registrations"),
    MY_DETAIL: (registrationId: string) =>
      path(`/registrations/${registrationId}`),
  },

  PAYMENTS: {
    CREATE: path("/payments"),
    WEBHOOK: (gateway: string) => path(`/payments/webhook/${gateway}`),
    DETAIL: (paymentId: string) => path(`/payments/${paymentId}`),
  },

  CHECKIN: {
    PRELOAD: (workshopId: string) =>
      path(`/checkin/workshops/${workshopId}/registrations`),
    ONLINE: path("/checkins"),
    SYNC: path("/checkins/sync"),
  },

  ADMIN: {
    WORKSHOPS: {
      LIST: path("/admin/workshops"),
      CREATE: path("/admin/workshops"),
      DETAIL: (workshopId: string) => path(`/admin/workshops/${workshopId}`),
      UPDATE: (workshopId: string) => path(`/admin/workshops/${workshopId}`),
      PUBLISH: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/publish`),
      CANCEL: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/cancel`),
      REGISTRATIONS: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/registrations`),
      STATS: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/stats`),
      SUMMARY: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/summary`),
      SUMMARY_RETRY: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/summary/retry`),
    },

    ROOMS: {
      LIST: path("/admin/rooms"),
      CREATE: path("/admin/rooms"),
      DETAIL: (roomId: string) => path(`/admin/rooms/${roomId}`),
      UPDATE: (roomId: string) => path(`/admin/rooms/${roomId}`),
    },

    SPEAKERS: {
      LIST: path("/admin/speakers"),
      CREATE: path("/admin/speakers"),
      DETAIL: (speakerId: string) => path(`/admin/speakers/${speakerId}`),
      UPDATE: (speakerId: string) => path(`/admin/speakers/${speakerId}`),
      DELETE: (speakerId: string) => path(`/admin/speakers/${speakerId}`),
    },

    IMPORTS: {
      LIST: path("/admin/imports"),
      DETAIL: (importId: string) => path(`/admin/imports/${importId}`),
      ERRORS: (importId: string) => path(`/admin/imports/${importId}/errors`),
      TRIGGER: path("/admin/imports/trigger"),
    },

    NOTIFICATIONS: {
      CHANNELS: path("/admin/notification-channels"),
      CHANNEL: (channelId: string) =>
        path(`/admin/notification-channels/${channelId}`),
      LOGS: path("/admin/notifications/logs"),
    },

    SYSTEM: {
      CIRCUIT_BREAKERS: path("/admin/system/circuit-breaker"),
      RESET_CIRCUIT_BREAKER: (gateway: string) =>
        path(`/admin/system/circuit-breaker/${gateway}/reset`),
      PAYMENTS_RECONCILE: path("/admin/payments/reconcile"),
    },

    STATS: {
      OVERVIEW: path("/admin/stats/overview"),
      CHECKINS: path("/admin/stats/checkins"),
      REVENUE: path("/admin/stats/revenue"),
      EXPORT: path("/admin/stats/export"),
    },
  },
} as const;

export default API_ROUTES;
