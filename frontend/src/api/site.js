// src/api/site.js
//
// The switches an admin sets for the public site (backend SiteSettings,
// changed in the Django admin under "Site settings").

import { request } from './client';

/** @returns {Promise<{ show_calculator: boolean }>} */
export function getSiteSwitches() {
  return request('/site/');
}
