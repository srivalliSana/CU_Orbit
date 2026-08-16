import { useCallback, useEffect, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

import { me, requestOtp as apiRequestOtp, signInWithGoogle, verifyOtp as apiVerifyOtp } from "../api/auth";
import { apiErrorMessage } from "../api/client";
import { APP_SCHEME, GOOGLE_ANDROID_CLIENT_ID } from "../constants/config";
import { useAuthStore } from "../state/authStore";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: APP_SCHEME });

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

  const signInWithGoogleAsync = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_ANDROID_CLIENT_ID,
        scopes: ["openid", "email", "profile"],
        redirectUri: REDIRECT_URI,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        // Without this, Google silently signs back in with whatever account
        // is already active on the device instead of showing the chooser.
        extraParams: { prompt: "select_account" },
      });
      const result = await request.promptAsync(GOOGLE_DISCOVERY);
      if (result.type !== "success") {
        if (result.type !== "cancel" && result.type !== "dismiss") {
          setError("Google sign-in was interrupted. Please try again.");
        }
        return;
      }

      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: GOOGLE_ANDROID_CLIENT_ID,
          code: result.params.code,
          redirectUri: REDIRECT_URI,
          extraParams: { code_verifier: request.codeVerifier ?? "" },
        },
        GOOGLE_DISCOVERY
      );
      const idToken = tokenResult.idToken;
      if (!idToken) {
        setError("Google did not return an ID token.");
        return;
      }

      const { session, user: signedInUser } = await signInWithGoogle(idToken);
      await setSession(session, signedInUser);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not sign in with Google."));
    } finally {
      setSigningIn(false);
    }
  }, [setSession]);

  const requestOtp = useCallback(async (email: string) => {
    setError(null);
    try {
      await apiRequestOtp(email);
      return true;
    } catch (e) {
      setError(apiErrorMessage(e, "Could not send a code."));
      return false;
    }
  }, []);

  const verifyOtp = useCallback(
    async (email: string, code: string) => {
      setError(null);
      setSigningIn(true);
      try {
        const { session, user: signedInUser } = await apiVerifyOtp(email, code);
        await setSession(session, signedInUser);
        return true;
      } catch (e) {
        setError(apiErrorMessage(e, "Wrong code."));
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [setSession]
  );

  const signOut = useCallback(() => clear(), [clear]);

  return { status, user, signingIn, error, signInWithGoogleAsync, requestOtp, verifyOtp, signOut };
}
