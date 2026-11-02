// src/pages/Dashboard/DashboardLayout.jsx
//
// The office dashboard's shell: a dark navy sidebar holding the brand, the
// sections and the signed-in account, and a light top bar with search. The
// page itself sits on a pale ground to the right.
//
// On tablets and phones the sidebar slides in over the page from a menu
// button in the top bar.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/* (the shell around every office page)
//   Who can open: office staff (RequireStaff in App.jsx)
//   Links to:     every /dashboard/... page, /warehouse, /warehouse/intake, /warehouse/scan, / (the
//                 site), /admin/ (Django admin)
//   Linked from:  the Header account menu ("Dashboard"), Profile, the warehouse top bar ("Office"),
//                 Driver
//   Backend:      api/staff.js

import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getOverview, lookupWarehouseShipment } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { MANAGER_HOME, isManagerOnly, mayOpen } from './managerAccess';
import { usePageText } from './usePageText';
import AccountMenu from '../../components/AccountMenu/AccountMenu';
import LanguageMenu from '../../components/LanguageSwitcher/LanguageMenu';
import { tourForPath } from '../../components/Tutorial/tutorialSteps';
import { useTutorial } from '../../components/Tutorial/useTutorial';
import { useLanguage } from '../../i18n/useLanguage';
import StaffAlerts from './StaffAlerts';
import { CountPill } from './ui';
import { useSidebarWidth } from './useSidebarWidth';
import {
  BookmarkIcon,
  BoxIcon,
  ChartIcon,
  FileIcon,
  GearIcon,
  GlobeIcon,
  HelpIcon,
  HouseIcon,
  MailIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  SignOutIcon,
  UsersIcon,
} from './icons';
import styles from './Dashboard.module.css';

