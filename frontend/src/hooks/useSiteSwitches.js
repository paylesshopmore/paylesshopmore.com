// src/hooks/useSiteSwitches.js
//
// Which pages of the public site an admin has switched on.
//
// Asked once per visit and shared: the header, the footer and the
// /calculator route all use it, and they should not each send a request.
// Until the answer arrives - and if the request fails - everything counts as
// on, which is the default in the admin too. So a visitor never sees a link
// flicker away on a normal page load, and a broken API does not hide pages.

import { useEffect, useState } from 'react';
import { getSiteSwitches } from '../api/site';

const DEFAULTS = { showCalculator: true };

// One request for the whole visit, started by whichever component asks first.
let pending = null;

function loadSwitches() {
  if (!pending) {
    pending = getSiteSwitches()
      .then((data) => ({ showCalculator: data?.show_calculator !== false }))
      .catch(() => DEFAULTS);
  }
  return pending;
}

/** For tests: forget the cached answer so the next call asks again. */
export function resetSiteSwitches() {
  pending = null;
}

/** @returns {{ showCalculator: boolean }} */
export function useSiteSwitches() {
  const [switches, setSwitches] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    loadSwitches().then((next) => {
      if (!cancelled) setSwitches(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return switches;
}
