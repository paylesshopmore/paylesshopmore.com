// src/pages/Warehouse/WarehouseLayout.jsx
//
// The warehouse dashboard's shell. Separate from the office's DashboardLayout
// at the UI level: different navigation, no office sections, and a guard
// (RequireWarehouse) that only lets warehouse and office accounts in. The
// server checks the same thing on every request.
//
// Four places, kept simple: Home (Scan, New intake sheet, the packages in
// the warehouse - WarehouseHome.jsx), Scan, Intake sheets and Profile. Measuring,
// packing, damage and a package's history happen on the package's own page.
//
// Wide screens (tablets in landscape, warehouse PCs) get a sidebar of large
// targets. Phones and portrait tablets get a bottom bar with Home, Scan and
// Intake sheets, and a "More" sheet for the rest.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/* (the shell around every warehouse page)
//   Who can open: warehouse workers and office staff (RequireWarehouse in App.jsx)
//   Links to:     /warehouse, /warehouse/scan, /warehouse/intake, /warehouse/profile, / (the site),
//                 /dashboard (office)
//   Linked from:  the Header account menu ("Warehouse"), Profile, the dashboard sidebar, Log in
//                 (code or PIN)
//   Backend:      api/warehouse.js (what this account may use)

import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getWarehouseAccess } from '../../api/warehouse';
import { WarehouseAccessContext } from './accessContext';
import { useAuth } from '../../auth/useAuth';
import LanguageMenu from '../../components/LanguageSwitcher/LanguageMenu';
import { useLanguage } from '../../i18n/useLanguage';
import dashboard from '../Dashboard/Dashboard.module.css';
import AccountMenu from '../../components/AccountMenu/AccountMenu';
import { tourForPath } from '../../components/Tutorial/tutorialSteps';
import { useTutorial } from '../../components/Tutorial/useTutorial';
import { AlertIcon, ClockIcon, HelpIcon, HomeIcon, LogOutIcon, MenuIcon, ScanIcon, SheetIcon, UserIcon } from './icons';
import { canManageWarehouse } from '../Dashboard/managerAccess';
import styles from './Warehouse.module.css';

const NAV = [
  { to: '/warehouse', labelKey: 'dashboard', icon: HomeIcon, end: true, primary: true },
  { to: '/warehouse/scan', labelKey: 'scan', shortKey: 'scanShort', icon: ScanIcon, primary: true },
  // `section`: an admin can switch it off for warehouse workers
  // (Dashboard -> Warehouse access); it is then left out of the menu.
  { to: '/warehouse/intake', labelKey: 'intake', icon: SheetIcon, section: 'intake', primary: true },
  // Goods nobody has tied to a customer yet (UnassignedQueue.jsx). Part of
  // the intake sheets, so switched off with them.
  { to: '/warehouse/unassigned', labelKey: 'unassigned', icon: AlertIcon, section: 'intake' },
  { to: '/warehouse/profile', labelKey: 'profile', icon: UserIcon },
  // Warehouse management (ManagerLayout): admins and warehouse managers only.
  { to: '/warehouse/manager', labelKey: 'management', icon: ClockIcon, managers: true },
];

/** The switched-off section the current address belongs to, if any. */
function blockedSection(pathname, can) {
  const item = NAV.find(
    (entry) => entry.section && (pathname === entry.to || pathname.startsWith(`${entry.to}/`)),
  );
  return item && !can(item.section) ? item : null;
}

// Remembers, in this browser, that the warehouse tour has opened by itself
// once. The "Guide" button opens it again whenever somebody wants.
const TOUR_SEEN_KEY = 'plsm.warehouseTourSeen';
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

function navClass({ isActive }) {
  return isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem;
}

function NavList({ items, onPick }) {
  const { t } = useLanguage();
  return items.map(({ to, labelKey, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} className={navClass} onClick={onPick}>
      <Icon />
      <span>{t(`dashboard.warehouse.nav.${labelKey}`)}</span>
    </NavLink>
  ));
}

