// src/components/RedirectIfSignedIn/RedirectIfSignedIn.jsx
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Loading from '../Loading/Loading';
import { useAuth } from '../../auth/useAuth';
import { homeFor } from '../../auth/home';
import { TWO_FACTOR_PATH, needsTwoFactor } from '../../auth/twoFactor';

/**
 * The opposite of RequireAuth: for the login and sign-up pages, which have
 * nothing to offer somebody who is already signed in. They are sent on to
 * their own home page instead of being shown a form to sign in again.
 *
 * Only decided once, for whoever OPENED the page. Signing in on the page
 * makes `isAuthenticated` true as well, and redirecting then would race the
 * page's own navigation - which knows better where to go (back to the page
 * they came from, or to set a warehouse PIN).
 */
export default function RedirectIfSignedIn({ children }) {
  const { isAuthenticated, isChecking, user } = useAuth();
  const location = useLocation();

  // null until the session check has answered; then whether they arrived
  // signed in. Set during render rather than in an effect, so the form never
  // flashes up for a frame before the redirect.
  const [arrivedSignedIn, setArrivedSignedIn] = useState(null);
  if (arrivedSignedIn === null && !isChecking) {
    setArrivedSignedIn(isAuthenticated);
  }

  // Showing the form before the check answers would flash it at a signed-in
  // visitor on every refresh.
  if (isChecking || arrivedSignedIn === null) return <Loading />;

  if (arrivedSignedIn && isAuthenticated) {
    // Signed in with a password but the authenticator code is still to come:
    // that page is where they need to be.
    if (needsTwoFactor(user)) return <Navigate to={TWO_FACTOR_PATH} replace />;
    // `replace` keeps the login page out of history, so Back does not land on
    // it again. Their sign-in method is not known here; 'password' is the
    // ordinary case, and only changes where a floor worker lands.
    return <Navigate to={location.state?.from ?? homeFor(user, 'password')} replace />;
  }

  return children;
}
