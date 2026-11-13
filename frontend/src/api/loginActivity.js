// src/api/loginActivity.js
//
// The office's "Login activity" page (backend loginactivity/views.py,
// mounted at /api/admin/login-activity/). Office staff and admins only: the
// server answers 403 to everybody else, whatever this page shows.
//
// Every function takes the SAME filters (period, status, security, country,
// user, search, ordering), so the cards, the map, the table and the CSV file
// always describe the same set of sign-in attempts.

import { apiUrl, request } from './client';

const BASE = '/admin/login-activity';

/** { period: '7d', status: '' } -> '?period=7d' (empty values are left out). */
function query(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * One page of the table, in the shape the dashboard's lists use
 * (useCollection): { results, count, hasNext, hasPrevious }.
 */
export async function listLoginActivity(filters = {}) {
  const data = await request(`${BASE}/${query(filters)}`);
  return {
    results: data?.results ?? [],
    count: data?.count ?? 0,
    hasNext: Boolean(data?.next),
    hasPrevious: Boolean(data?.previous),
  };
}

/**
 * The cards: total, successful, failed, unique_users, active_sessions,
 * suspicious, unique_countries, last_24h - all counted from the database.
 * `background`: asked on a timer, not because somebody clicked.
 */
export async function getLoginStats(filters = {}, { background = false } = {}) {
  return request(`${BASE}/stats/${query(filters)}`, { background });
}

/** { points, heat, truncated, unknown: { count, latest } } for the map. */
export async function getLoginMap(filters = {}, { background = false } = {}) {
  return request(`${BASE}/map/${query(filters)}`, { background });
}

/** "An administrator has looked at this flagged attempt." Answers the row. */
export async function reviewLoginActivity(id) {
  return request(`${BASE}/suspicious/${id}/review/`, { method: 'POST' });
}

/**
 * Downloads the filtered attempts as a CSV file.
 *
 * Two steps, because the server wants a recent password confirmation first:
 *   1. a quick "check" request - if the confirmation has run out, the app's
 *      "Confirm it's you" box appears here and the request is retried
 *      (api/client.js);
 *   2. the browser then goes to the real download link, which the server
 *      sends as a file, so the page itself does not change.
 *
 * @returns {Promise<number>} how many rows the file holds
 */
export async function downloadLoginActivityCsv(filters = {}) {
  const check = await request(`${BASE}/export/${query({ ...filters, check: 1 })}`);
  window.location.assign(apiUrl(`${BASE}/export/${query(filters)}`));
  return check?.rows ?? 0;
}
