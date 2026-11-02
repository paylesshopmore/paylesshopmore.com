// src/components/Tutorial/tutorialSteps.js
//
// THE TOURS. There are two kinds:
//
//   1. The general tour (`tutorialSteps` below): how shopping and shipping
//      works, start to finish. It opens by itself once for a new visitor, and
//      is the home page's own tour.
//   2. A short tour of every other page (`pageTours`, further down): what
//      that page is for and where its parts are. Started from the robot in
//      the corner, "Tour this page"; never opens by itself.
//
// To add, remove or reorder a step, edit the lists; nothing else needs
// rewriting. To give a new page a tour, add it to `pageTours` and to
// TOUR_ROUTES at the bottom.
//
// Each step has:
//
//   id      A unique name within its tour. Its texts are looked up in
//           translations.js: under onboarding.steps.<id> for the general
//           tour, under onboarding.pages.<tour>.<id> for a page tour. A
//           `title`, and optionally `text`, `points` (a list of bullet
//           lines) and `note` (a yellow warning line). Add those texts in
//           every language (nl, en, pap).
//
//   kind    Which extra content the step shows under its text, rendered by
//           TutorialStep.jsx:
//             'welcome'   the "About 2 minutes" badge
//             'text'      nothing extra (the default)
//             'address'   the warehouse address card with a copy button
//             'flow'      the store -> warehouse -> shipping -> you diagram
//             'shipping'  the sea and air freight cards
//             'help'      help topics, contact details and "You're all set!"
//           A new kind needs a new branch in TutorialStep.jsx.
//
//   target  What to highlight on the page, as a CSS selector, or a list of
//           selectors tried in order (the first one that is on the page AND
//           visible wins). null for no highlight. If nothing matches - the
//           element is on another page, hidden in the phone menu, or was
//           renamed - the step simply shows without a highlight. It never
//           crashes.
//
//           Use the data-tour="..." attributes for targets, not class names:
//           class names change when the styling changes, and CSS modules
//           rename them anyway. Current hooks:
//             [data-tour="signup"]   Header: "Sign up" (signed out)
//             [data-tour="login"]    Header: "Log in" (signed out)
//             [data-tour="booking"]  Header: the "Booking" link
//             [data-tour="account"]  Header: the customer's name (signed in)
//             [data-tour="menu"]     Header: the ☰ button (phones/tablets)
//             [data-tour="hero"]     Home page: the big headline
//             [data-tour="shops"]    Home page: the strip of shops
//             [data-tour="address"]  Tutorial page: the address card
//             [data-tour="help"]     The robot in the corner (help + guide)
//             #track, #tracking      Track & Trace (home when signed in,
//                                    and the account page)
//           The page tours use hooks named after their page, e.g.
//           [data-tour="services-offer"], set on that page's sections, and
//           the account page's own section ids (#details, #shipments, ...).

// Raise this number when the tour changes enough that everyone who has
// already seen it should see it once more. See storage.js.
export const TUTORIAL_VERSION = 1;

