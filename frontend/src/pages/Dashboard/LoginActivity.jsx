// src/pages/Dashboard/LoginActivity.jsx
//
// Dashboard -> Login activity: where people sign in from, and which attempts
// look worrying.
//
// WHAT IS ON THE PAGE (top to bottom)
//   1. Cards    totals counted from the database: attempts, successful, failed,
//               unique users, active sessions, suspicious, countries, last 24 h
//   2. Filters  period, result, country, user and a search box. ONE set of
//               filters drives the cards, the map, the table and the CSV file,
//               so the numbers always describe the same attempts.
//   3. Map      markers (green / red / orange / gray), clusters, heatmap
//   4. Table    every attempt, sortable, paged, with "Mark reviewed" on the
//               suspicious ones, and a CSV export
//
// WHO CAN OPEN IT
//   Office staff and admins (the /dashboard route is behind RequireStaff). The
//   server enforces the same on every request (backend loginactivity/views.py),
//   so hiding the menu item is only tidiness.
//
// WHERE THE DATA COMES FROM
//   Every number and every dot comes from the LoginActivity table, written by
//   the backend each time somebody signs in or fails to. Nothing is made up.
//   The place is approximate - from the IP address only - and the page says so.
//
// AUTOMATIC REFRESH
//   The cards and the map reload every 30 seconds while the page is in view.
//   The table is NOT swapped under your eyes (that would move the row you are
//   reading); instead a bar appears saying there is new activity, with a button
//   that reloads it.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /dashboard/login-activity
//   Who can open: office staff and admins
//   Backend:      api/loginActivity.js

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadLoginActivityCsv,
  getLoginMap,
  getLoginStats,
  listLoginActivity,
  reviewLoginActivity,
} from '../../api/loginActivity';
import { API_ERRORS } from '../../api/client';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { useLanguage } from '../../i18n/useLanguage';
import LoginActivityMap from './LoginActivityMap';
import { MARKER_COLORS } from './loginMapColors';
import { Banner, Empty, Pagination, SearchInput, Toolbar } from './ui';
import styles from './Dashboard.module.css';
import { useCollection } from './useCollection';
import { usePageText } from './usePageText';

// How often the cards and the map reload by themselves.
const REFRESH_MS = 30_000;

const STATUSES = ['success', 'failed'];
const SECURITY = ['normal', 'notice', 'suspicious', 'blocked'];
const FLAGS = [
  'blocked_ip',
  'many_failures_ip',
  'many_failures_account',
  'success_after_failures',
  'many_countries',
  'new_device',
  'new_country',
];
const METHODS = ['password', 'email_code', 'pin', 'email_pin', 'django_admin'];
const CARDS = [
  'total',
  'successful',
  'failed',
  'unique_users',
  'active_sessions',
  'suspicious',
  'unique_countries',
  'last_24h',
];

const START_FILTERS = { period: '30d', status: '', security: '', country: '', user: '', ordering: '-created_at' };

/** A text filter that waits until typing pauses before asking the server. */
function TypedFilter({ label, value, onChange, placeholder }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => onChange(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <label className={styles.filter}>
      <span className={styles.filterLabel}>{label}</span>
      <input
        type="text"
        className={styles.searchInput}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
      />
    </label>
  );
}

