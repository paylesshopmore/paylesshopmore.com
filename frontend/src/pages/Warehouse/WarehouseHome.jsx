// src/pages/Warehouse/WarehouseHome.jsx
//
// The warehouse home page, laid out for a tablet on the floor and a PC at the
// counter:
//
//   1. A greeting, today's date, and when the numbers were last refreshed.
//   2. The two things a worker comes here to do, as two big buttons:
//        Scan Package      -> the scanner; a scanned box opens its own page.
//        New intake sheet  -> a blank intake form, for goods without a code.
//   3. Four number tiles that are also the list's views (tap one to show it):
//        In the warehouse   everything physically here (received up to ready)
//        Requiring attention  damage, a problem note, or waiting too long
//        Ready to ship      packed and ready to go
//        On the way         new orders the office has sent, not here yet
//   4. The list for the chosen view, with a search box. Searching looks
//      through EVERY package, also one already shipped.
//
// Refreshes itself every minute so a wall-mounted tablet keeps up. Those
// refreshes go as background requests, which do not keep a shared floor
// device signed in as the last worker (see WarehouseHome.test.jsx).
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse (the old /warehouse/packages, /measurements, /packaging, /damage and
//                 /activity redirect here)
//   Who can open: warehouse workers and office staff
//   Links to:     /warehouse/scan, /warehouse/intake (New intake sheet), /warehouse/packages/:id
//                 (each package)
//   Linked from:  the warehouse menu "Home", Package page ("Back"), Set PIN, Log in, the office
//                 Overview
//   Backend:      api/staff.js

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createIntakeSheet, listWarehouseShipments } from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { useWarehouseAccess } from './accessContext';
import { AlertIcon, ClockIcon, PackageIcon, ScanIcon, SheetIcon } from './icons';
import { Message } from './opsUi';
import StagePill from './StagePill';
import { waitedFor } from './waited';
import styles from './Home.module.css';

const REFRESH_MS = 60_000;
const PAGE_SIZE = 50;
// Physically in the warehouse: arrived, not yet gone. (Not "expected" - it
// is not here yet - and not "shipped".)
const IN_WAREHOUSE = 'received,awaiting_measurement,measured,awaiting_packaging,packed,ready';
// On its way in: a new order the office has given a shipping number (or one
// that has been paid), not here yet. Opened when it arrives, to mark it received.
const EXPECTED = 'awaiting_pickup';

/**
 * The four views of the list. `filters` is what the server is asked for;
 * the same filters with page_size 1 give the number on the tile.
 * `tone` colours a tile whose number is worth noticing when it is not 0.
 */
const VIEWS = [
  { key: 'all', filters: { stage: IN_WAREHOUSE }, icon: PackageIcon },
  { key: 'attention', filters: { stage: IN_WAREHOUSE, attention: 'true' }, icon: AlertIcon, tone: 'warn' },
  { key: 'ready', filters: { stage: 'ready' }, icon: PackageIcon, tone: 'good' },
  { key: 'expected', filters: { stage: EXPECTED }, icon: ClockIcon },
];

/** Why a package is flagged, as short labels (there can be more than one). */
function reasonsFor(row, t) {
  const reasons = [];
  if (row.has_open_damage) reasons.push({ tone: 'bad', text: t('dashboard.warehouse.home.reasons.damage') });
  if (row.has_problem) {
    reasons.push({
      tone: 'warn',
      text: fill(t('dashboard.warehouse.home.reasons.problem'), { note: row.problem_note }),
    });
  }
  if (row.overdue) reasons.push({ tone: 'warn', text: t('dashboard.warehouse.home.reasons.overdue') });
  return reasons;
}

