// src/auth/AuthContext.jsx
//
// Who is signed in, for the whole app. The session itself lives in an
// HttpOnly cookie the browser holds; this only mirrors what the server says
// about it, so it is never the authority — the API is.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  signIn as apiSignIn,
  signInWithCode as apiSignInWithCode,
  signInWithPin as apiSignInWithPin,
  signInWithEmailPin as apiSignInWithEmailPin,
  unlockWarehouse as apiUnlockWarehouse,
  setupWarehousePin as apiSetupWarehousePin,
  signOut as apiSignOut,
  signUp as apiSignUp,
} from '../api/auth';
import { getProfile } from '../api/profile';
import { lastHeardFromServer, onAuthFailure } from '../api/client';
import { AuthContext } from './context';

// How often an idle floor session is checked against its limit. The limit is
// at least a minute, so a few seconds late is close enough.
const IDLE_CHECK_MS = 5000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'checking' until the first profile request answers. Without this, the
  // route guard would bounce a signed-in visitor to the login page on every
  // refresh, before the session has been confirmed.
  const [state, setState] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    getProfile()
      .then((profile) => {
        if (cancelled) return;
        setUser(profile);
        setState('ready');
      })
      .catch(() => {
        // 403 here just means nobody is signed in — not an error worth
        // showing. Any other failure also leaves the app usable, logged out.
        if (cancelled) return;
        setUser(null);
        setState('ready');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A request refused for who the caller is, anywhere in the app. Until this
  // existed, the dashboard answered an expired session with "could not
  // connect" and a retry button that could never work: whether somebody was
  // signed in had been decided once, at startup, and nothing ever asked
  // again.
  //
  // The refusal is not itself the answer — 403 covers both "no session" and
  // "not allowed to have this" — so the server is asked directly. Losing the
  // staff role is the case that would otherwise be silent: the profile still
  // reads, `isStaff` is now false, and the route guard sends them out of the
  // dashboard rather than leaving them in a screen where nothing loads.
  useEffect(() => {
    let checking = false;

    return onAuthFailure(() => {
      // Several tables refuse at once when a session ends. One check answers
      // for all of them.
      if (checking) return;
      checking = true;

      getProfile()
        .then((profile) => setUser(profile))
        // The session really is gone. RequireAuth takes it from here, which
        // is a login form rather than an error page.
        .catch(() => setUser(null))
        .finally(() => {
          checking = false;
        });
    });
  }, []);

  const signIn = useCallback(async (credentials) => {
    await apiSignIn(credentials);
    // Re-read rather than trusting the login response: one shape of user
    // object everywhere, built by the same mapper.
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  // A warehouse worker's four-digit code. Everything after the request is the
  // same as signing in with a password: the profile is re-read so there is one
  // shape of user object, whichever way somebody got in.
  const signInWithCode = useCallback(async (credentials) => {
    await apiSignInWithCode(credentials);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  // A worker who signed in with a password opening the warehouse with their
  // e-mail and PIN. Re-read, so `warehouseUnlocked` and the floor's idle
  // timeout reach everything holding `user`.
  const unlockWarehouse = useCallback(async (details) => {
    await apiUnlockWarehouse(details);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  // The same worker with no PIN yet (or a locked one): a sign-in code sets a
  // new PIN and opens the warehouse. Re-read for the same reason.
  const setupWarehousePin = useCallback(async (details) => {
    await apiSetupWarehousePin(details);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  // A warehouse worker's PIN, on a registered floor device. The same again.
  const signInWithPin = useCallback(async (credentials) => {
    await apiSignInWithPin(credentials);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  // /warehouse/login on a computer that is not a registered floor device.
  const signInWithEmailPin = useCallback(async (credentials) => {
    await apiSignInWithEmailPin(credentials);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  const signUp = useCallback(async (details) => {
    await apiSignUp(details);
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  /**
   * Re-reads the profile from the server and republishes it to everything
   * holding `user`.
   *
   * The profile page and the dashboard's customer list write to the same row,
   * so either can leave this copy stale — a staff member correcting their own
   * name in the customer table is editing the account they are signed in as,
   * and the header would go on showing the old one until a reload. Whoever
   * made the write calls this; re-reading rather than merging the response
   * keeps one mapper responsible for the shape.
   */
  const refreshUser = useCallback(async () => {
    const profile = await getProfile();
    setUser(profile);
    return profile;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } catch {
      // Swallowed, not rethrown. `finally` alone cleared the user and then
      // let the rejection carry on out of here, so every caller had to catch
      // a failure it could do nothing about — and the one in the header does
      // not, which made an offline sign-out an unhandled rejection in the
      // console. There is nothing for a caller to decide: the next line is
      // the whole response to this failing.
    }

    // Clear locally whether or not the request succeeded. The visitor asked
    // to be logged out, and leaving the interface signed in because the
    // network failed is the worse of the two outcomes, especially on a
    // shared machine.
    setUser(null);
  }, []);

  // A code sign-in on a shared floor device ends after so long with nobody
  // doing anything (accounts/middleware.py). The server enforces that by
  // itself; this is so the screen follows. Without it the last worker's name
  // stayed in the top bar until the next person tapped something and was
  // refused.
  //
  // Counted down here from the last answer to something somebody did, and
  // only then is the server asked - as a background request, which it does
  // not count as activity, so asking cannot keep the session awake. It is
  // asked rather than told to sign out because the session may still be in
  // use from somewhere this tab cannot see: another tab, or a photo loaded
  // straight into an <img>. Then the count starts again from that answer.
  const idleSeconds = user?.sessionIdleSeconds;
  useEffect(() => {
    if (!idleSeconds) return undefined;

    let asking = false;
    let stillInUseAt = 0;

    function check() {
      const since = Math.max(lastHeardFromServer(), stillInUseAt);
      if (asking || Date.now() - since < idleSeconds * 1000) return;

      asking = true;
      getProfile({ background: true }).then(
        () => {
          stillInUseAt = Date.now();
          asking = false;
        },
        // Over, or the server cannot be reached to say otherwise. Either way
        // the device has been idle for the whole limit, and the login form is
        // the safe thing to leave on it; RequireWarehouse takes it from here.
        // `asking` stays set: there is nothing left to ask before this effect
        // is cleaned up.
        () => setUser(null),
      );
    }

    const timer = setInterval(check, IDLE_CHECK_MS);
    // Timers are slowed in a hidden tab and stop while a phone sleeps, so look
    // again the moment the screen is back.
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [idleSeconds]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isChecking: state === 'checking',
      signIn,
      signInWithCode,
      signInWithPin,
      signInWithEmailPin,
      unlockWarehouse,
      setupWarehousePin,
      signUp,
      signOut,
      // Lets the profile page push its saved changes back into the header.
      setUser,
      refreshUser,
    }),
    [
      user,
      state,
      signIn,
      signInWithCode,
      signInWithPin,
      signInWithEmailPin,
      unlockWarehouse,
      setupWarehousePin,
      signUp,
      signOut,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
