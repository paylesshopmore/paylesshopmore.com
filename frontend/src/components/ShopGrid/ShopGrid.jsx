// src/components/ShopGrid/ShopGrid.jsx
//
// The shops a customer can order from, as one row of cards sliding past under
// the hero copy, the full width of the hero. It answers one question - "can
// you get me something from my shop?" - and leaves what happens next to the
// steps further down.
//
// The row travels leftwards, so a new shop enters from the right and reads
// the way the text above it does. It is a loop rather than a carousel with
// controls - there is nothing to choose between, so a control would be a
// decision nobody wants to make.
//
// The shops are rendered twice. The animation slides exactly half the track,
// so the moment the first copy has left the second is sitting where it began
// and the seam never shows. Only the first appearance of each shop is
// announced and reachable by tab; every repeat - the second copy, and any
// fill for a short list - is hidden from assistive technology and taken out
// of the tab order. Hearing or tabbing through the same shops twice would be
// a bug, not a feature.
//
// The shops come from the API the office edits in the dashboard, through
// useShops - so adding a shop there adds it here, with no code change. Until
// that request answers, and if it fails, the bundled list in
// src/data/shops.js stands in. The copy is under `home.shops`.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../i18n/useLanguage';
import { useShops } from '../../hooks/useShops';
import styles from './ShopGrid.module.css';

// How many cards the row needs, at least, before it is longer than the window
// it slides behind: 1400px wide at most, at 170px a card with its gap. With
// fewer shops than this the row is repeated until it is, or a short list
// would slide off and leave a gap before it came round again.
//
// This is only the starting point. Once the row is on screen it measures the
// real window and the real cards and adds more if they are needed - browser
// zoom, a larger default font or a wide screen all change the sums, and nine
// cards left barely a card to spare, so the end of the row could come into
// view as empty space.
const MIN_CARDS = 9;

// How fast the row travels, in pixels a second: a card and its gap about
// every second and a half, however many shops the office has added.
// Raised from 48, then 72, so a long list of shops comes round in reasonable
// time.
const PIXELS_PER_SECOND = 120;

/**
 * One shop, as a card that is entirely a link to that shop's Dutch storefront.
 *
 * `clone` marks the duplicate half of the track: same markup, but invisible
 * to a screen reader and unreachable by tab.
 */
function ShopCard({ shop, cta, clone = false }) {
  return (
    <li className={styles.item} aria-hidden={clone || undefined}>
      <a
        className={styles.card}
        href={shop.url}
        target="_blank"
        // noopener stops the shop's page reaching back through window.opener.
        rel="noopener noreferrer"
        tabIndex={clone ? -1 : undefined}
      >
        <span className={styles.logoWell}>
          {shop.logo ? (
            <img
              // A logo on its own block of brand colour gets its corners
              // rounded, so it sits on the white card as a tile rather than
              // as a rectangle somebody forgot to cut out.
              className={shop.tile ? `${styles.logo} ${styles.logoTile}` : styles.logo}
              src={shop.logo}
              alt={shop.name}
              loading="lazy"
            />
          ) : (
            // A shop the office has added but not yet given a logo.
            <span className={styles.logoName}>{shop.name}</span>
          )}
        </span>

        {/* Shown on hover and whenever the card has keyboard focus, so it is
            not a mouse-only affordance. */}
        <span className={styles.cardCta} aria-hidden="true">
          {cta}
          <svg viewBox="0 0 24 24" className={styles.cardArrow} focusable="false">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </li>
  );
}

/**
 * The sliding row: its shops, then the same shops again so the loop closes.
 *
 * @param {{ shops: object[], cta: string }} props the shops in the office's
 *   own running order.
 */
