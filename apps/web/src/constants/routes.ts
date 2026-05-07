const ROUTES = {
  HOME: "/",

  // Auth — Public
  LOGIN: "/login",

  // Public
  WORKSHOPS: "/workshops",
  WORKSHOP: (workshopId: string) => `/workshops/${workshopId}`,
  PAYMENT_RESULT: "/payment-result",

  // Student (SCR-W04~W06)
  ME_REGISTRATIONS: "/me/registrations",
  ME_REGISTRATION: (registrationId: string) =>
    `/me/registrations/${registrationId}`,
  ME_REGISTRATION_PAY: (registrationId: string) =>
    `/me/registrations/${registrationId}/pay`,

  // Admin — Auth
  ADMIN_LOGIN: "/admin/login",

  // Admin — Dashboard (SCR-A02)
  ADMIN: "/admin",

  // Admin — Workshops (SCR-A03~A08)
  ADMIN_WORKSHOPS: "/admin/workshops",
  ADMIN_WORKSHOP: (workshopId: string) => `/admin/workshops/${workshopId}`,
  ADMIN_WORKSHOP_NEW: "/admin/workshops/new",
  ADMIN_WORKSHOP_REGISTRATIONS: (workshopId: string) =>
    `/admin/workshops/${workshopId}/registrations`,
  ADMIN_WORKSHOP_STATS: (workshopId: string) =>
    `/admin/workshops/${workshopId}/stats`,
  ADMIN_WORKSHOP_SUMMARY: (workshopId: string) =>
    `/admin/workshops/${workshopId}/summary`,

  // Admin — Speakers (SCR-A09~A11)
  ADMIN_SPEAKERS: "/admin/speakers",
  ADMIN_SPEAKER_NEW: "/admin/speakers/new",
  ADMIN_SPEAKER: (speakerId: string) => `/admin/speakers/${speakerId}`,

  // Admin — Rooms (SCR-A12~A13)
  ADMIN_ROOMS: "/admin/rooms",
  ADMIN_ROOM: (roomId: string) => `/admin/rooms/${roomId}`,

  // Admin — Imports (SCR-A14~A15)
  ADMIN_IMPORTS: "/admin/imports",
  ADMIN_IMPORT: (importId: string) => `/admin/imports/${importId}`,

  // Admin — Notifications (SCR-A16)
  ADMIN_NOTIFICATIONS: "/admin/notifications",

  // Admin — System (SCR-A17)
  ADMIN_SYSTEM: "/admin/system",
} as const;

export default ROUTES;
