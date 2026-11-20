// src/api/about.js
//
// The words of the About us page that an admin can change (backend
// accounts/public.py AboutPageView, edited under "About page" in the Django
// admin). An empty text means "use the wording built into the website".

import { request } from './client';

/**
 * @returns {Promise<{
 *   years_in_business: number,
 *   headline: { nl: string, en: string },
 *   intro: { nl: string, en: string },
 *   story: { nl: string, en: string },
 * }>}
 */
export function getAboutPage() {
  return request('/about/');
}
