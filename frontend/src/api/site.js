// src/api/site.js
//
// The switches an admin sets for the public site (backend SiteSettings,
// changed in the Django admin under "Site settings").

import { request } from './client';

/** @returns {Promise<{ show_calculator: boolean, show_pay_online: boolean, show_about_page: boolean, maintenance_mode: boolean }>} */
export function getSiteSwitches() {
  return request('/site/');
}
