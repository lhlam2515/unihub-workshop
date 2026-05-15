const COOKIE_NAME = "sessionToken";
const COOKIE_MAX_AGE = 15 * 60; // 15 min, matches access token TTL
const COOKIE_PATH = "/";

export function setSessionToken(token: string): void {
  document.cookie = `${COOKIE_NAME}=${token}; path=${COOKIE_PATH}; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearSessionToken(): void {
  document.cookie = `${COOKIE_NAME}=; path=${COOKIE_PATH}; max-age=0`;
}
