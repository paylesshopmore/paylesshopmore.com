// src/pages/Dashboard/loginMapPopup.js
//
// What appears when an administrator clicks a marker on the login map: the
// username, country, city, IP address, device, browser, time, status and
// security status.
//
// BUILT WITH TEXT NODES, NEVER HTML STRINGS
//   The "username" of a failed attempt is whatever a stranger typed into the
//   sign-in form - it could be "<img src=x onerror=...>". Put into HTML, that
//   would run a script in an administrator's browser. Setting `textContent`
//   can never do that: the characters are shown, not interpreted. So every
//   line below is made that way. (loginMapPopup.test.js checks it.)

/** One "Label: value" line of a popup, built safely. */
function line(label, value) {
  const row = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = `${label}: `;
  row.append(name, document.createTextNode(value || '—'));
  return row;
}

/**
 * The popup for one attempt: username, country, city, IP, device, browser,
 * time, status and security status.
 *
 * @param {object} row  one point from /api/admin/login-activity/map/
 * @param {object} text translated labels, a `when(isoString)` formatter and
 *   `unknownTitle(count)`
 */
export function popupFor(row, text) {
  const box = document.createElement('div');
  box.className = 'loginMapPopup';
  const place = [row.city, row.region].filter(Boolean).join(', ');
  box.append(
    line(text.username, row.identifier),
    line(text.country, row.country),
    line(text.city, place),
    line(text.ip, row.ip_address),
    line(text.device, row.device),
    line(text.browser, row.browser),
    line(text.time, text.when(row.created_at)),
    line(text.status, text.statusName[row.status] ?? row.status),
    line(text.security, text.securityName[row.security_status] ?? row.security_status),
  );
  // Why it was flagged, in words.
  for (const flag of row.flags ?? []) {
    const note = document.createElement('div');
    note.textContent = `• ${text.flagName[flag] ?? flag}`;
    box.append(note);
  }
  return box;
}

/** The popup of the gray marker: how many, and the latest few. */
export function unknownPopup(unknown, text) {
  const box = document.createElement('div');
  box.className = 'loginMapPopup';
  const title = document.createElement('strong');
  title.textContent = text.unknownTitle(unknown.count);
  box.append(title);
  for (const row of unknown.latest) {
    const item = document.createElement('div');
    item.textContent = `${row.identifier || '—'} · ${row.ip_address || '—'} · ${text.when(row.created_at)}`;
    box.append(item);
  }
  return box;
}

