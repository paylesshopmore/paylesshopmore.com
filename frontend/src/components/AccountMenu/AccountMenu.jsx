// src/components/AccountMenu/AccountMenu.jsx
//
// The signed-in person: initials, name and role on a button that opens a
// short menu - the links passed in, then Sign out. Used by the office,
// warehouse and driver dashboards, and by the website's own header.
//
// In the website header (`inSheet`), on phones and tablets the whole account
// block sits inside the ☰ menu sheet; there the menu opens in place, under
// the button, instead of floating over the sheet.

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useDismiss } from '../../hooks/useDismiss';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './AccountMenu.module.css';

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

/**
 * @param {{ links?: { to: string, label: string }[],
 *   actions?: { label: string, onClick: () => void }[], signOutLabel: string,
 *   onSignOut: () => void, onNavigate?: () => void, inSheet?: boolean }} props
 *   actions     extra buttons above Sign out (not links: they do something,
 *               like "Sign in as a worker", which signs out first)
 *   onNavigate  called when any item is chosen, e.g. to close a mobile menu
 *   inSheet     the website header's layout (see the note at the top)
 */
export default function AccountMenu({
  links = [],
  actions = [],
  signOutLabel,
  onSignOut,
  onNavigate,
  inSheet = false,
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapper, open, close);

  // Choosing anything closes this menu, and tells the page (onNavigate).
  function chosen() {
    close();
    onNavigate?.();
  }

  const name = user?.name?.trim() || user?.email;
  const role = t(`dashboard.roles.${user?.role ?? 'customer'}`);

  return (
    <div
      className={inSheet ? `${styles.account} ${styles.inSheet}` : styles.account}
      ref={wrapper}
    >
      <button
        type="button"
        className={styles.accountButton}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('dashboard.warehouse.account')}: ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          {initialsOf(user)}
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountName}>{name}</span>
          <span className={styles.accountRole}>{role}</span>
        </span>
        <span className={styles.accountChevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.accountMenu}>
          <div className={styles.accountMenuHead}>
            <span className={styles.accountMenuName}>{name}</span>
            <span className={styles.accountMenuEmail}>{user?.email}</span>
            <span className={`${styles.accountMenuEmail} ${styles.accountMenuRole}`}>{role}</span>
          </div>
          {links.map((link) => (
            <Link key={link.to} to={link.to} className={styles.accountMenuItem} onClick={chosen}>
              {link.label}
            </Link>
          ))}
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={styles.accountMenuItem}
              onClick={() => {
                chosen();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.accountMenuItem} ${styles.accountMenuSignOut}`}
            onClick={() => {
              chosen();
              onSignOut();
            }}
          >
            {signOutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
