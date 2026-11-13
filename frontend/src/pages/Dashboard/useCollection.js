// src/pages/Dashboard/useCollection.js
//
// The list behaviour all three dashboard tables share: fetch, filter, search,
// page, and write a single row back after an edit. Written once here so the
// pages themselves are only markup and the columns they show.

import { useCallback, useEffect, useMemo, useState } from 'react';

// Long enough that typing a tracking number is one request rather than
// fourteen, short enough that the table still feels live.
const SEARCH_DEBOUNCE_MS = 300;

const NOTHING = { results: [], count: 0, hasNext: false, hasPrevious: false };

/**
 * @param {(filters: object) => Promise<{results: object[], count: number,
 *   hasNext: boolean, hasPrevious: boolean}>} fetcher one of the list
 *   functions from src/api/staff.js. Defined at module scope by every caller,
 *   so its identity is stable and it can sit in the effect's dependencies.
 * @param {object} [initialFilters] filter values the page starts on
 * @param {string} [initialSearch] term the page starts with, from ?search= in
 *   the URL — which is how the top bar's search box hands a query over.
 */
export function useCollection(fetcher, initialFilters = {}, initialSearch = '') {
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState(initialSearch);
  // Seeded too, so the first fetch already carries the term rather than
  // firing once empty and again when the debounce catches up.
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  // Bumped by the retry button, to re-run a request whose inputs have not
  // changed.
  const [attempt, setAttempt] = useState(0);

  // What was asked for. Everything the fetch depends on, in one string, so
  // the effect has a single dependency and the render below can tell whether
  // the answer it is holding belongs to the current question.
  const key = JSON.stringify({ filters, search, page, attempt });

  // The answer, tagged with the question it answers.
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: NOTHING });

  useEffect(() => {
    let cancelled = false;

    fetcher({ ...filters, search, page })
      .then((data) => {
        if (!cancelled) setAnswer({ key, status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, status: 'error', data: NOTHING });
      });

    // Guards against an out-of-order response: a slow request for the old
    // filters landing after a fast one for the new.
    return () => {
      cancelled = true;
    };
    // `key` already encodes filters, search, page and attempt; listing them
    // again would only re-run the effect for the same question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, key]);

  // Derived rather than stored, which is what keeps the effect above free of
  // a synchronous setState: an answer to a stale question means the current
  // one is still in flight.
  const state = answer.key === key ? answer.status : 'loading';
  const data = answer.key === key ? answer.data : NOTHING;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      // A new search starts over at page one — page 4 of the old result set
      // is almost never page 4 of the new one.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const setFilter = useCallback((name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /**
   * Swap one row for the version the server just returned, instead of
   * refetching the page. Keeps the table from flashing when someone changes a
   * status, and keeps their scroll position.
   */
  const replaceRow = useCallback((row) => {
    setAnswer((current) => ({
      ...current,
      data: {
        ...current.data,
        results: current.data.results.map((item) =>
          item.id === row.id ? row : item,
        ),
      },
    }));
  }, []);

  return useMemo(
    () => ({
      rows: data.results,
      count: data.count,
      hasNext: Boolean(data.hasNext),
      hasPrevious: Boolean(data.hasPrevious),
      filters,
      setFilter,
      // The term the current results were fetched with (debounced), for pages
      // that ask other endpoints the same question - e.g. Login activity's map.
      search,
      searchInput,
      setSearchInput,
      page,
      setPage,
      state,
      reload,
      replaceRow,
    }),
    [data, filters, setFilter, search, searchInput, page, state, reload, replaceRow],
  );
}