// Grouped by the job somebody opens the dashboard to do. `tour` names the
// group for the dashboard tour, which highlights it as data-tour="db-nav-<tour>"
// (see the "dashboard" tour in components/Tutorial/tutorialSteps.js).
const GROUPS = [
  {
    heading: null,
    tour: 'overview',
    links: [
      { to: '/dashboard', labelKey: 'dashboard.office.nav.overview', icon: HouseIcon, end: true },
      // How one month went, compared with the month before - see Reports.jsx.
      { to: '/dashboard/reports', labelKey: 'dashboard.office.nav.reports', icon: ChartIcon },
    ],
  },
  {
    heading: 'dashboard.office.groups.sales',
    tour: 'sales',
    links: [
      { to: '/dashboard/quotes', labelKey: 'dashboard.office.nav.quotes', icon: FileIcon, pill: (o) => o?.quotes.new },
      { to: '/dashboard/bookings', labelKey: 'dashboard.office.nav.bookings', icon: BookmarkIcon, pill: (o) => o?.bookings?.new },
      { to: '/dashboard/messages', labelKey: 'dashboard.office.nav.messages', icon: MailIcon, pill: (o) => o?.messages.unhandled },
    ],
  },
  {
    heading: 'dashboard.office.groups.shipments',
    tour: 'shipments',
    links: [
      { to: '/dashboard/packages', labelKey: 'dashboard.office.nav.packages', icon: BoxIcon, pill: (o) => o?.packages.awaiting_action },
      { to: '/dashboard/measurements', labelKey: 'dashboard.office.nav.measurements', icon: BoxIcon },
      // Webshop orders on their way to us, followed with the courier - see
      // CourierTracking.jsx.
      // Parcels customers told us are coming - see PreAlerts.jsx.
      { to: '/dashboard/prealerts', labelKey: 'dashboard.office.nav.prealerts', icon: BoxIcon },
      { to: '/dashboard/courier-tracking', labelKey: 'dashboard.office.nav.courierTracking', icon: GlobeIcon },
    ],
  },
  {
    heading: 'dashboard.office.groups.billing',
    tour: 'billing',
    links: [
      {
        to: '/dashboard/invoices',
        labelKey: 'dashboard.office.nav.invoices',
        icon: ReceiptIcon,
        pill: (o) => o?.invoices?.pending_review,
      },
      {
        to: '/dashboard/documents',
        labelKey: 'dashboard.office.nav.documents',
        icon: FileIcon,
        pill: (o) => o?.documents?.unattached,
      },
      // Documents read by AI and matched to our records; the uncertain ones
      // wait here for a person - see DocumentReview.jsx.
      {
        to: '/dashboard/document-review',
        labelKey: 'dashboard.office.nav.documentReview',
        icon: FileIcon,
        pill: (o) => o?.document_review?.needs_review,
      },
    ],
  },
  {
    heading: 'dashboard.office.groups.people',
    tour: 'people',
    links: [
      { to: '/dashboard/customers', labelKey: 'dashboard.office.nav.customers', icon: UsersIcon },
      // The colleagues, kept off the customer list: same rows, different
      // question - see Workers.jsx.
      { to: '/dashboard/workers', labelKey: 'dashboard.office.nav.workers', icon: UsersIcon },
      // What warehouse workers may see in their app (admins change it).
      { to: '/dashboard/warehouse-access', labelKey: 'dashboard.office.nav.warehouseAccess', icon: BoxIcon },
      // Shared floor devices that may sign a worker in with a PIN, and who
      // signed in where (admins; the page says so to anybody else).
      { to: '/dashboard/floor-devices', labelKey: 'dashboard.office.nav.floorDevices', icon: BoxIcon },
    ],
  },
  {
    heading: 'dashboard.office.groups.website',
    tour: 'website',
    links: [
      // The webshops the services page lists. Editing them used to mean a
      // code change and a deploy; they are rows now - see Shops.jsx.
      { to: '/dashboard/shops', labelKey: 'dashboard.office.nav.shops', icon: BoxIcon },
      // The blog's posts: written and published here - see Blog.jsx.
      { to: '/dashboard/blog', labelKey: 'dashboard.office.nav.blog', icon: FileIcon },
      // Which pages of the public site are on (the Calculator). Admins only -
      // see WebsiteSettings.jsx.
      { to: '/dashboard/website', labelKey: 'dashboard.office.nav.website', icon: GearIcon, adminOnly: true },
      // Two-factor sign-in: off, optional or required. Admins only - see Security.jsx.
      { to: '/dashboard/security', labelKey: 'dashboard.office.nav.security', icon: GearIcon, adminOnly: true },
      // Backups, error monitoring and e-mail at a glance. Admins only - see
      // SystemStatus.jsx.
      { to: '/dashboard/system', labelKey: 'dashboard.office.nav.system', icon: ShieldIcon, adminOnly: true },
    ],
  },
  {
    heading: 'dashboard.office.groups.warehouse',
    tour: 'warehouse',
    // The warehouse has its own dashboard and shell; these leave this one.
    links: [
      { to: '/warehouse', labelKey: 'dashboard.office.nav.warehouseDashboard', icon: HouseIcon, end: true },
      { to: '/warehouse/scan', labelKey: 'dashboard.office.nav.scan', icon: BoxIcon },
      { to: '/warehouse/intake', labelKey: 'dashboard.office.nav.intake', icon: FileIcon },
    ],
  },
];

// Which list a search from the top bar lands in. On any other page, packages:
// the biggest table, and the one a tracking number belongs to.
const SEARCHABLE = [
  '/dashboard/quotes',
  '/dashboard/workers',
  '/dashboard/messages',
  '/dashboard/packages',
  '/dashboard/customers',
  '/dashboard/bookings',
  '/dashboard/measurements',
];
const DEFAULT_SEARCH_TARGET = '/dashboard/packages';

// Remembers, in this browser, that the dashboard tour has opened by itself
// once. The "Guide" button opens it again whenever somebody wants.
const TOUR_SEEN_KEY = 'plsm.dashboardTourSeen';
const TOUR_DELAY_MS = 1200;

function tourSeen() {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === 'true';
  } catch {
    // Storage blocked (private window): treat it as seen, rather than
    // opening the tour on every visit.
    return true;
  }
}

function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    // Nothing to do; see tourSeen.
  }
}

function initialsOf(user) {
  const source = user?.name?.trim() || user?.email || '?';
  return (
    source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

function NavItem({ link, overview, onNavigate }) {
  const { t } = useLanguage();
  const { to, labelKey, icon: Icon, end, pill } = link;

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink)}
    >
      <Icon />
      <span className={styles.navLabel}>{t(labelKey)}</span>
      <CountPill value={pill?.(overview)} />
    </NavLink>
  );
}

