const ROUTES = {
  HOME: "/",

  // Auth
  LOGIN: "/login",

  // Primary navigation
  TABS: "/(tabs)",
  TAB_EVENTS: "/(tabs)",
  TAB_QUEUE: "/(tabs)/queue",
  TAB_PROFILE: "/(tabs)/profile",

  // Workshop check-in flow
  WORKSHOP: (workshopId: string): `/workshop/${string}` =>
    `/workshop/${workshopId}`,
  WORKSHOP_SCAN: (workshopId: string): `/workshop/${string}/scan` =>
    `/workshop/${workshopId}/scan`,
  WORKSHOP_RESULT: (workshopId: string): `/workshop/${string}/result` =>
    `/workshop/${workshopId}/result`,

  // Blocking sync flow
  SYNC_PROGRESS: "/sync/progress",

  // Student ticket list
  MY_TICKETS: "/tickets",
} as const;

export default ROUTES;
