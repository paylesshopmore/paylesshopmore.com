// src/i18n/dashboardPageTranslations.js
//
// The words of the office's own pages, one file per page in ./pages/, with the
// three languages side by side there so they are easy to keep in step. Merged
// into translations.js as `dashboard.pages`, and read by a page through
// pages/Dashboard/usePageText.js:
//
//   const d = usePageText('floorDevices');  d('title')
//
// A test (dashboardPageTranslations.test.js) checks every page has the same
// keys in every language.

import { common } from './pages/common';
import { floorDevices } from './pages/floorDevices';
import { workers } from './pages/workers';
import { bookingWarehouse } from './pages/bookingWarehouse';
import { documents } from './pages/documents';
import { intakeCamera } from './pages/intakeCamera';
import { quotes } from './pages/quotes';
import { packages } from './pages/packages';
import { bookings } from './pages/bookings';
import { invoices } from './pages/invoices';
import { addInvoice } from './pages/addInvoice';
import { shops } from './pages/shops';
import { customers } from './pages/customers';
import { intake } from './pages/intake';
import { measurements } from './pages/measurements';
import { measurementsList } from './pages/measurementsList';
import { warehouseAccess } from './pages/warehouseAccess';
import { messages } from './pages/messages';
import { blog } from './pages/blog';
import { warehouseProfile } from './pages/warehouseProfile';
import { security } from './pages/security';
import { courierTracking } from './pages/courierTracking';
import { prealerts } from './pages/prealerts';
import { reports } from './pages/reports';
import { system } from './pages/system';
import { documentReview } from './pages/documentReview';
import { website } from './pages/website';
import { warehouseManager } from './pages/warehouseManager';
import { warehouseCustomers } from './pages/warehouseCustomers';
import { warehouseReview } from './pages/warehouseReview';
import { warehouseIntakes } from './pages/warehouseIntakes';
import { feedbackStaff } from './pages/feedbackStaff';
import { productReceipts } from './pages/productReceipts';

const PAGES = { common, floorDevices, workers, bookingWarehouse, documents, intakeCamera, quotes, packages, bookings, invoices, addInvoice, shops, customers, intake, measurements, measurementsList, warehouseAccess, messages, blog, warehouseProfile, security, courierTracking, prealerts, reports, system, documentReview, website, warehouseManager, warehouseCustomers, warehouseReview, warehouseIntakes, feedbackStaff, productReceipts };

function forLanguage(language) {
  return Object.fromEntries(Object.entries(PAGES).map(([name, page]) => [name, page[language]]));
}

export const dashboardPageTranslations = {
  nl: forLanguage('nl'),
  en: forLanguage('en'),
  pap: forLanguage('pap'),
};

export { PAGES as dashboardPages };