/** One package as a row: number, customer, place, how long it has waited, stage. */
function PackageRow({ row, t }) {
  const reasons = reasonsFor(row, t);
  return (
    <li>
      <Link to={`/warehouse/packages/${row.id}`} className={styles.row}>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{row.tracking_number}</span>
          <span className={styles.rowDetail}>
            {[
              row.customer,
              row.warehouse_location,
              row.warehouse_stage_at &&
                fill(t('dashboard.flow.queue.waiting'), { time: waitedFor(row.warehouse_stage_at) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {reasons.length > 0 && (
            <span className={styles.flags}>
              {reasons.map((reason) => (
                <span key={reason.text} className={`${styles.flag} ${styles[`flag_${reason.tone}`]}`}>
                  {reason.text}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className={styles.rowSide}>
          <StagePill stage={row.warehouse_stage} label={t(`dashboard.flow.stages.${row.warehouse_stage}`)} />
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </span>
      </Link>
    </li>
  );
}

/** "Updated 11:42", in the page's language. */
function clock(date, language) {
  return new Intl.DateTimeFormat(language === 'pap' ? 'nl' : language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function WarehouseHome() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { can } = useWarehouseAccess();
  const h = (key, values) => {
    const text = t(`dashboard.warehouse.home.${key}`);
    return values ? fill(text, values) : text;
  };

  // Which view of the list, and the search. `search` is what is typed;
  // `query` the same after a short pause, so the server is not asked once
  // per key.
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // `timed`: this fetch is the minute's refresh, not somebody doing something.
  const [attempt, setAttempt] = useState({ n: 0, timed: false });
  // The latest list, labelled with the view or search it answers (`key`).
  // While it answers something else, the page shows "loading" rather than
  // the old view's rows under the new view's heading.
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null, at: null });
  // The number on each tile, by view key. Missing until loaded.
  const [counts, setCounts] = useState({});

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // The list for the chosen view (or the search).
  const listKey = query ? `search:${query}` : view;

  useEffect(() => {
    let cancelled = false;
    const chosen = VIEWS.find((item) => item.key === view);
    const filters = {
      page_size: PAGE_SIZE,
      // Searching looks through every package; a view only at its own part.
      ...(query ? { search: query } : chosen.filters),
    };

    listWarehouseShipments(filters, { background: attempt.timed })
      .then((page) => {
        if (!cancelled) setAnswer({ key: listKey, status: 'ready', data: page, at: new Date() });
      })
      .catch(() => {
        // Keep the last good list on a failed refresh of the same view.
        if (!cancelled) {
          setAnswer((previous) =>
            previous.key === listKey ? { ...previous, status: 'error' } : { key: listKey, status: 'error', data: null, at: null },
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, query, view, listKey]);

  // The numbers on the tiles: one small request each (page_size 1, only the
  // count is read). A failed one keeps the number it had.
  useEffect(() => {
    let cancelled = false;
    VIEWS.forEach((item) => {
      listWarehouseShipments({ page_size: 1, ...item.filters }, { background: attempt.timed })
        .then((page) => {
          if (!cancelled) setCounts((previous) => ({ ...previous, [item.key]: page.count }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const timer = setInterval(() => setAttempt(({ n }) => ({ n: n + 1, timed: true })), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const reload = () => setAttempt(({ n }) => ({ n: n + 1, timed: false }));

  // "New intake sheet": a blank sheet, opened straight away.
  async function startSheet() {
    setStarting(true);
    setStartError('');
    try {
      const sheet = await createIntakeSheet();
      navigate(`/warehouse/intake?sheet=${sheet.id}`);
    } catch {
      setStartError(h('startError'));
      setStarting(false);
    }
  }

  function chooseView(key) {
    setView(key);
    // A view is a different question from a search: start it clean.
    setSearch('');
    setQuery('');
  }

  const firstName = user?.firstName || user?.name?.trim().split(' ')[0];
  const current = answer.key === listKey;
  const page = current ? answer.data : null;
  const status = current ? answer.status : 'loading';
  const today = new Intl.DateTimeFormat(language === 'pap' ? 'nl' : language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  // The list's heading and its empty sentence, for the view (or the search).
  const listTitle = query ? h('searchResults') : h(`views.${view}`);
  const emptyText = query
    ? t('dashboard.flow.picker.noMatches')
    : {
        all: t('dashboard.flow.list.empty'),
        attention: h('nothingAttention'),
        ready: h('nothingReady'),
        expected: h('nothingExpected'),
      }[view];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>
            {firstName ? h('hello', { name: firstName }) : h('fallbackTitle')}
          </h1>
          <p className={styles.date}>{today}</p>
        </div>
        <div className={styles.freshness}>
          {answer.at && <span>{h('updated', { time: clock(answer.at, language) })}</span>}
          <button type="button" className={styles.refresh} onClick={reload}>
            {h('refresh')}
          </button>
        </div>
      </header>

      {/* The two things a worker comes here to do. */}
      <div className={styles.actions}>
        {/* data-tour: the warehouse tour points at these (tutorialSteps.js). */}
        <Link to="/warehouse/scan" className={`${styles.action} ${styles.actionPrimary}`} data-tour="wh-scan">
          <span className={styles.actionIcon}>
            <ScanIcon />
          </span>
          <span className={styles.actionText}>
            <span className={styles.actionTitle}>{h('scanPackage')}</span>
            <span className={styles.actionHint}>{h('scanHint')}</span>
          </span>
        </Link>
        {can('intake') && (
          <button
            type="button"
            className={styles.action}
            data-tour="wh-new-sheet"
            disabled={starting}
            onClick={startSheet}
          >
            <span className={styles.actionIcon}>
              <SheetIcon />
            </span>
            <span className={styles.actionText}>
              <span className={styles.actionTitle}>{starting ? h('starting') : h('newSheet')}</span>
              <span className={styles.actionHint}>{h('sheetHint')}</span>
            </span>
          </button>
        )}
      </div>
      <Message tone="error">{startError}</Message>

      {/* The numbers, which are also the list's views. */}
      <div className={styles.tiles} role="group" aria-label={t('dashboard.flow.list.show')} data-tour="wh-filters">
        {VIEWS.map(({ key, icon: Icon, tone }) => {
          const count = counts[key];
          const on = view === key && !query;
          const toneClass = tone && count > 0 ? styles[`tile_${tone}`] : '';
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              className={`${styles.tile} ${toneClass} ${on ? styles.tileOn : ''}`}
              onClick={() => chooseView(key)}
            >
              <span className={styles.tileTop}>
                <span className={styles.tileIcon}>
                  <Icon />
                </span>
                <span className={styles.tileLabel}>{h(`views.${key}`)}</span>
              </span>
              <span className={styles.tileValue}>{count ?? '–'}</span>
            </button>
          );
        })}
      </div>

      <section className={styles.card} data-tour="wh-list" aria-labelledby="wh-list-title">
        <div className={styles.cardHead}>
          <h2 id="wh-list-title" className={styles.cardTitle}>
            {listTitle}
            {page ? <span className={styles.cardCount}>{page.count}</span> : null}
          </h2>
          <label className={styles.search}>
            <span className={styles.srOnly}>{t('dashboard.flow.list.search')}</span>
            <input
              type="search"
              className={styles.searchInput}
              value={search}
              autoComplete="off"
              placeholder={t('dashboard.flow.list.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {/* What this view is, when it is not obvious. */}
        {query && <p className={styles.hint}>{h('searchingAll')}</p>}
        {!query && view === 'expected' && <p className={styles.hint}>{h('expectedHint')}</p>}

        {!page && status === 'loading' && <Loading inline />}
        {!page && status === 'error' && <ConnectionError inline onRetry={reload} />}
        {page && status === 'error' && <Message tone="error">{h('refreshError')}</Message>}

        {page &&
          (page.results.length === 0 ? (
            <p className={styles.empty}>{emptyText}</p>
          ) : (
            <>
              <ul className={styles.rows}>
                {page.results.map((row) => (
                  <PackageRow key={row.id} row={row} t={t} />
                ))}
              </ul>
              {page.count > page.results.length && (
                <p className={styles.more}>{h('showingFirst', { shown: page.results.length, count: page.count })}</p>
              )}
            </>
          ))}
      </section>
    </div>
  );
}
