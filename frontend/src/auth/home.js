// src/auth/home.js
//
// Where a signed-in user's "home" is. Shared by the login page (where to go
// after signing in) and RedirectIfSignedIn (where to send somebody who opens
// the login page while already signed in), so the two cannot disagree.

/**
 * Where somebody lands after signing in. A warehouse worker who came in with a
 * code or a PIN is on a floor device mid-shift, so straight to the floor's
 * dashboard. One who signed in with a password, like a customer, lands on the
 * same profile page a customer does, with a button to the warehouse. An admin
 * lands on that page too, with a "Dashboard" button at the top, so everybody
 * starts in the same place. The rest of the office lands on its own profile,
 * because /profile sends them there anyway (CustomerProfile in App.jsx).
 *
 * @param {object} profile the signed-in user
 * @param {'password' | 'code'} method how they signed in
 */
export function homeFor(profile, method) {
  if (profile?.role === 'driver') return '/driver';
  // A warehouse manager runs the floor from their own computer: no PIN step.
  if (profile?.isWarehouseManager && !profile?.isStaff) return '/warehouse';
  if (profile?.isWarehouse && !profile?.isStaff) {
    return method === 'password' ? '/profile' : '/warehouse';
  }
  if (profile?.isAdmin) return '/profile';
  if (profile?.isStaff) return '/warehouse/profile';
  return '/profile';
}
