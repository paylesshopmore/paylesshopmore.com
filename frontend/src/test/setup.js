// Runs before every test file. See the `test.setupFiles` entry in
// vite.config.js.

import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Testing Library waits one second by default for a findBy* query. That is
// generous on an idle machine and not generous at all when the whole suite is
// running in parallel workers on a busy one: a component that debounces a
// request and then renders its result can genuinely take longer than a second
// to get there, and the test fails for want of CPU rather than for anything
// wrong with the code.
//
// Deliberately below the per-test timeout in vite.config.js. When a query
// gives up first, the failure names the element it could not find; when the
// test budget runs out first, all it says is "timed out", which is the same
// message for every possible cause.
configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  // The language provider reads localStorage on mount and the tests assert on
  // English copy. Without pinning it, the active language would depend on
  // whatever languages jsdom claims the browser prefers.
  window.localStorage.clear();
  window.localStorage.setItem('plsm.language', 'en');
  // The tour remembers a tour in progress here (Tutorial/storage.js). Left
  // over from one test, it would reopen the tour in the next.
  window.sessionStorage.clear();
});

afterEach(() => {
  // Testing Library unmounts on its own only when globals are enabled and the
  // runner supports it; calling it here makes that explicit rather than
  // assumed, and stops one test's DOM leaking into the next one's queries.
  cleanup();
  vi.restoreAllMocks();
});
