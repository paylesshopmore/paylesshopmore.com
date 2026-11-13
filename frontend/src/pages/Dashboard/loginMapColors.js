// src/pages/Dashboard/loginMapColors.js
//
// The marker colours of the login map, in one place because two files need
// them: the map itself (LoginActivityMap.jsx) draws the markers, and the page
// (LoginActivity.jsx) draws the legend beside it. Kept apart from the map
// component so that file exports only a component (React's hot reload needs it).

export const MARKER_COLORS = {
  success: '#16a34a', // green: a successful sign-in
  failed: '#dc2626', // red: a failed attempt
  suspicious: '#f97316', // orange: crossed a security threshold, or a blocked address
  unknown: '#6b7280', // gray: the place is unknown
};

/** Which colour an attempt gets: suspicious first, then how it went. */
export function colorFor(row) {
  if (row.security_status === 'suspicious' || row.security_status === 'blocked') {
    return MARKER_COLORS.suspicious;
  }
  return row.status === 'success' ? MARKER_COLORS.success : MARKER_COLORS.failed;
}