/** A group of buttons where exactly one is chosen (period, result). */
function Segments({ label, value, options, onChange }) {
  return (
    <div className={styles.loginSegmentsBox}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.loginSegments} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.loginSegment}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LoginActivity() {
  const d = usePageText('loginActivity');
  const { language } = useLanguage();

  // The table owns the filters; the cards, the map and the export reuse them.
  const list = useCollection(listLoginActivity, START_FILTERS);
  const shared = useMemo(
    () => ({ ...list.filters, search: list.search }),
    [list.filters, list.search],
  );
  const sharedKey = JSON.stringify(shared);

  // ---- cards and map: loaded now, then every 30 seconds --------------------
  const [stats, setStats] = useState({ key: null, status: 'loading', data: null });
  const [map, setMap] = useState({ key: null, status: 'loading', data: null });
  // Goes up every 30 seconds (and on "try again"): the effect below reloads.
  const [tick, setTick] = useState(0);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(true);
  const [notice, setNotice] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      // Nobody is looking at a hidden tab: do not ask the server for it.
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The first load of these filters is a normal request; later ones are the
    // timer's ("background").
    const background = tick > 0;

    function keep(setter, key) {
      return {
        ok: (data) => !cancelled && setter({ key, status: 'ready', data }),
        // A failed refresh keeps showing what was there; only a first load
        // with nothing to show becomes an error.
        fail: () =>
          !cancelled && setter((current) => ({ key, status: current.data ? 'ready' : 'error', data: current.data })),
      };
    }
    const forStats = keep(setStats, sharedKey);
    const forMap = keep(setMap, sharedKey);

    getLoginStats(shared, { background }).then(forStats.ok).catch(forStats.fail);
    getLoginMap(shared, { background }).then(forMap.ok).catch(forMap.fail);

    return () => {
      cancelled = true;
    };
    // `sharedKey` stands for `shared`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedKey, tick]);

  // ---- words for the map's popups ------------------------------------------
  const text = useMemo(() => {
    const when = new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const names = (keys, group) => Object.fromEntries(keys.map((key) => [key, d(`${group}.${key}`)]));
    return {
      username: d('popup.username'),
      country: d('popup.country'),
      city: d('popup.city'),
      ip: d('popup.ip'),
      device: d('popup.device'),
      browser: d('popup.browser'),
      time: d('popup.time'),
      status: d('popup.status'),
      security: d('popup.security'),
      statusName: names(STATUSES, 'statuses'),
      securityName: names(SECURITY, 'securityStatuses'),
      flagName: names(FLAGS, 'flags'),
      unknownTitle: (count) => d('unknownTitle', { count }),
      mapLabel: d('mapLabel'),
      when: (iso) => (iso ? when.format(new Date(iso)) : '—'),
    };
  }, [d, language]);

  // ---- actions ---------------------------------------------------------------
  async function review(row) {
    setReviewingId(row.id);
    setNotice('');
    try {
      list.replaceRow(await reviewLoginActivity(row.id));
    } catch {
      setNotice(d('reviewFailed'));
    } finally {
      setReviewingId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setNotice('');
    try {
      await downloadLoginActivityCsv(shared);
    } catch (problem) {
      // Closing the "confirm it's you" box is a choice, not an error.
      if (problem?.code !== API_ERRORS.REAUTH_CANCELLED) setNotice(d('exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  const reload = useCallback(() => {
    list.reload();
    setTick((n) => n + 1);
  }, [list]);

  // "Show": All / Successful / Failed / Suspicious. Two filters behind one row
  // of buttons, so choosing one clears the other.
  const result = list.filters.security === 'suspicious' ? 'suspicious' : list.filters.status;
  function chooseResult(value) {
    list.setFilter('status', value === 'success' || value === 'failed' ? value : '');
    list.setFilter('security', value === 'suspicious' ? 'suspicious' : '');
  }

  // Sorting: click a heading to sort by it, again to reverse.
  function sortBy(column) {
    const current = list.filters.ordering;
    list.setFilter('ordering', current === column ? `-${column}` : column);
  }
  const sortState = (column) => {
    const current = list.filters.ordering;
    if (current === column) return 'ascending';
    if (current === `-${column}`) return 'descending';
    return 'none';
  };

  const statsData = stats.data;
  // The table and the cards both describe the same filters. When the cards
  // (refreshed on a timer) count more attempts than the table holds, new
  // activity has arrived since the table was loaded.
  const newActivity =
    list.state === 'ready' && stats.key === sharedKey && statsData && statsData.total !== list.count;

  const mapData = map.data;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>{d('title')}</h1>
        <p className={styles.subtitle}>{d('subtitle')}</p>
      </header>

      <Banner tone="error">{notice}</Banner>

      {/* 1. The cards. */}
      {stats.status === 'loading' && <Loading inline />}
      {stats.status === 'error' && <ConnectionError inline onRetry={() => setTick((n) => n + 1)} />}
      {statsData && (
        <section className={styles.stats} aria-label={d('cardsLabel')} aria-busy={stats.key !== sharedKey}>
          {CARDS.map((card) => (
            <div
              key={card}
              className={`${styles.stat} ${card === 'suspicious' && statsData.suspicious > 0 ? styles.loginStatWarn : ''}`}
            >
              <span className={styles.statLabel}>{d(`cards.${card}`)}</span>
              <span className={styles.statValue}>{statsData[card].toLocaleString(language)}</span>
              <span className={styles.statNote}>{d(`cardNotes.${card}`)}</span>
            </div>
          ))}
        </section>
      )}

      {/* 2. The filters. */}
      <Toolbar>
        <Segments
          label={d('period')}
          value={list.filters.period}
          onChange={(value) => list.setFilter('period', value)}
          options={[
            { value: 'today', label: d('periods.today') },
            { value: '7d', label: d('periods.7d') },
            { value: '30d', label: d('periods.30d') },
            { value: '', label: d('periods.all') },
          ]}
        />
        <Segments
          label={d('show')}
          value={result}
          onChange={chooseResult}
          options={[
            { value: '', label: d('results.all') },
            { value: 'success', label: d('results.success') },
            { value: 'failed', label: d('results.failed') },
            { value: 'suspicious', label: d('results.suspicious') },
          ]}
        />
        <TypedFilter
          label={d('countryFilter')}
          value={list.filters.country}
          onChange={(value) => list.setFilter('country', value)}
          placeholder={d('countryPlaceholder')}
        />
        <TypedFilter
          label={d('userFilter')}
          value={list.filters.user}
          onChange={(value) => list.setFilter('user', value)}
          placeholder={d('userPlaceholder')}
        />
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label={d('searchLabel')}
          placeholder={d('searchPlaceholder')}
        />
      </Toolbar>

      {/* 3. The map. */}
      <section className={styles.loginMapSection} aria-label={d('mapLabel')}>
        <div className={styles.loginMapBar}>
          <ul className={styles.loginLegend} aria-label={d('legend')}>
            {[
              ['success', d('legendSuccess')],
              ['failed', d('legendFailed')],
              ['suspicious', d('legendSuspicious')],
              ['unknown', d('legendUnknown')],
            ].map(([key, label]) => (
              <li key={key}>
                <span className={styles.loginDot} style={{ background: MARKER_COLORS[key] }} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
          <div className={styles.loginToggles}>
            <label>
              <input type="checkbox" checked={showMarkers} onChange={(event) => setShowMarkers(event.target.checked)} />{' '}
              {d('showMarkers')}
            </label>
            <label>
              <input type="checkbox" checked={showHeat} onChange={(event) => setShowHeat(event.target.checked)} />{' '}
              {d('showHeat')}
            </label>
          </div>
        </div>

        {map.status === 'error' ? (
          <ConnectionError inline onRetry={() => setTick((n) => n + 1)} />
        ) : (
          <div className={styles.loginMapFrame}>
            <LoginActivityMap
              data={mapData}
              showMarkers={showMarkers}
              showHeat={showHeat}
              text={text}
              onError={() => setNotice(d('mapFailed'))}
            />
            {map.status === 'loading' && <p className={styles.loginMapLoading}>{d('mapLoading')}</p>}
          </div>
        )}

        <p className={styles.mutedCell}>{d('mapNote')}</p>
        {mapData?.truncated && <p className={styles.mutedCell}>{d('mapTruncated')}</p>}
        {mapData && mapData.points.length === 0 && mapData.unknown.count === 0 && map.status === 'ready' && (
          <p className={styles.mutedCell}>{d('mapEmpty')}</p>
        )}
      </section>

      {/* 4. The table. */}
      <div className={styles.loginTableBar}>
        <h2 className={styles.loginTableTitle}>{d('tableTitle')}</h2>
        <button type="button" className={styles.rowButton} onClick={exportCsv} disabled={exporting}>
          {exporting ? d('exporting') : d('export')}
        </button>
      </div>

      {newActivity && (
        <p className={styles.loginNewBar} role="status">
          {d('newActivity')}{' '}
          <button type="button" className={styles.linkButton} onClick={reload}>
            {d('refresh')}
          </button>
        </p>
      )}

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>{d('noMatch')}</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {[
                    ['identifier', 'colUser'],
                    ['ip_address', 'colIp'],
                    ['country', 'colCountry'],
                    ['city', 'colCity'],
                    [null, 'colDevice'],
                    ['browser', 'colBrowser'],
                    ['created_at', 'colDate'],
                    ['status', 'colStatus'],
                    ['security_status', 'colSecurity'],
                  ].map(([column, label]) => (
                    <th key={label} scope="col" aria-sort={column ? sortState(column) : undefined}>
                      {column ? (
                        <button type="button" className={styles.loginSortButton} onClick={() => sortBy(column)}>
                          {d(label)}
                          <span aria-hidden="true">
                            {sortState(column) === 'ascending' ? ' ▲' : sortState(column) === 'descending' ? ' ▼' : ''}
                          </span>
                        </button>
                      ) : (
                        d(label)
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {/* Plain text: a failed attempt's name is whatever a stranger typed. */}
                      <div className={styles.primaryCell}>{row.identifier || d('unknownUser')}</div>
                      <div className={styles.mutedCell}>{METHODS.includes(row.method) ? d(`methods.${row.method}`) : row.method}</div>
                    </td>
                    <td>{row.ip_address || '—'}</td>
                    <td>{row.country || d('unknownPlace')}</td>
                    <td>{[row.city, row.region].filter(Boolean).join(', ') || '—'}</td>
                    <td>{row.device || '—'}</td>
                    <td>{row.browser || '—'}</td>
                    <td>{text.when(row.created_at)}</td>
                    <td>
                      <span className={styles.loginBadge} data-tone={row.status}>
                        {d(`statuses.${row.status}`)}
                      </span>
                    </td>
                    <td>
                      <span className={styles.loginBadge} data-tone={row.security_status}>
                        {d(`securityStatuses.${row.security_status}`)}
                      </span>
                      {row.flags.length > 0 && (
                        <ul className={styles.loginFlags}>
                          {row.flags.map((flag) => (
                            <li key={flag}>{FLAGS.includes(flag) ? d(`flags.${flag}`) : flag}</li>
                          ))}
                        </ul>
                      )}
                      {/* A suspicious attempt waits for somebody to look at it. */}
                      {(row.security_status === 'suspicious' || row.security_status === 'blocked') &&
                        (row.reviewed_at ? (
                          <div className={styles.mutedCell}>
                            {d('reviewedBy', { name: row.reviewed_by_name || '—', when: text.when(row.reviewed_at) })}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={styles.rowButton}
                            disabled={reviewingId === row.id}
                            onClick={() => review(row)}
                          >
                            {d('markReviewed')}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />

      {statsData && (
        <p className={styles.mutedCell}>{d('privacyNote', { days: statsData.retention_days })}</p>
      )}
    </>
  );
}