export const tutorialSteps = [
  {
    id: 'welcome',
    kind: 'welcome',
    // The home page's headline, so the card opens under it instead of in
    // the middle of the screen on top of it. On any other page there is no
    // headline hook and the card is centred as before.
    target: '[data-tour="hero"]',
  },
  {
    id: 'account',
    kind: 'text',
    // Signed out: the "Sign up" button. Signed in: their name. On a phone
    // both are inside the menu, so the ☰ button is highlighted instead.
    target: ['[data-tour="signup"]', '[data-tour="account"]', '[data-tour="menu"]'],
  },
  {
    id: 'shop',
    kind: 'text',
    target: '[data-tour="shops"]',
  },
  {
    id: 'address',
    kind: 'address',
    // Only on the tutorial page; elsewhere the card in the tour is enough.
    target: '[data-tour="address"]',
  },
  {
    // After ordering: tell us a parcel is coming, and send the invoice.
    // Without this the warehouse does not know whose parcel it is.
    id: 'register',
    kind: 'text',
    // Pre-alerting happens in the account: the customer's name in the header
    // (signed in), else "Log in"; on a phone both are inside the ☰ menu.
    target: ['[data-tour="account"]', '[data-tour="login"]', '[data-tour="menu"]'],
  },
  {
    id: 'warehouse',
    kind: 'flow',
    target: null,
  },
  {
    id: 'shipping',
    kind: 'shipping',
    target: null,
  },
  {
    id: 'track',
    kind: 'text',
    // The Track & Trace panel where there is one; otherwise the way into the
    // account, where it lives (on a phone, inside the ☰ menu).
    target: [
      '#track',
      '#tracking',
      '[data-tour="account"]',
      '[data-tour="login"]',
      '[data-tour="menu"]',
    ],
  },
  {
    id: 'help',
    kind: 'help',
    target: '[data-tour="help"]',
  },
];

// ---------------------------------------------------------------------------
// The page tours. Every step here is a plain 'text' step with a target; the
// texts live under onboarding.pages.<tour>.<step id> in translations.js.

