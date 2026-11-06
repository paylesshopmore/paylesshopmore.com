// src/pages/Warehouse/ManagerLayout.jsx
//
// The warehouse manager's area: a title, three tabs (Overview, Workers,
// Activity log) and the page of the tab that is open. It sits inside the
// warehouse app (WarehouseLayout), so the manager keeps the same menu, top
// bar and language as the floor.
//
// WHO GETS IN: admins and warehouse managers (canManageWarehouse). Anybody
// else is sent back to the warehouse home page. That is only so nobody is
// shown a page that cannot work for them - the server refuses every request
// these pages make to anybody else (staff.permissions.IsWarehouseManager),
// which is what actually keeps a warehouse worker out.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/manager, /warehouse/manager/workers,
//                 /warehouse/manager/activity
//   Who can open: admins and warehouse managers
//   Links to:     /dashboard/floor-devices, /dashboard/warehouse-access
//   Linked from:  the warehouse menu ("Management"), the office dashboard

import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { canManageWarehouse } from '../Dashboard/managerAccess';
import { usePageText } from '../Dashboard/usePageText';
import styles from '../Dashboard/Dashboard.module.css';
import own from './Manager.module.css';

const TABS = [
  { to: '/warehouse/manager', key: 'overview', end: true },
  { to: '/warehouse/manager/workers', key: 'workers' },
  { to: '/warehouse/manager/activity', key: 'activity' },
];

export default function ManagerLayout() {
  const { user } = useAuth();
  const m = usePageText('warehouseManager');

  if (!canManageWarehouse(user)) return <Navigate to="/warehouse" replace />;

  return (
    <div className={own.area}>
      <header className={styles.head}>
        <h1 className={styles.title}>{m('title')}</h1>
        <p className={styles.subtitle}>{m('subtitle')}</p>
      </header>

      {/* Big, plain tabs: this is used on iPads on the floor as well. */}
      <nav className={own.tabs} aria-label={m('tabsLabel')}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? `${own.tab} ${own.tabActive}` : own.tab)}
          >
            {m(`tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>

      <Outlet />

      {/* What a manager also runs, in the office dashboard (which they may
          open: pages/Dashboard/managerAccess.js). */}
      <p className={own.footnote}>
        {m('moreSettings')}{' '}
        <Link to="/dashboard/floor-devices" className={styles.link}>
          {m('floorDevices')}
        </Link>
        {' · '}
        <Link to="/dashboard/warehouse-access" className={styles.link}>
          {m('warehouseAccess')}
        </Link>
      </p>
    </div>
  );
}