export default function WarehouseLayout() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Closed by its own links (onPick) and by the backdrop.
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const { start: startTour } = useTutorial();

  // The warehouse tour (tutorialSteps.js, "warehouse"): by itself once, the
  // first time this browser opens the warehouse home page, after a moment so
  // the page has drawn what the tour points at.
  useEffect(() => {
    if (pathname !== '/warehouse' || tourSeen()) return undefined;
    const timer = window.setTimeout(() => {
      markTourSeen();
      startTour(undefined, 'warehouse');
    }, TOUR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, startTour]);

  /**
   * "Guide": the tour of the page you are on (a package, the scanner, an
   * intake sheet...). A page without its own tour goes to the home page and
   * shows the warehouse tour there, where its steps point.
   */
  function openGuide() {
    setMoreOpen(false);
    const pageTour = tourForPath(pathname);
    if (pageTour.startsWith('warehouse') && pageTour !== 'warehouse') {
      startTour(undefined, pageTour);
      return;
    }
    if (pathname !== '/warehouse') navigate('/warehouse');
    startTour(undefined, 'warehouse');
  }

  // What this account may use (Dashboard -> Warehouse access). Everything
  // until it has loaded, and if it cannot be loaded: the server still
  // refuses a switched-off section, so failing open only shows a menu item.
  const [mine, setMine] = useState(null);
  useEffect(() => {
    let live = true;
    getWarehouseAccess()
      .then((access) => {
        if (live) setMine(access.mine);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const access = useMemo(() => ({ can: (section) => mine?.[section] ?? true }), [mine]);
  const nav = NAV.filter(
    (item) =>
      (!item.section || access.can(item.section)) && (!item.managers || canManageWarehouse(user)),
  );
  const blocked = blockedSection(pathname, access.can);

  // A warehouse account without the office: somebody on the floor, on a device
  // the next shift will pick up.
  // Not a warehouse manager: they use their own computer, like the office.
  const isFloorOnly = Boolean(user?.isWarehouse && !user?.isStaff && !user?.isWarehouseManager);

  async function handleSignOut() {
    await signOut();
    // The next person to touch a floor device is a colleague about to sign in,
    // so it goes straight to the warehouse's own sign-in page - not the public
    // home page, which is a hunt for the login link with somebody waiting
    // behind them. Office accounts, who use this app from their own computer,
    // still go home.
    navigate(isFloorOnly ? '/warehouse/login' : '/', { replace: true });
  }

  return (
    <div className={`${dashboard.app} ${styles.shell}`}>
      <header className={styles.topbar}>
        <Link to="/warehouse" className={styles.brand}>
          <span className={styles.brandText}>
            <span className={styles.brandName}>
              PayLesShopMore<span className={styles.brandDot}>.com</span>
            </span>
            <span className={styles.brandTag}>{t('dashboard.warehouse.tag')}</span>
          </span>
        </Link>

        <div className={styles.topRight}>
          {/* Back to the public website. Phones hide these pills (no room);
              there it is in the account menu below. */}
          <Link to="/" className={styles.officeLink}>
            {t('dashboard.office.backToSite')}
          </Link>
          {/* Office accounts can switch; warehouse workers have no office. */}
          {user?.isStaff && (
            <Link to="/dashboard" className={styles.officeLink}>
              {t('dashboard.warehouse.office')}
            </Link>
          )}
          {/* A warehouse manager's side of the dashboard: workers, devices,
              access (pages/Dashboard/managerAccess.js). */}
          {!user?.isStaff && user?.isWarehouseManager && (
            <Link to="/dashboard" className={styles.officeLink}>
              {t('dashboard.warehouse.manage')}
            </Link>
          )}
          {/* One tap, always on screen. On a shared device the account menu
              (two taps) and the phone's More sheet (two more) are too slow with
              somebody waiting to take over. Floor accounts only: it is not the
              office's habit, and an office account has no queue behind it. */}
          {isFloorOnly && (
            <button type="button" className={styles.quickLogout} onClick={handleSignOut}>
              <LogOutIcon />
              <span>{t('dashboard.warehouse.signOut')}</span>
            </button>
          )}
          {/* The warehouse tour, again. data-tour: its last step points here. */}
          <button type="button" className={styles.guideButton} onClick={openGuide} data-tour="wh-help">
            <HelpIcon />
            <span>{t('dashboard.warehouse.guide')}</span>
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
              ...(user?.isStaff
                ? [{ to: '/dashboard', label: t('dashboard.warehouse.nav.officeDashboard') }]
                : user?.isWarehouseManager
                  ? [{ to: '/dashboard', label: t('dashboard.warehouse.nav.manage') }]
                  : []),
              { to: '/', label: t('dashboard.office.backToSite') },
            ]}
            signOutLabel={t('dashboard.warehouse.signOut')}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label={t('dashboard.warehouse.sectionsLabel')} data-tour="wh-menu">
          <NavList items={nav} />
        </nav>

        <main className={styles.main}>
          <WarehouseAccessContext.Provider value={access}>
            {/* A switched-off section, opened by its address: said plainly
                rather than showing a page whose every request is refused. */}
            {blocked ? (
              <div className={styles.blocked} role="status">
                <h1 className={styles.blockedTitle}>{t('dashboard.warehouse.blockedTitle')}</h1>
                <p>{t('dashboard.warehouse.blockedText')}</p>
                <Link to="/warehouse" className={styles.blockedLink}>
                  {t('dashboard.warehouse.nav.dashboard')}
                </Link>
              </div>
            ) : (
              <Outlet />
            )}
          </WarehouseAccessContext.Provider>
        </main>
      </div>

      <nav className={styles.bottomTabs} aria-label={t('dashboard.warehouse.sectionsLabel')} data-tour="wh-tabs">
        {nav.filter((item) => item.primary).map(({ to, labelKey, shortKey, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass}>
            <Icon />
            <span>{t(`dashboard.warehouse.nav.${shortKey ?? labelKey}`)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`${styles.navItem} ${moreOpen ? styles.navItemActive : ''}`}
          aria-expanded={moreOpen}
          aria-controls="warehouse-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <MenuIcon />
          <span>{t('dashboard.warehouse.nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <button
            type="button"
            className={styles.moreBackdrop}
            aria-label={t('dashboard.warehouse.closeMenu')}
            onClick={() => setMoreOpen(false)}
          />
          <nav id="warehouse-more" className={styles.moreSheet} aria-label={t('dashboard.warehouse.moreLabel')}>
            <NavList
              items={nav.filter((item) => !item.primary)}
              onPick={() => setMoreOpen(false)}
            />
            {/* The top bar has no room for these on a phone. */}
            {(user?.isStaff || user?.isWarehouseManager) && (
              <Link to="/dashboard" className={styles.navItem}>
                <HomeIcon />
                <span>
                  {t(user?.isStaff ? 'dashboard.warehouse.nav.officeDashboard' : 'dashboard.warehouse.nav.manage')}
                </span>
              </Link>
            )}
            <button
              type="button"
              className={`${styles.navItem} ${styles.moreSignOut}`}
              onClick={handleSignOut}
            >
              <UserIcon />
              <span>{t('dashboard.warehouse.signOut')}</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