export const pageTours = {
  services: [
    { id: 'intro', target: '[data-tour="services-intro"]' },
    { id: 'islands', target: '[data-tour="services-islands"]' },
    { id: 'offer', target: '[data-tour="services-offer"]' },
    { id: 'partners', target: '[data-tour="services-partners"]' },
    { id: 'contact', target: '[data-tour="services-contact"]' },
  ],
  booking: [
    { id: 'intro', target: '[data-tour="booking-intro"]' },
    // Normal form or guided form (step by step).
    { id: 'mode', target: '[data-tour="booking-mode"]' },
    { id: 'shipment', target: '[data-tour="booking-shipment"]' },
    { id: 'people', target: '[data-tour="booking-sender"]' },
    { id: 'consignment', target: '[data-tour="booking-consignment"]' },
    // In the guided form these sections are on later steps and not on
    // screen yet; the step then shows without a highlight.
    { id: 'insurance', target: '[data-tour="booking-insurance"]' },
    { id: 'terms', target: '[data-tour="booking-terms"]' },
  ],
  contact: [
    { id: 'methods', target: '[data-tour="contact-methods"]' },
    { id: 'form', target: '[data-tour="contact-form"]' },
  ],
  destinations: [
    { id: 'list', target: '[data-tour="destinations-list"]' },
  ],
  destination: [
    { id: 'facts', target: '[data-tour="destination-facts"]' },
    { id: 'how', target: '[data-tour="destination-how"]' },
    { id: 'faq', target: '[data-tour="destination-faq"]' },
    { id: 'quote', target: '[data-tour="quote-form"]' },
  ],
  profile: [
    { id: 'details', target: '#details' },
    // "Your shipping address" (WarehouseAddressCard.jsx).
    { id: 'address', target: '#warehouse-address' },
    { id: 'tracking', target: '#tracking' },
    { id: 'shipments', target: '#shipments' },
    // The pre-alert list inside My shipments (PreAlerts.jsx).
    { id: 'prealert', target: ['[data-tour="profile-prealerts"]', '#shipments'] },
    // "Delivery" / "Pick it up myself" sits inside a shipment's pop-up,
    // which is not open yet: the shipments card is highlighted instead.
    { id: 'handover', target: '#shipments' },
    { id: 'bookings', target: '#bookings' },
    { id: 'invoices', target: '#invoices' },
    { id: 'notifications', target: '#notifications' },
  ],
  // The pre-alert form (/prealert, PreAlertForm.jsx).
  prealert: [
    { id: 'intro', target: '[data-tour="prealert-intro"]' },
    { id: 'courier', target: '[data-tour="prealert-courier"]' },
    { id: 'shop', target: '[data-tour="prealert-shop"]' },
    { id: 'description', target: '[data-tour="prealert-description"]' },
    { id: 'receiver', target: '[data-tour="prealert-receiver"]' },
    { id: 'invoice', target: '[data-tour="prealert-invoice"]' },
    { id: 'confirm', target: '[data-tour="prealert-confirm"]' },
  ],
  login: [
    { id: 'form', target: '[data-tour="login-form"]' },
    { id: 'forgot', target: '[data-tour="login-forgot"]' },
    { id: 'signup', target: '[data-tour="login-signup"]' },
  ],
  signup: [
    { id: 'form', target: '[data-tour="signup-form"]' },
    { id: 'password', target: '[data-tour="signup-password"]' },
    { id: 'terms', target: '[data-tour="signup-terms"]' },
  ],
  tutorial: [
    { id: 'player', target: '[data-tour="tutorial-player"]' },
    { id: 'written', target: '[data-tour="tutorial-written"]' },
    { id: 'cta', target: '[data-tour="tutorial-cta"]' },
  ],
  faq: [
    { id: 'topics', target: '[data-tour="faq-topics"]' },
    { id: 'important', target: '[data-tour="faq-important"]' },
    { id: 'more', target: '[data-tour="faq-more"]' },
  ],
  blog: [
    { id: 'intro', target: '[data-tour="blog-intro"]' },
    { id: 'posts', target: '[data-tour="blog-posts"]' },
  ],
  blogPost: [
    { id: 'article', target: '[data-tour="blog-article"]' },
    { id: 'cta', target: '[data-tour="blog-cta"]' },
    { id: 'back', target: '[data-tour="blog-back"]' },
  ],
  terms: [
    { id: 'note', target: '[data-tour="terms-note"]' },
    { id: 'contents', target: '[data-tour="terms-contents"]' },
    { id: 'conditions', target: '[data-tour="terms-conditions"]' },
    { id: 'contact', target: '[data-tour="terms-contact"]' },
  ],
  privacy: [
    { id: 'intro', target: '[data-tour="privacy-intro"]' },
    { id: 'contact', target: '[data-tour="privacy-contact"]' },
  ],
  // The warehouse (/warehouse, WarehouseHome.jsx and WarehouseLayout.jsx).
  // Opens by itself once, the first time somebody opens the warehouse, and
  // again from the "Guide" button in its top bar. The steps without a target
  // explain the pages a step leads to (a package's page, the intake form),
  // which are not on screen yet.
  warehouse: [
    { id: 'welcome', target: null },
    { id: 'scan', target: '[data-tour="wh-scan"]' },
    { id: 'package', target: null },
    { id: 'newSheet', target: '[data-tour="wh-new-sheet"]' },
    { id: 'intake', target: null },
    { id: 'list', target: '[data-tour="wh-list"]' },
    { id: 'filters', target: '[data-tour="wh-filters"]' },
    // The sidebar on a wide screen; the bottom bar on a phone.
    { id: 'menu', target: ['[data-tour="wh-menu"]', '[data-tour="wh-tabs"]'] },
    { id: 'help', target: '[data-tour="wh-help"]' },
  ],
  // The office dashboard (/dashboard, DashboardLayout.jsx). Opens by itself
  // once, the first time somebody opens the dashboard, and again from the
  // "Guide" button in its top bar. Each sidebar group gets a step; on a phone
  // the sidebar is folded away, so those steps show without a highlight.
  dashboard: [
    { id: 'welcome', target: null },
    { id: 'overview', target: '[data-tour="db-nav-overview"]' },
    { id: 'sales', target: '[data-tour="db-nav-sales"]' },
    { id: 'shipments', target: '[data-tour="db-nav-shipments"]' },
    { id: 'billing', target: '[data-tour="db-nav-billing"]' },
    { id: 'people', target: '[data-tour="db-nav-people"]' },
    { id: 'website', target: '[data-tour="db-nav-website"]' },
    { id: 'warehouse', target: '[data-tour="db-nav-warehouse"]' },
    { id: 'search', target: '[data-tour="db-search"]' },
    { id: 'foot', target: '[data-tour="db-foot"]' },
    { id: 'help', target: '[data-tour="db-help"]' },
  ],
  // The Customers page (/dashboard/customers, Customers.jsx), from the same
  // "Guide" button while that page is open.
  dashboardCustomers: [
    { id: 'intro', target: '[data-tour="db-cust-intro"]' },
    { id: 'filters', target: '[data-tour="db-cust-filters"]' },
    { id: 'create', target: '[data-tour="db-cust-new"]' },
    { id: 'table', target: '[data-tour="db-cust-table"]' },
    { id: 'delete', target: '[data-tour="db-cust-table"]' },
  ],
  // The Invoices page (/dashboard/invoices, Invoices.jsx), from the same
  // "Guide" button while that page is open. When the list is empty there is
  // no table, so the table steps show without a highlight.
  dashboardInvoices: [
    { id: 'intro', target: '[data-tour="db-inv-intro"]' },
    { id: 'filters', target: '[data-tour="db-inv-filters"]' },
    { id: 'table', target: '[data-tour="db-inv-table"]' },
    { id: 'review', target: '[data-tour="db-inv-table"]' },
    { id: 'new', target: '[data-tour="db-inv-new"]' },
    { id: 'upload', target: '[data-tour="db-inv-upload"]' },
    { id: 'settings', target: '[data-tour="db-inv-settings"]' },
  ],
  // The other dashboard pages, one tour each, all from the same "Guide"
  // button. A list with no rows has no table, so a table step then shows
  // without a highlight.
  dashboardQuotes: [
    { id: 'intro', target: '[data-tour="db-quotes-intro"]' },
    { id: 'filters', target: '[data-tour="db-quotes-filters"]' },
    { id: 'table', target: '[data-tour="db-quotes-table"]' },
    { id: 'open', target: '[data-tour="db-quotes-table"]' },
  ],
  dashboardBookings: [
    { id: 'intro', target: '[data-tour="db-bookings-intro"]' },
    { id: 'filters', target: '[data-tour="db-bookings-filters"]' },
    { id: 'table', target: '[data-tour="db-bookings-table"]' },
    { id: 'status', target: '[data-tour="db-bookings-table"]' },
  ],
  dashboardMessages: [
    { id: 'intro', target: '[data-tour="db-messages-intro"]' },
    { id: 'filters', target: '[data-tour="db-messages-filters"]' },
    { id: 'table', target: '[data-tour="db-messages-table"]' },
  ],
  dashboardPackages: [
    { id: 'intro', target: '[data-tour="db-packages-intro"]' },
    { id: 'filters', target: '[data-tour="db-packages-filters"]' },
    { id: 'table', target: '[data-tour="db-packages-table"]' },
    { id: 'status', target: '[data-tour="db-packages-table"]' },
  ],
  dashboardMeasurements: [
    { id: 'intro', target: '[data-tour="db-measurements-intro"]' },
    { id: 'filters', target: '[data-tour="db-measurements-filters"]' },
    { id: 'table', target: '[data-tour="db-measurements-table"]' },
  ],
  dashboardDocuments: [
    { id: 'intro', target: '[data-tour="db-documents-intro"]' },
    { id: 'filters', target: '[data-tour="db-documents-filters"]' },
    { id: 'table', target: '[data-tour="db-documents-table"]' },
  ],
  dashboardWorkers: [
    { id: 'intro', target: '[data-tour="db-workers-intro"]' },
    { id: 'new', target: ['[data-tour="db-workers-new"]', '[data-tour="db-workers-filters"]'] },
    { id: 'code', target: ['[data-tour="db-workers-code"]', '[data-tour="db-workers-filters"]'] },
    { id: 'table', target: '[data-tour="db-workers-table"]' },
  ],
  dashboardWarehouseAccess: [
    { id: 'intro', target: '[data-tour="db-access-intro"]' },
    { id: 'switches', target: '[data-tour="db-access-switches"]' },
  ],
  dashboardFloorDevices: [
    { id: 'intro', target: '[data-tour="db-devices-intro"]' },
    { id: 'register', target: '[data-tour="db-devices-register"]' },
    { id: 'table', target: '[data-tour="db-devices-table"]' },
    { id: 'log', target: '[data-tour="db-devices-log"]' },
  ],
  dashboardShops: [
    { id: 'intro', target: '[data-tour="db-shops-intro"]' },
    { id: 'add', target: '[data-tour="db-shops-add"]' },
    { id: 'table', target: ['[data-tour="db-shops-table"]', '[data-tour="db-shops-filters"]'] },
  ],
  // ---- Added 2026-10: every page has a tour. The first step lights up the
  // page's own heading ('h1'), so no extra data-tour hook is needed; the
  // others explain with no highlight.
  // Public pages.
  calculator: [
    { id: 'intro', target: 'h1' },
    { id: 'result', target: null },
  ],
  forgotPassword: [
    { id: 'intro', target: 'h1' },
    { id: 'next', target: null },
  ],
  resetPassword: [
    { id: 'intro', target: 'h1' },
    { id: 'next', target: null },
  ],
  twoFactor: [
    { id: 'intro', target: 'h1' },
    { id: 'lost', target: null },
  ],
  // Warehouse pages (the "Guide" button in the warehouse top bar).
  warehouseScan: [
    { id: 'intro', target: 'h1' },
    { id: 'result', target: null },
  ],
  warehousePackage: [
    { id: 'intro', target: 'h1' },
    { id: 'steps', target: null },
    { id: 'automatic', target: null },
    { id: 'extra', target: null },
  ],
  warehouseIntake: [
    { id: 'intro', target: 'h1' },
    { id: 'release', target: null },
  ],
  warehouseProfile: [
    { id: 'intro', target: 'h1' },
    { id: 'tools', target: null },
  ],
  warehousePin: [
    { id: 'intro', target: 'h1' },
  ],
  // Office dashboard pages (the "Guide" button in the dashboard top bar).
  dashboardInvoiceEditor: [
    { id: 'intro', target: 'h1' },
    { id: 'preview', target: null },
    { id: 'save', target: null },
  ],
  dashboardInvoiceSettings: [
    { id: 'intro', target: 'h1' },
  ],
  dashboardPreAlerts: [
    { id: 'intro', target: '[data-tour="db-prealerts-intro"]' },
    { id: 'filters', target: '[data-tour="db-prealerts-filters"]' },
  ],
  dashboardCourierTracking: [
    { id: 'intro', target: '[data-tour="db-courier-intro"]' },
    { id: 'filters', target: '[data-tour="db-courier-filters"]' },
    { id: 'details', target: null },
  ],
  dashboardSecurity: [
    { id: 'intro', target: 'h1' },
    { id: 'modes', target: null },
    { id: 'history', target: null },
  ],
  // The driver's app (its "Guide" button).
  driver: [
    { id: 'intro', target: 'h1' },
    { id: 'deliver', target: null },
  ],
  dashboardBlog: [
    { id: 'intro', target: '[data-tour="db-blog-intro"]' },
    { id: 'new', target: '[data-tour="db-blog-new"]' },
    { id: 'table', target: '[data-tour="db-blog-table"]' },
  ],
};

