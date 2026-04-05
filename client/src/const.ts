export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = () => {
  const authProvider = import.meta.env.VITE_AUTH_PROVIDER;
  const useGoogle =
    authProvider !== "manus" &&
    import.meta.env.VITE_USE_GOOGLE_OAUTH !== "false";

  if (useGoogle) {
    const url = new URL(`${window.location.origin}/api/oauth/google`);
    url.searchParams.set("origin", window.location.origin);
    return url.toString();
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    const fallbackUrl = new URL(`${window.location.origin}/api/oauth/google`);
    fallbackUrl.searchParams.set("origin", window.location.origin);
    return fallbackUrl.toString();
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