function MarqueeRow({ shops, cta }) {
  const trackRef = useRef(null);
  const [minCards, setMinCards] = useState(MIN_CARDS);

  // How many cards it really takes to cover the window, plus one so the end
  // of a copy is never in view before the loop wraps round. Measured again
  // whenever the window changes size.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const frame = track?.parentElement;
    if (!track || !frame || typeof ResizeObserver === 'undefined') return undefined;

    const measure = () => {
      const card = track.firstElementChild;
      // offsetWidth, not getBoundingClientRect: it ignores the slide's own
      // transform.
      const cardWidth = card?.offsetWidth ?? 0;
      if (!cardWidth) return;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const needed = Math.ceil(frame.clientWidth / (cardWidth + gap)) + 1;
      setMinCards(Math.max(MIN_CARDS, needed));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Repeated until the row is longer than its window, so a short list still
  // fills it. Three shops become three runs of three, then doubled again
  // below for the loop itself.
  const filled = [];
  while (filled.length < minCards) filled.push(...shops);
  const loopCards = filled.length;

  // The slide itself, moved a frame at a time rather than by a CSS animation.
  // A CSS slide of "-50%" is worked out from the width the row had when it
  // started, and a browser does not always work it out again when the row
  // changes length under it - the shops arriving from the API, more cards
  // added for a wider window. The row then slides past its own end and shows
  // empty space. Here the length of one copy is measured on every frame, from
  // the first card to the first card of the second copy, gaps included, so
  // the loop always wraps at exactly the right place.
  useEffect(() => {
    const track = trackRef.current;
    const frame = track?.parentElement;
    if (!track || !frame || typeof requestAnimationFrame !== 'function') return undefined;

    // Somebody who has asked for less motion gets a still row they can
    // scroll instead; the stylesheet sets that up.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    // Stopped while the pointer is over the row or a card has focus: a row
    // that keeps moving under the pointer is a row whose links are hard to
    // click.
    let hovered = false;
    let focused = false;
    const onEnter = () => { hovered = true; };
    const onLeave = () => { hovered = false; };
    const onFocusIn = () => { focused = true; };
    const onFocusOut = () => { focused = false; };
    frame.addEventListener('pointerenter', onEnter);
    frame.addEventListener('pointerleave', onLeave);
    frame.addEventListener('focusin', onFocusIn);
    frame.addEventListener('focusout', onFocusOut);

    let offset = 0;
    let last = null;
    let raf = requestAnimationFrame(function step(now) {
      // Capped, so a tab left in the background does not leap on its return.
      const elapsed = last === null ? 0 : Math.min(now - last, 100);
      last = now;

      const first = track.children[0];
      const repeat = track.children[loopCards];
      const loop = first && repeat ? repeat.offsetLeft - first.offsetLeft : 0;

      if (loop > 0) {
        if (!hovered && !focused) offset += (PIXELS_PER_SECOND * elapsed) / 1000;
        offset %= loop;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      raf = requestAnimationFrame(step);
    });

    return () => {
      cancelAnimationFrame(raf);
      frame.removeEventListener('pointerenter', onEnter);
      frame.removeEventListener('pointerleave', onLeave);
      frame.removeEventListener('focusin', onFocusIn);
      frame.removeEventListener('focusout', onFocusOut);
      track.style.transform = '';
    };
  }, [loopCards]);

  return (
    <ul ref={trackRef} className={styles.track}>
      {filled.map((shop, index) => (
        <ShopCard
          key={`${shop.id}-${index}`}
          shop={shop}
          cta={cta}
          // Past the first run, a repeat put there only to fill the window.
          clone={index >= shops.length}
        />
      ))}
      {filled.map((shop, index) => (
        <ShopCard key={`clone-${shop.id}-${index}`} shop={shop} cta={cta} clone />
      ))}
    </ul>
  );
}

export default function ShopGrid() {
  const { t } = useLanguage();
  const { shops } = useShops();

  return (
    <section className={styles.panel} aria-labelledby="shops-title">
      {/* A caption over the logos rather than a headline: the hero's own
          title is right above it. */}
      <h2 className={styles.title} id="shops-title">
        {t('home.shops.title')}
      </h2>

      {/* The window the row slides behind. Its edges are faded by CSS, so a
          card arrives and leaves rather than appearing at a hard border. */}
      {shops.length > 0 && (
        <div className={styles.marquee}>
          <MarqueeRow shops={shops} cta={t('home.shops.visit')} />
        </div>
      )}

      <Link className={styles.cta} to="/services">
        {t('home.shops.cta')}
        <span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}