// Which tour belongs to which page. Checked in order, so a destination page
// matches before the index it sits under. Any page not listed here (the home
// page, 404, ...) gets the general tour.
const TOUR_ROUTES = [
  { match: (path) => path === '/services', tour: 'services' },
  { match: (path) => path === '/booking', tour: 'booking' },
  { match: (path) => path === '/contact', tour: 'contact' },
  { match: (path) => path.startsWith('/destinations/'), tour: 'destination' },
  { match: (path) => path === '/destinations', tour: 'destinations' },
  { match: (path) => path === '/profile', tour: 'profile' },
  { match: (path) => path === '/prealert', tour: 'prealert' },
  { match: (path) => path === '/login', tour: 'login' },
  { match: (path) => path === '/signup', tour: 'signup' },
  { match: (path) => path === '/tutorial', tour: 'tutorial' },
  { match: (path) => path === '/faq', tour: 'faq' },
  { match: (path) => path.startsWith('/blog/'), tour: 'blogPost' },
  { match: (path) => path === '/blog', tour: 'blog' },
  { match: (path) => path === '/terms', tour: 'terms' },
  { match: (path) => path === '/privacy', tour: 'privacy' },
  { match: (path) => path === '/calculator', tour: 'calculator' },
  { match: (path) => path === '/forgot-password', tour: 'forgotPassword' },
  { match: (path) => path.startsWith('/reset-password/'), tour: 'resetPassword' },
  { match: (path) => path === '/two-factor', tour: 'twoFactor' },
  { match: (path) => path === '/warehouse', tour: 'warehouse' },
  { match: (path) => path === '/warehouse/scan', tour: 'warehouseScan' },
  { match: (path) => path.startsWith('/warehouse/packages/'), tour: 'warehousePackage' },
  { match: (path) => path === '/warehouse/intake', tour: 'warehouseIntake' },
  { match: (path) => path === '/warehouse/profile', tour: 'warehouseProfile' },
  { match: (path) => path === '/warehouse/pin', tour: 'warehousePin' },
  { match: (path) => path === '/driver', tour: 'driver' },
  { match: (path) => path === '/dashboard/invoices/settings', tour: 'dashboardInvoiceSettings' },
  { match: (path) => path === '/dashboard/invoices/new' || /^\/dashboard\/invoices\/\d+\/edit$/.test(path),
    tour: 'dashboardInvoiceEditor' },
  { match: (path) => path === '/dashboard/prealerts', tour: 'dashboardPreAlerts' },
  { match: (path) => path === '/dashboard/courier-tracking', tour: 'dashboardCourierTracking' },
  { match: (path) => path === '/dashboard/security', tour: 'dashboardSecurity' },
  { match: (path) => path === '/dashboard/customers', tour: 'dashboardCustomers' },
  { match: (path) => path === '/dashboard/invoices', tour: 'dashboardInvoices' },
  { match: (path) => path === '/dashboard/quotes', tour: 'dashboardQuotes' },
  { match: (path) => path === '/dashboard/bookings', tour: 'dashboardBookings' },
  { match: (path) => path === '/dashboard/messages', tour: 'dashboardMessages' },
  { match: (path) => path === '/dashboard/packages', tour: 'dashboardPackages' },
  { match: (path) => path === '/dashboard/measurements', tour: 'dashboardMeasurements' },
  { match: (path) => path === '/dashboard/documents', tour: 'dashboardDocuments' },
  { match: (path) => path === '/dashboard/workers', tour: 'dashboardWorkers' },
  { match: (path) => path === '/dashboard/warehouse-access', tour: 'dashboardWarehouseAccess' },
  { match: (path) => path === '/dashboard/floor-devices', tour: 'dashboardFloorDevices' },
  { match: (path) => path === '/dashboard/shops', tour: 'dashboardShops' },
  { match: (path) => path === '/dashboard/blog', tour: 'dashboardBlog' },
  { match: (path) => path === '/dashboard', tour: 'dashboard' },
];

/** The id of the general tour, for the places that ask for it by name. */
export const GENERAL_TOUR = 'general';

/** The tour for the page at this address: a page tour id, or GENERAL_TOUR. */
export function tourForPath(pathname) {
  return TOUR_ROUTES.find((route) => route.match(pathname))?.tour ?? GENERAL_TOUR;
}

/** The steps of a tour, by id. Unknown ids get the general tour. */
export function stepsOf(tourId) {
  return pageTours[tourId] ?? tutorialSteps;
}
