const ROUTES = {
  HOME: "/",

  // Auth
  LOGIN: "/login",

  // Public
  WORKSHOPS: "/workshops",
  WORKSHOP: (workshopId: string) => `/workshops/${workshopId}`,

  // Student
  ME_PROFILE: "/me/profile",
  ME_REGISTRATIONS: "/me/registrations",
  ME_REGISTRATION: (registrationId: string) =>
    `/me/registrations/${registrationId}`,
  ME_TICKETS: "/me/tickets",
  ME_TICKET: (ticketId: string) => `/me/tickets/${ticketId}`,
  ME_PAYMENTS: "/me/payments",
  ME_PAYMENT: (paymentId: string) => `/me/payments/${paymentId}`,
  PAYMENT_RESULT: "/payments/result",
  PAYMENT_CHECKOUT: (registrationId: string) =>
    `/payments/checkout/${registrationId}`,

  // Admin
  ADMIN: "/admin",
  ADMIN_WORKSHOPS: "/admin/workshops",
  ADMIN_WORKSHOP: (workshopId: string) => `/admin/workshops/${workshopId}`,
  ADMIN_WORKSHOP_NEW: "/admin/workshops/new",
  ADMIN_WORKSHOP_EDIT: (workshopId: string) =>
    `/admin/workshops/${workshopId}/edit`,
  ADMIN_WORKSHOP_DOCUMENTS: (workshopId: string) =>
    `/admin/workshops/${workshopId}/documents`,
  ADMIN_WORKSHOP_STATS: (workshopId: string) =>
    `/admin/workshops/${workshopId}/stats`,

  ADMIN_USERS: "/admin/users",
  ADMIN_USER: (userId: string) => `/admin/users/${userId}`,
  ADMIN_USER_ASSIGN_WORKSHOPS: (userId: string) =>
    `/admin/users/${userId}/assign-workshops`,

  ADMIN_SYSTEM: "/admin/system",
  ADMIN_STUDENT_SYNC: "/admin/student-sync",
  ADMIN_STUDENT_SYNC_JOB: (jobId: string) => `/admin/student-sync/${jobId}`,

  ADMIN_SPEAKERS: "/admin/speakers",
  ADMIN_SPEAKER_NEW: "/admin/speakers/new",
  ADMIN_SPEAKER_EDIT: (speakerId: string) =>
    `/admin/speakers/${speakerId}/edit`,

  ADMIN_ROOMS: "/admin/rooms",
  ADMIN_ROOM_NEW: "/admin/rooms/new",
  ADMIN_ROOM_EDIT: (roomId: string) => `/admin/rooms/${roomId}/edit`,

  ADMIN_NOTIFICATIONS_LOGS: "/admin/notifications/logs",
  ADMIN_NOTIFICATIONS_CHANNELS: "/admin/notifications/channels",
} as const;

export default ROUTES;
