// src/App.jsx
//
// THE ROUTE TABLE: which address opens which page, and who may open it.
// New to the code? Read docs/WEBSITE-MAP.md first - it explains every page in
// plain words and how they link to each other. Each page file repeats its own
// part of that map in a "CONNECTED PAGES" comment at its top.
//
// How to read it:
//   - `lazy(() => import(...))` below: a page's code is only downloaded when
//     somebody opens it, so the first visit stays fast.
//   - <Route path="/booking" element={<Booking />} />: /booking shows Booking.
//   - <RequireAuth>, <RequireStaff>, <RequireWarehouse>, <RequireDriver>:
//     guards that send people elsewhere when they may not see a page. They
//     only change the screen - the backend refuses the data anyway.
//   - <Navigate ... replace />: an old address that now sends you on to a new one.

import { Suspense, lazy } from 'react';
import { Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom';
import Header from './components/Header/Header';
import Loading from './components/Loading/Loading';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import RequireAuth from './components/RequireAuth/RequireAuth';
import RedirectIfSignedIn from './components/RedirectIfSignedIn/RedirectIfSignedIn';
import RequireStaff from './components/RequireStaff/RequireStaff';
import RequireWarehouse from './components/RequireWarehouse/RequireWarehouse';
import RequireDriver from './components/RequireDriver/RequireDriver';
import LanguageSwitcher from './components/LanguageSwitcher/LanguageSwitcher';
import PageGuide from './components/PageGuide/PageGuide';
import { useSiteSwitches } from './hooks/useSiteSwitches';
import ChatProvider from './components/ChatAssistant/ChatProvider';
import NotificationsProvider from './components/Notifications/NotificationsProvider';
import TutorialProvider from './components/Tutorial/TutorialProvider';
import ReauthDialog from './components/ReauthDialog/ReauthDialog';
import Footer from './components/Footer/Footer';
import { useAuth } from './auth/useAuth';

// Loaded on demand: each becomes its own chunk, so someone who only reads the
// home page never downloads the profile forms. On a slow connection the
// Suspense fallback below is what they see while the chunk arrives.
const Home = lazy(() => import('./pages/Home/Home'));
const Booking = lazy(() => import('./pages/Booking/Booking'));
const Services = lazy(() => import('./pages/Services/Services'));
const Tutorial = lazy(() => import('./pages/Tutorial/Tutorial'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const Login = lazy(() => import('./pages/Login/Login'));
const Signup = lazy(() => import('./pages/Signup/Signup'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Destinations = lazy(() => import('./pages/Destinations/Destinations'));
const Destination = lazy(() => import('./pages/Destination/Destination'));
const ForgotPassword = lazy(
  () => import('./pages/PasswordReset/ForgotPassword'),
);
const ResetPassword = lazy(() => import('./pages/PasswordReset/ResetPassword'));
const Privacy = lazy(() => import('./pages/Privacy/Privacy'));
const Terms = lazy(() => import('./pages/Terms/Terms'));
const Faq = lazy(() => import('./pages/Faq/Faq'));
// The shipping cost calculator, linked from the header and the footer.
const Calculator = lazy(() => import('./pages/Calculator/Calculator'));
// The blog: its index and one article. The posts come from the server, where
// the office writes them in the dashboard.
const Blog = lazy(() => import('./pages/Blog/Blog'));
const BlogPost = lazy(() => import('./pages/Blog/BlogPost'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));
// The authenticator-app step of signing in (when the admin's two-factor
// policy asks for it), and its one-time setup.
const TwoFactorPage = lazy(() => import('./pages/TwoFactor/TwoFactorPage'));

// The staff dashboard. Lazy like the rest, which matters more here than
// anywhere else: customers are most of the traffic and none of them will ever
// open these chunks.
const DashboardLayout = lazy(() => import('./pages/Dashboard/DashboardLayout'));
const Overview = lazy(() => import('./pages/Dashboard/Overview'));
const Quotes = lazy(() => import('./pages/Dashboard/Quotes'));
const Messages = lazy(() => import('./pages/Dashboard/Messages'));
const Packages = lazy(() => import('./pages/Dashboard/Packages'));
const Intake = lazy(() => import('./pages/Dashboard/Intake'));
const Scan = lazy(() => import('./pages/Dashboard/Scan'));
const Customers = lazy(() => import('./pages/Dashboard/Customers'));
const Workers = lazy(() => import('./pages/Dashboard/Workers'));
const WarehouseAccess = lazy(() => import('./pages/Dashboard/WarehouseAccess'));
const FloorDevices = lazy(() => import('./pages/Dashboard/FloorDevices'));
const Bookings = lazy(() => import('./pages/Dashboard/Bookings'));
const Invoices = lazy(() => import('./pages/Dashboard/Invoices'));
// The invoice editor and its settings page carry Bootstrap (scoped to them),
// so they are their own lazy chunks and nobody else downloads it.
const InvoiceEditor = lazy(() => import('./pages/Dashboard/invoice/InvoiceEditor'));
const InvoiceSettingsPage = lazy(() => import('./pages/Dashboard/invoice/InvoiceSettingsPage'));
const Documents = lazy(() => import('./pages/Dashboard/Documents'));
const PreAlertForm = lazy(() => import('./pages/PreAlert/PreAlertForm'));
const Shops = lazy(() => import('./pages/Dashboard/Shops'));
// Webshop orders on their way to our warehouse (backend/tracking/).
const CourierTrackingPage = lazy(() => import('./pages/Dashboard/CourierTracking'));
// Parcels customers pre-alerted (backend/prealerts/).
const PreAlertsPage = lazy(() => import('./pages/Dashboard/PreAlerts'));
const DashboardBlog = lazy(() => import('./pages/Dashboard/Blog'));
const MeasurementsList = lazy(() => import('./pages/Dashboard/MeasurementsList'));
// API keys and webhooks for other software. Admins only.
// The admin's two-factor policy. Admins only.
const Security = lazy(() => import('./pages/Dashboard/Security'));
// Which pages of the public site are on, e.g. the Calculator (admins).
const WebsiteSettings = lazy(() => import('./pages/Dashboard/WebsiteSettings'));
// The carriers' own tracking APIs (backend/tracking/adapters/). Admins only.
const Reports = lazy(() => import('./pages/Dashboard/Reports'));
const SystemStatus = lazy(() => import('./pages/Dashboard/SystemStatus'));
const DocumentReview = lazy(() => import('./pages/Dashboard/DocumentReview'));

// The warehouse dashboard. Scan and Intake above are shared with it.
const WarehouseLayout = lazy(() => import('./pages/Warehouse/WarehouseLayout'));
// Scan, New intake sheet and the packages in the warehouse.
const WarehouseHome = lazy(() => import('./pages/Warehouse/WarehouseHome'));
const WarehouseProfile = lazy(() => import('./pages/Warehouse/WarehouseProfile'));
// A floor worker choosing their PIN, straight after an e-mailed code.
const SetPinPage = lazy(() => import('./pages/Warehouse/SetPinPage'));
const WarehouseLogin = lazy(() => import('./pages/Warehouse/WarehouseLogin'));
const ManagerLayout = lazy(() => import('./pages/Warehouse/ManagerLayout'));
const ManagerOverview = lazy(() => import('./pages/Warehouse/ManagerOverview'));
const ManagerActivity = lazy(() => import('./pages/Warehouse/ManagerActivity'));
const PackagePage = lazy(() => import('./pages/Warehouse/PackagePage'));
const ShipmentLabel = lazy(() => import('./pages/Warehouse/ShipmentLabel'));

// The driver's app: deliveries waiting to be handed over.
const DriverPage = lazy(() => import('./pages/Driver/DriverPage'));

/**
 * The old office addresses of the two warehouse pages, sent on to their new
 * home with the query string intact - /dashboard/intake?sheet=41 is the link
 * in every handover e-mail sent before the move.
 */
function MovedToWarehouse({ page }) {
  const { search } = useLocation();
  return <Navigate to={`/warehouse/${page}${search}`} replace />;
}

/** The warehouse's shipment pages moved to /warehouse/packages. */
function MovedToPackages() {
  const { id } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/warehouse/packages${id ? `/${id}` : ''}${search}`} replace />;
}

/**
 * /profile is the customer's page: addresses, shipments, invoices.
 * The office has its own profile in the warehouse shell instead, so it is
 * sent there. Except admins: they may open it to see the page as a customer
 * does. A warehouse worker stays: signing in with a password lands them here
 * like anybody else, with a button to the warehouse.
 */
function CustomerProfile() {
  const { user } = useAuth();

  // Admins may look at it, to see the page as a customer does (the
  // "Customer page" link in their account menu).
  if (user?.isStaff && !user?.isAdmin) {
    return <Navigate to="/warehouse/profile" replace />;
  }

  return <Profile />;
}

// The Calculator page, unless an admin has hidden it (Site settings in the
// Django admin). Staff can still open it, to check it before switching it
// back on; everyone else is sent to the home page.
function CalculatorPage() {
  const { user } = useAuth();
  const { showCalculator } = useSiteSwitches();

  if (!showCalculator && !user?.isStaff) {
    return <Navigate to="/" replace />;
  }

  return <Calculator />;
}

export default function App() {
  const { pathname } = useLocation();

  // The dashboard is an application rather than a page of the website: it
  // brings its own top bar, its own navigation and its own way out, and fills
  // the window. Leaving the site's header above it would mean two navigation
  // bars stacked on top of each other, and the marketing footer under a table
  // of shipments reads as a mistake.
  // The same goes for the warehouse's.
  const isDashboard = ['/dashboard', '/warehouse', '/driver'].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );

  return (
    // The onboarding tour wraps the whole site, so the robot's "Help" list
    // and any page can start it. Off on the staff screens, like the guide
    // below - except the warehouse and the office dashboard, which have tours
    // of their own ("warehouse" and "dashboard" in tutorialSteps.js, started
    // from their top bars).
    <TutorialProvider
      enabled={
        !isDashboard ||
        pathname.startsWith('/warehouse') ||
        pathname.startsWith('/dashboard') ||
        pathname.startsWith('/driver')
      }
    >
      {/* A signed-in customer's notifications: the alert in the corner when
          a new one comes in, and the bell in the header. Off on the staff
          screens, like the tour. */}
      <NotificationsProvider enabled={!isDashboard}>
      {/* The chat assistant's conversation, kept above the routes so it
          survives moving between pages. It is shown inside the robot guide
          below ("Ask our assistant"). */}
      <ChatProvider>
      {/* A new page opens at its top, not where the last one was left. */}
      <ScrollToTop />
      {!isDashboard && <Header />}
      {/* Boundary outside Suspense: a chunk that fails to download throws
          rather than suspending, so only the boundary can catch it. */}
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Track & Trace is a card in the customer's account now: a
                tracking number alone is not enough to follow a shipment, or
                anyone holding one could. The address stays, because the
                shipment e-mails link to it; /profile does the sign-in check. */}
            <Route
              path="/tracking"
              element={<Navigate to="/profile#tracking" replace />}
            />
            <Route path="/booking" element={<Booking />} />
            <Route path="/services" element={<Services />} />
            {/* The guided walkthrough, linked from the header and the home page. */}
            <Route path="/tutorial" element={<Tutorial />} />
            <Route path="/contact" element={<Contact />} />
            {/* Linked from the footer of every page on the site. */}
            <Route path="/privacy" element={<Privacy />} />
            {/* Linked from the footer and from the sign-up form. */}
            <Route path="/terms" element={<Terms />} />
            {/* Linked from the footer of every page. */}
            <Route path="/faq" element={<Faq />} />
            {/* Linked from the header and footer; until now it led nowhere. */}
            <Route path="/calculator" element={<CalculatorPage />} />
            {/* Also linked from the footer of every page. */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            {/* Somebody already signed in is sent on to their own page:
                there is nothing for them on either form. */}
            <Route
              path="/login"
              element={
                <RedirectIfSignedIn>
                  <Login />
                </RedirectIfSignedIn>
              }
            />
            <Route path="/two-factor" element={<TwoFactorPage />} />
            <Route
              path="/signup"
              element={
                <RedirectIfSignedIn>
                  <Signup />
                </RedirectIfSignedIn>
              }
            />
            {/* The login page has linked here all along; until now it
                landed on the 404 page. */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* Both halves of the link from the reset e-mail. They are
                opaque to the browser — the server checks them. */}
            <Route
              path="/reset-password/:uid/:token"
              element={<ResetPassword />}
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <CustomerProfile />
                </RequireAuth>
              }
            />
            {/* A customer registering a parcel on its way to our warehouse. */}
            <Route
              path="/prealert"
              element={
                <RequireAuth>
                  <PreAlertForm />
                </RequireAuth>
              }
            />
            {/* Outside the office guard below, which would otherwise send a
                warehouse account to /warehouse and drop the sheet it was
                linked to. RequireWarehouse at the destination checks them. */}
            <Route path="/dashboard/intake" element={<MovedToWarehouse page="intake" />} />
            <Route path="/dashboard/scan" element={<MovedToWarehouse page="scan" />} />
            {/* The back office. One guard on the parent covers every child
                route, and the layout supplies the shell they all sit in.
                Kept off /admin, which belongs to Django's own admin site. */}
            <Route
              path="/dashboard"
              element={
                <RequireStaff>
                  <DashboardLayout />
                </RequireStaff>
              }
            >
              <Route index element={<Overview />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="messages" element={<Messages />} />
              <Route path="packages" element={<Packages />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/new" element={<InvoiceEditor />} />
              <Route path="invoices/:id/edit" element={<InvoiceEditor />} />
              <Route path="invoices/settings" element={<InvoiceSettingsPage />} />
              <Route path="documents" element={<Documents />} />
              <Route path="measurements" element={<MeasurementsList />} />
              <Route path="customers" element={<Customers />} />
              <Route path="workers" element={<Workers />} />
              {/* What warehouse workers may see; admins change it. */}
              <Route path="warehouse-access" element={<WarehouseAccess />} />
              {/* Shared floor devices, PIN sign-ins: admins. */}
              <Route path="floor-devices" element={<FloorDevices />} />
              <Route path="shops" element={<Shops />} />
              <Route path="courier-tracking" element={<CourierTrackingPage />} />
              <Route path="prealerts" element={<PreAlertsPage />} />
              <Route path="blog" element={<DashboardBlog />} />
              <Route path="security" element={<Security />} />
              {/* Which pages of the public site are on (admins). */}
              <Route path="website" element={<WebsiteSettings />} />
              {/* How one month went (Reports.jsx); backups and error monitoring (admins). */}
              <Route path="reports" element={<Reports />} />
              <Route path="system" element={<SystemStatus />} />
              {/* Documents read by AI, and the queue a person checks. */}
              <Route path="document-review" element={<DocumentReview />} />
            </Route>

            {/* The warehouse dashboard: warehouse workers, and office staff
                who need it. Drivers and customers are sent away here and
                refused by every API route behind it. */}
            {/* The warehouse's own sign-in page: e-mail (or a tapped name on a
                registered device) and PIN. Outside RequireWarehouse - it is
                where RequireWarehouse sends people who are not signed in. */}
            <Route path="/warehouse/login" element={<WarehouseLogin />} />

            <Route
              path="/warehouse"
              element={
                <RequireWarehouse>
                  <WarehouseLayout />
                </RequireWarehouse>
              }
            >
              {/* The warehouse is two buttons and a list (WarehouseHome);
                  measuring, packing, damage and history happen on each
                  package's own page. The old section addresses - in
                  bookmarks and the office dashboard - go to the home page. */}
              <Route index element={<WarehouseHome />} />
              <Route path="scan" element={<Scan />} />
              <Route path="packages" element={<Navigate to="/warehouse" replace />} />
              <Route path="packages/:id" element={<PackagePage />} />
              <Route path="measurements" element={<Navigate to="/warehouse" replace />} />
              {/* The camera-measuring prototype (PackageMeasurement.jsx) is
                  switched off until it measures for real - see
                  src/measurement/README.md for how to bring it back. */}
              <Route path="packaging" element={<Navigate to="/warehouse" replace />} />
              <Route path="damage" element={<Navigate to="/warehouse" replace />} />
              <Route path="activity" element={<Navigate to="/warehouse" replace />} />
              <Route path="profile" element={<WarehouseProfile />} />
              <Route path="pin" element={<SetPinPage />} />
              {/* Warehouse management: admins and warehouse managers only
                  (ManagerLayout checks; the server refuses everyone else).
                  The Workers tab is the same page as /dashboard/workers. */}
              <Route path="manager" element={<ManagerLayout />}>
                <Route index element={<ManagerOverview />} />
                <Route path="workers" element={<Workers />} />
                <Route path="activity" element={<ManagerActivity />} />
              </Route>
              <Route path="intake" element={<Intake />} />
              <Route path="shipments" element={<MovedToPackages />} />
              <Route path="shipments/:id" element={<MovedToPackages />} />
            </Route>

            {/* The label prints without the warehouse shell around it. */}
            <Route
              path="/warehouse/shipments/:id/label"
              element={
                <RequireWarehouse>
                  <ShipmentLabel />
                </RequireWarehouse>
              }
            />

            <Route
              path="/driver"
              element={
                <RequireDriver>
                  <DriverPage />
                </RequireDriver>
              }
            />

            <Route path="/destinations" element={<Destinations />} />
            <Route path="/destinations/:slug" element={<Destination />} />
            {/* Catch-all: an unknown URL gets a real page, not a blank one. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* "Confirm it's you" before sensitive admin actions: drawn only
              when the server asks (api/client.js setReauthHandler). */}
          <ReauthDialog />
        </Suspense>
      </ErrorBoundary>
      {!isDashboard && <Footer />}
      {/* Outside the routes: the rail stays put while pages change. The
          dashboard is English-only, so the switcher has nothing to offer
          there. */}
      {!isDashboard && <LanguageSwitcher />}
      {/* The robot in the corner: explains whatever page is showing, and
          holds the "Help" list (restart the tour, shipping info, ...). Off
          the staff screens for the same reason the switcher is: those are an
          application, and their own onboarding is a different job. */}
      {/* Keyed on the path: a new page gets a fresh guide, closed, with the
          previous page's narration stopped as the old one unmounts. */}
      {!isDashboard && <PageGuide key={pathname} />}
      </ChatProvider>
      </NotificationsProvider>
    </TutorialProvider>
  );
}
