const path = (endpoint: string) => endpoint;

export const API_ROUTES = {
  AUTH: {
    LOGIN: path("/auth/login"),
    REFRESH: path("/auth/refresh"),
    LOGOUT: path("/auth/logout"),
    ME: path("/auth/me"),
  },

  WORKSHOPS: {
    LIST: path("/workshops"),
    DETAIL: (workshopId: string) => path(`/workshops/${workshopId}`),
  },

  REGISTRATIONS: {
    CREATE: path("/registrations"),
    CANCEL: (registrationId: string) =>
      path(`/registrations/${registrationId}`),
    MY_LIST: path("/students/me/registrations"),
    MY_DETAIL: (registrationId: string) =>
      path(`/students/me/registrations/${registrationId}`),
  },

  PAYMENTS: {
    CREATE: path("/payments"),
    WEBHOOK: (gateway: string) => path(`/webhooks/payment/${gateway}`),
    MY_LIST: path("/students/me/payments"),
    MY_DETAIL: (paymentId: string) =>
      path(`/students/me/payments/${paymentId}`),
  },

  TICKETS: {
    MY_LIST: path("/students/me/tickets"),
    MY_DETAIL: (ticketId: string) => path(`/students/me/tickets/${ticketId}`),
  },

  CHECKIN: {
    PRELOAD_TICKETS: (workshopId: string) =>
      path(`/checkin/workshops/${workshopId}/tickets`),
    SCAN: path("/checkin/scan"),
    SYNC: path("/checkin/sync"),
    STATUS: (workshopId: string) =>
      path(`/checkin/workshops/${workshopId}/status`),
  },

  ADMIN: {
    USERS: {
      LIST: path("/admin/users"),
      DETAIL: (userId: string) => path(`/admin/users/${userId}`),
      UPDATE_STATUS: (userId: string) => path(`/admin/users/${userId}/status`),
      REVOKE_TOKEN: (userId: string) =>
        path(`/admin/users/${userId}/revoke-token`),
    },

    WORKSHOPS: {
      LIST: path("/admin/workshops"),
      CREATE: path("/admin/workshops"),
      DETAIL: (workshopId: string) => path(`/admin/workshops/${workshopId}`),
      UPDATE: (workshopId: string) => path(`/admin/workshops/${workshopId}`),
      PUBLISH: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/publish`),
      EMERGENCY_UPDATE: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/emergency-update`),
      CANCEL: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/cancel`),
      STATS: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/stats`),
      DOCUMENTS: (workshopId: string) =>
        path(`/admin/workshops/${workshopId}/documents`),
    },

    ROOMS: {
      LIST: path("/admin/rooms"),
      CREATE: path("/admin/rooms"),
      EDIT: (roomId: string) => path(`/admin/rooms/${roomId}/edit`),
      NEW: path("/admin/rooms/new"),
    },

    SPEAKERS: {
      LIST: path("/admin/speakers"),
      CREATE: path("/admin/speakers"),
      EDIT: (speakerId: string) => path(`/admin/speakers/${speakerId}/edit`),
      NEW: path("/admin/speakers/new"),
    },

    DOCUMENTS: {
      DELETE: (documentId: string) => path(`/admin/documents/${documentId}`),
      SUMMARY: (documentId: string) =>
        path(`/admin/documents/${documentId}/summary`),
      AI_RETRY: (documentId: string) =>
        path(`/admin/documents/${documentId}/ai-retry`),
    },

    NOTIFICATIONS: {
      LOGS: path("/admin/notifications/logs"),
      LOG_DETAIL: (notificationId: string) =>
        path(`/admin/notifications/logs/${notificationId}`),
      CHANNELS: path("/admin/notifications/channels"),
      CHANNEL: (channelType: string) =>
        path(`/admin/notifications/channels/${channelType}`),
    },

    STUDENT_SYNC: {
      CREATE: path("/admin/student-sync"),
      LIST: path("/admin/student-sync"),
      DETAIL: (jobId: string) => path(`/admin/student-sync/${jobId}`),
      ERRORS: (jobId: string) => path(`/admin/student-sync/${jobId}/errors`),
    },

    STAFF: {
      ASSIGN_WORKSHOPS: (userId: string) =>
        path(`/admin/checkin-staff/${userId}/assign-workshops`),
      WORKSHOPS: (userId: string) =>
        path(`/admin/checkin-staff/${userId}/workshops`),
    },

    SYSTEM: {
      PAYMENT_TIMEOUT_JOB: path("/admin/system/jobs/payment-timeout"),
      RECONCILIATION_JOB: path("/admin/system/jobs/reconciliation"),
      CIRCUIT_BREAKERS: path("/admin/system/circuit-breaker"),
      RESET_CIRCUIT_BREAKER: (gateway: string) =>
        path(`/admin/system/circuit-breaker/${gateway}/reset`),
    },
  },
} as const;

export default API_ROUTES;
