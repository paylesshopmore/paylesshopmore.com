// src/api/auth.js
//
// Authentication against the Django API. The credential is an HttpOnly
// session cookie set by the server — nothing here ever holds a token, so an
// XSS bug has nothing to steal.

import { API_ERRORS, ApiError, request } from './client';

// Kept for the pages that already import these names.
export const AUTH_ERRORS = API_ERRORS;
export const AuthError = ApiError;

/**
 * @param {{ email: string, password: string, remember: boolean }} credentials
 * @returns {Promise<object>} the signed-in user
 */
/**
 * "Yes, it is really me": the password again (and the authenticator code when
 * the person uses two-factor) before a sensitive admin action. See
 * components/ReauthDialog and backend accounts/reauth.py.
 */
export async function reauthenticate({ password, code }) {
  return request('/auth/reauthenticate/', { method: 'POST', body: { password, code } });
}

export async function signIn({ email, password }) {
  // The API authenticates on username. The login form asks for an e-mail
  // address, and signup sets username to the e-mail, so they line up.
  return request('/auth/login/', {
    method: 'POST',
    body: { username: email, password },
  });
}

/**
 * Signs a warehouse worker in with the four-digit code an admin e-mailed them.
 *
 * Only warehouse accounts can use this, and the server answers the same 401
 * for every way it can fail - a wrong code, an expired one, one that has used
 * up its five guesses, an address that is not a worker - so the form cannot
 * and must not say which it was.
 *
 * @param {{ email: string, code: string }} credentials
 * @returns {Promise<object>} the signed-in user
 */
export async function signInWithCode({ email, code }) {
  return request('/auth/code-login/', {
    method: 'POST',
    body: { email, code },
  });
}

/**
 * The "Who is working?" list, on a shared floor device an admin registered.
 *
 * The device is recognised by a cookie this code cannot read; from any other
 * device the server refuses with a 403, which is an answer ("this is not a
 * floor device, show the ordinary form") and not an incident.
 *
 * @returns {Promise<{ device: { name: string },
 *   workers: { id: number, name: string, has_pin: boolean, locked: boolean }[] }>}
 */
export async function getFloorRoster() {
  return request('/auth/floor/', { silentAuthFailure: true });
}

/**
 * Signs a warehouse worker in with their PIN, on a registered floor device.
 * One 401 for every way it can fail; a 429 when the device has had too many
 * wrong PINs lately.
 *
 * @param {{ worker: number, pin: string }} credentials
 */
export async function signInWithPin({ worker, pin }) {
  return request('/auth/pin-login/', {
    method: 'POST',
    body: { worker, pin },
    silentAuthFailure: true,
  });
}

/**
 * Signs a warehouse worker in at /warehouse/login with their e-mail address
 * and PIN - on a computer that is not a registered floor device, where the
 * list of names is not shown. One 401 for every way it can be wrong; a 429
 * when this address has tried too often.
 *
 * @param {{ email: string, pin: string }} credentials
 */
export async function signInWithEmailPin({ email, pin }) {
  return request('/auth/warehouse-login/', {
    method: 'POST',
    body: { email, pin },
    silentAuthFailure: true,
  });
}

/**
 * Opens the warehouse for a warehouse worker who signed in with a password:
 * their own e-mail address and their PIN. One 401 for every way it can be
 * wrong, counted against the PIN's five tries.
 *
 * @param {{ email: string, pin: string }} details
 */
export async function unlockWarehouse({ email, pin }) {
  return request('/auth/warehouse-unlock/', {
    method: 'POST',
    body: { email, pin },
    silentAuthFailure: true,
  });
}

/**
 * A warehouse worker signed in with a password, with no PIN yet or a locked
 * one: the sign-in code an admin gave them sets a new PIN and opens the
 * warehouse. A 400 with a reason under `pin` for a PIN that is too easy (the
 * code is not spent); a 401 for a code that does not work.
 *
 * @param {{ code: string, pin: string }} details
 */
export async function setupWarehousePin({ code, pin }) {
  return request('/auth/warehouse-pin-setup/', {
    method: 'POST',
    body: { code, pin },
    silentAuthFailure: true,
  });
}

/**
 * @param {{ firstName: string, lastName: string, email: string,
 *           phone: string, password: string }} details
 */
export async function signUp({ firstName, lastName, email, phone, password }) {
  return request('/auth/signup/', {
    method: 'POST',
    body: {
      // No separate username field on the form, so the e-mail doubles as one.
      username: email,
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phone,
      password,
    },
  });
}

export async function signOut() {
  return request('/auth/logout/', { method: 'POST' });
}

/**
 * Step one of a reset: ask for the e-mail with the link in it.
 *
 * Succeeds whether or not the address belongs to an account — the server
 * answers identically either way, so that this cannot be used to find out who
 * has registered. The page says "if that address is registered…" for the same
 * reason, and must not be changed to promise that a mail is on its way.
 *
 * @param {{ email: string, language?: string }} details
 */
export async function requestPasswordReset({ email, language }) {
  return request('/auth/password-reset/', {
    method: 'POST',
    // The mail is written in whichever language the visitor is reading.
    body: { email, language: language ?? '' },
  });
}

/**
 * Step two: the new password, with the two halves of the link.
 *
 * @param {{ uid: string, token: string, password: string }} details
 */
export async function confirmPasswordReset({ uid, token, password }) {
  return request('/auth/password-reset/confirm/', {
    method: 'POST',
    body: { uid, token, new_password: password },
  });
}
