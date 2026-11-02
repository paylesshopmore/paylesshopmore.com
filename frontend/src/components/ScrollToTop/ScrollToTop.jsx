// src/components/ScrollToTop/ScrollToTop.jsx
import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Starts every new page at the top of the window.
 *
 * React Router swaps the page without reloading it, so the browser keeps the
 * old scroll position: click a footer link and the next page opens at its own
 * footer. This puts the window back at the top whenever the address changes.
 *
 * Two cases are left alone:
 * - the Back and Forward buttons ('POP'), so going back returns you to where
 *   you were on the previous page rather than to its top;
 * - a link to a spot on a page (/faq#shipping), which scrolls itself there.
 *
 * Renders nothing; it only has to sit inside the router.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  // useLayoutEffect runs before the browser paints, so the new page never
  // flashes up at the old position first.
  useLayoutEffect(() => {
    if (navigationType === 'POP' || hash) return;
    // 'instant' overrides any smooth scrolling set in the CSS: a page change
    // should not look like a long slide up the old page.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash, navigationType]);

  return null;
}