/**
 * The overview request lives here rather than on the Overview page because
 * the sidebar's count pills need the same numbers. It is re-fetched on each
 * page change, which keeps a pill honest after somebody handles a message.
 */
export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // A warehouse manager: the floor's pages only (managerAccess.js). The
  // office overview is not theirs, so its counts are not fetched either.
  const managerOnly = isManagerOnly(user);
  const workersText = usePageText('workers');
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter(
      (link) =>
        (!link.adminOnly || user?.isAdmin) && (link.to.startsWith('/warehouse') || mayOpen(user, link.to)),
    ),
  })).filter((group) => group.links.length > 0);

  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(30);
  const [navOpen, setNavOpen] = useState(false);
  const { width: sidebarWidth, resizing, handleProps } = useSidebarWidth();
  const { start: startTour } = useTutorial();

  // The dashboard tour (tutorialSteps.js, "dashboard"): by itself once, the
  // first time this browser opens the dashboard's Overview, after a moment so
  // the sidebar it points at has drawn.
  useEffect(() => {
    if (pathname !== '/dashboard' || tourSeen()) return undefined;
    const timer = window.setTimeout(() => {
      markTourSeen();
      startTour(undefined, 'dashboard');
    }, TOUR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, startTour]);

  /**
   * "Guide": the tour of the page you are on when it has one of its own
   * (Customers), otherwise the tour of the whole dashboard.
   */
  function openGuide() {
    setNavOpen(false);
    const pageTour = tourForPath(pathname);
    startTour(undefined, pageTour.startsWith('dashboard') ? pageTour : 'dashboard');
  }

  const key = `${pathname}#${days}#${attempt}`;
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    if (managerOnly) return undefined;

    getOverview(days)
      .then((data) => {
        if (!cancelled) setAnswer({ key, status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
    // `key` already encodes the path, the range and the retry counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const state = managerOnly ? 'ready' : answer.key === key ? answer.status : 'loading';
  // The previous numbers are kept while a refetch is in flight, so the pills
  // hold steady instead of blinking out on every page change.
  const overview = answer.data;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const closeNav = () => setNavOpen(false);

  async function handleSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    closeNav();

    // A handheld scanner types a whole code and presses Enter. When that code
    // is exactly a package's tracking number, open that package with its
    // history showing instead of a list of partial matches.
    if (managerOnly) {
      // Their one searchable list: the warehouse workers.
      navigate(`${MANAGER_HOME}?search=${encodeURIComponent(term)}`);
      return;
    }

    if (!/\s/.test(term)) {
      try {
        const found = await lookupWarehouseShipment(term);
        setQuery('');
        navigate(
          `/dashboard/packages?search=${encodeURIComponent(found.tracking_number)}&open=${found.id}`,
        );
        return;
      } catch {
        // No exact match (or no connection): an ordinary search below.
      }
    }

    const target = SEARCHABLE.includes(pathname) ? pathname : DEFAULT_SEARCH_TARGET;
    navigate(`${target}?search=${encodeURIComponent(term)}`);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div
      className={resizing ? `${styles.app} ${styles.resizing}` : styles.app}
      // Only the chosen width is set inline; the stylesheet derives
      // --sidebar-width from it so a media query can still collapse it.
      style={{ '--sidebar-user-width': `${sidebarWidth}px` }}
    >
      <nav
        id="dashboard-nav"
        className={navOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
        aria-label={t('dashboard.office.sectionsLabel')}
      >
        <Link to={managerOnly ? MANAGER_HOME : '/dashboard'} className={styles.brand} onClick={closeNav}>
          <span className={styles.brandText}>
            PayLesShopMore<span className={styles.brandDot}>.com</span>
            <span className={styles.brandSub}>{t('dashboard.office.brandSub')}</span>
          </span>
        </Link>

        <div className={styles.navScroll}>
          {groups.map((group) => (
            <div
              key={group.heading ?? 'top'}
              className={styles.navGroup}
              data-tour={`db-nav-${group.tour}`}
            >
              {group.heading && <p className={styles.navHeading}>{t(group.heading)}</p>}
              <ul className={styles.navList}>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavItem link={link} overview={overview} onNavigate={closeNav} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.navFoot} data-tour="db-foot">
          <div className={styles.account}>
            <span className={styles.avatar} aria-hidden="true">
              {initialsOf(user)}
            </span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{user?.name?.trim() || user?.email}</span>
              <span className={styles.accountRole}>{t(`dashboard.roles.${user?.role ?? 'customer'}`)}</span>
            </span>
          </div>
          {/* One row each, with an icon, like the menu above. */}
          <div className={styles.navFootLinks}>
            {/* Django's admin needs is_staff, which a warehouse manager has not. */}
            {!managerOnly && (
              <a className={styles.navFootLink} href="/admin/" target="_blank" rel="noreferrer">
                <GearIcon />
                <span>{t('dashboard.office.djangoAdmin')}</span>
              </a>
            )}
            <Link className={styles.navFootLink} to="/" onClick={closeNav}>
              <GlobeIcon />
              <span>{t('dashboard.office.backToSite')}</span>
            </Link>
            {/* The top bar hides Sign out on phones; this is where it is then. */}
            <button
              type="button"
              className={`${styles.navFootLink} ${styles.navFootButton}`}
              onClick={handleSignOut}
            >
              <SignOutIcon />
              <span>{t('dashboard.office.signOut')}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* The divider between sidebar and page; drag to resize. Hidden on
          narrow screens, where the sidebar is an overlay. */}
      <div className={styles.resizer} {...handleProps} />

      {navOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label={t('dashboard.office.closeMenu')}
          tabIndex={-1}
          onClick={closeNav}
        />
      )}

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.navToggle}
            aria-expanded={navOpen}
            aria-controls="dashboard-nav"
            aria-label={t(navOpen ? 'dashboard.office.closeMenu' : 'dashboard.office.openMenu')}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className={styles.navToggleBars} aria-hidden="true" />
          </button>

          <Link to="/dashboard" className={styles.topBrand}>
            PayLesShopMore
          </Link>

          <form
            className={styles.searchForm}
            onSubmit={handleSearch}
            role="search"
            data-tour="db-search"
          >
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              type="search"
              className={styles.topSearch}
              placeholder={managerOnly ? workersText('searchPlaceholder') : t('dashboard.office.searchPlaceholder')}
              aria-label={t('dashboard.office.searchLabel')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>

          {/* Hidden on phones; the account menu carries the same link. */}
          <div className={styles.topRight}>
            <Link to="/warehouse" className={styles.topLink}>
              {t('dashboard.office.warehouse')}
            </Link>
          </div>

          {/* The dashboard tour, again - outside topRight so it stays on
              phones too. data-tour: the tour's last step points here. */}
          <button
            type="button"
            className={`${styles.topLink} ${styles.guideButton}`}
            onClick={openGuide}
            data-tour="db-help"
          >
            <HelpIcon />
            <span>{t('dashboard.office.guide')}</span>
          </button>

          <LanguageMenu />

          <AccountMenu
            links={[
              // Admins: "Profile" is the customer page, to see the site as a
              // customer does. Other staff: their warehouse profile.
              {
                to: user?.isAdmin ? '/profile' : '/warehouse/profile',
                label: t('dashboard.warehouse.nav.profile'),
              },
              { to: '/warehouse', label: t('dashboard.office.nav.warehouseDashboard') },
            ]}
            signOutLabel={t('dashboard.office.signOut')}
            onSignOut={handleSignOut}
          />
        </header>

        <main className={styles.main}>
          {/* Keyed by the query string: the list pages read ?search= and
              friends when they mount, so a search from the top bar while
              already on that page has to start the page afresh. */}
          <Outlet key={search} context={{ overview, state, reload, days, setDays }} />
        </main>

        {/* Pop-ups for a new contact message or booking (StaffAlerts.jsx).
            Not for a warehouse manager: those pages are not theirs. When
            something new comes in, `reload` refreshes the sidebar pills too. */}
        {!managerOnly && user?.id && <StaffAlerts key={user.id} userId={user.id} onNew={reload} />}
      </div>
    </div>
  );
}
