import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import RedirectIfSignedIn from './RedirectIfSignedIn';

// Changed per test; the mock reads it on every render.
let auth;
vi.mock('../../auth/useAuth', () => ({ useAuth: () => auth }));

function loginRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <p>Login form</p>
          </RedirectIfSignedIn>
        }
      />
      <Route path="/profile" element={<p>Profile page</p>} />
      <Route path="/driver" element={<p>Driver page</p>} />
      <Route path="/two-factor" element={<p>Two-factor page</p>} />
    </Routes>
  );
}

function renderLogin() {
  return renderWithProviders(loginRoutes(), { route: '/login' });
}

describe('RedirectIfSignedIn', () => {
  beforeEach(() => {
    auth = { isAuthenticated: false, isChecking: false, user: null };
  });

  it('shows the form to somebody signed out', () => {
    renderLogin();
    expect(screen.getByText('Login form')).toBeInTheDocument();
  });

  it('sends somebody already signed in to their own page', () => {
    auth = { isAuthenticated: true, isChecking: false, user: { isAdmin: true } };
    renderLogin();
    expect(screen.getByText('Profile page')).toBeInTheDocument();
    expect(screen.queryByText('Login form')).not.toBeInTheDocument();
  });

  it('uses the same home as signing in does', () => {
    auth = { isAuthenticated: true, isChecking: false, user: { role: 'driver' } };
    renderLogin();
    expect(screen.getByText('Driver page')).toBeInTheDocument();
  });

  it('sends somebody still owing an authenticator code to that page', () => {
    auth = {
      isAuthenticated: true,
      isChecking: false,
      user: { twoFactor: 'code_required' },
    };
    renderLogin();
    expect(screen.getByText('Two-factor page')).toBeInTheDocument();
  });

  it('waits for the session check instead of flashing the form', () => {
    auth = { isAuthenticated: false, isChecking: true, user: null };
    renderLogin();
    expect(screen.queryByText('Login form')).not.toBeInTheDocument();
  });

  it('leaves the page alone when somebody signs in on it', () => {
    const { rerender } = renderLogin();
    // The form's own submit handler decides where to go next; the guard
    // must not jump in first.
    auth = { isAuthenticated: true, isChecking: false, user: { isAdmin: true } };
    rerender(loginRoutes());
    expect(screen.getByText('Login form')).toBeInTheDocument();
  });
});
