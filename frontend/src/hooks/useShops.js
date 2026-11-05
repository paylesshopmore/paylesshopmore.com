// src/hooks/useShops.js
//
// The shops the services page lists, fetched from the API the office edits
// through the dashboard.
//
// Two things keep the page from ever looking broken. Until the request
// answers - and if it fails outright - the bundled list in src/data/shops.js
// stands in, so a visitor sees the same shops the site has always shown
// rather than an empty grid. And a row whose logo has not been uploaded yet
// borrows the bundled logo for that name, which is what lets the office fill
// the table in over time without the page losing its pictures in between.

import { useEffect, useState } from 'react';
import { listShops, logoUrl } from '../api/shops';
import { SHOPS, bundledLogo, displayLogo } from '../data/shops';

/**
 * Whether a bundled logo wants its corners rounded, by lowercased name.
 *
 * `tile` says the mark is drawn on its own block of brand colour, which is a
 * fact about the picture rather than about the row it came from. The logo
 * itself comes from bundledLogo() in ../data/shops.
 */
const BUNDLED_TILE = new Map(
  SHOPS.map((shop) => [shop.name.toLowerCase(), shop.tile ?? false]),
);

/**
 * The shops A to Z by name, ignoring case and accents, so "bol.com" and
 * "Bol.com" sort the same and a new shop always lands in its place in the
 * alphabet, wherever it was added or dragged to in the dashboard.
 *
 * A copy: the list it is given is left as it was.
 */
export function sortByName(shops) {
  return [...shops].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'nl', { sensitivity: 'base' }),
  );
}

/** The bundled list, in the shape the API returns, for use before it answers. */
const BUNDLED_SHOPS = sortByName(SHOPS).map((shop, index) => ({
  id: `bundled-${index}`,
  name: shop.name,
  url: shop.href,
  logo: displayLogo(shop),
  tile: shop.tile ?? false,
  description: '',
}));

/** One API row, with its logo resolved to something an <img> can use. */
function withLogo(shop) {
  const uploaded = logoUrl(shop.logo);

  return {
    ...shop,
    // The uploaded logo when there is one, the bundled copy when there is
    // not, and null when this shop is new and has neither - the card falls
    // back to the shop's name in type for that.
    logo: uploaded ?? bundledLogo(shop.name),
    // Only meaningful for a bundled logo. An uploaded one is whatever the
    // office uploaded, and guessing that it needs a tile would round the
    // corners off a mark that has none.
    tile: uploaded ? false : (BUNDLED_TILE.get(shop.name?.toLowerCase()) ?? false),
  };
}

/**
 * @returns {{shops: object[], loading: boolean}} `shops` is never empty
 *   while the bundled list has anything in it, so callers do not need an
 *   empty state for the moment before the request lands.
 */
export function useShops() {
  const [shops, setShops] = useState(BUNDLED_SHOPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listShops()
      .then((rows) => {
        if (cancelled) return;
        // An empty table is not an answer worth showing. It means the office
        // has emptied it or the seed never ran, and either way the bundled
        // list is better than nothing on a public page.
        if (rows.length > 0) setShops(sortByName(rows).map(withLogo));
      })
      // Left on the bundled list. The services page is not worth an error
      // banner over: the visitor still sees shops, which is the point of it.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { shops, loading };
}
