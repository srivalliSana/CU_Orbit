import { useCallback, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { me, ssoExchange } from "../api/auth";
import { apiErrorMessage } from "../api/client";
import { APP_SCHEME, CAMPUS_ONE_URL, SSO_CONNECT_PATH } from "../constants/config";
import { useAuthStore } from "../state/authStore";

WebBrowser.maybeCompleteAuthSession();

const AUTH_REDIRECT = `${APP_SCHEME}://auth`;

export function useAuthSession() {
  const { status, user, hydrate, setSession, clear } = useAuthStore();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Once hydrated with a stored token, validate it's still good.
  useEffect(() => {
    if (status !== "signedIn" || user) return;
    me()
      .then((freshUser) => {
        useAuthStore.setState({ user: freshUser });
      })
      .catch(() => {
        clear();
      });
  }, [status, user, clear]);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      const authUrl = `${CAMPUS_ONE_URL}${SSO_CONNECT_PATH}?redirect_uri=${encodeURIComponent(
        AUTH_REDIRECT
      )}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, AUTH_REDIRECT);
      if (result.type !== "success" || !result.url) {
        if (result.type !== "cancel" && result.type !== "dismiss") {
          setError("Sign-in was interrupted. Please try again.");
        }
        return;
      }

      const { queryParams } = Linking.parse(result.url);
      const token = queryParams?.token;
      if (typeof token !== "string" || !token) {
        setError("CampusOne did not provide a sign-in token.");
        return;
      }

      const { session, user: signedInUser } = await ssoExchange(token);
      await setSession(session, signedInUser);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not sign in."));
    } finally {
      setSigningIn(false);
    }
  }, [setSession]);

  const signOut = useCallback(() => clear(), [clear]);

  return { status, user, signingIn, error, signIn, signOut };
}
