const path = (endpoint: string) => endpoint;

/**
 * API route constants for the Mobile App (CHECKIN_STAFF scope only).
 *
 * Subset of the Web Portal routes — includes only endpoints required by
 * mobile screens SCR-M01 through SCR-M08.
 */
export const API_ROUTES = {
  AUTH: {
    LOGIN: path("/auth/login"),
    REFRESH: path("/auth/refresh"),
    LOGOUT: path("/auth/logout"),
    ME: path("/auth/me"),
  },

  WORKSHOPS: {
    DETAIL: (workshopId: string) => path(`/workshops/${workshopId}`),
  },

  CHECKIN: {
    PRELOAD_REGISTRATIONS: (workshopId: string) =>
      path(`/checkin/workshops/${workshopId}/registrations`),
    SCAN: path("/checkins"),
    SYNC: path("/checkins/sync"),
    STATUS: (workshopId: string) =>
      path(`/checkin/workshops/${workshopId}/status`),
  },
} as const;

export default API_ROUTES;
