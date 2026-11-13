// src/api/feedback.js
//
// Feedback (backend feedback/views.py):
//   - the "Feedback" button on every page (anybody, signed in or not);
//   - reviews of delivered shipments on the profile page (the customer);
//   - Dashboard -> Feedback (the office).

import { request } from './client';

/**
 * Sends website feedback. Answers nothing (the server echoes nothing back).
 *
 * @param {{ rating: number, comment?: string, email?: string,
 *           page?: string, language?: string }} feedback
 */
export async function sendFeedback(feedback) {
  return request('/feedback/', { method: 'POST', body: feedback });
}

/**
 * Dashboard -> Feedback: one page of feedback. Filters: kind ('site' |
 * 'delivery'), rating (1-5), handled ('true' | 'false'), search, page.
 */
export async function listStaffFeedback(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
  }
  const query = params.toString();
  const data = await request(`/staff/feedback/${query ? `?${query}` : ''}`);
  // The shape the dashboard's lists use (useCollection).
  return {
    results: data?.results ?? [],
    count: data?.count ?? 0,
    hasNext: Boolean(data?.next),
    hasPrevious: Boolean(data?.previous),
  };
}

/**
 * Marks feedback handled (or not) with an optional note. Answers the row.
 *
 * @param {number} id
 * @param {{ handled?: boolean, staff_note?: string }} changes
 */
export async function updateStaffFeedback(id, changes) {
  return request(`/staff/feedback/${id}/`, { method: 'PATCH', body: changes });
}
