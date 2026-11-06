// src/pages/Warehouse/ManagerOverview.jsx
//
// The first tab of warehouse management: how the warehouse is doing right now.
//
//   1. Eight numbers (cards). A number somebody should act on - packages
//      waiting without a customer, unmeasured, with a problem - gets an amber
//      edge while it is above zero, and a green one once it is clear.
//   2. Who is signed in now, by name.
//   3. Today's work per worker (the same daily report the office downloads).
//   4. "Needs attention": the packages behind the amber numbers, each one a
//      tap away from its own page, where it is fixed.
//
// Read-only. Every number comes from the server in one request
// (GET /api/staff/warehouse/manager/stats/, backend warehouse/manager.py),
// which explains exactly what each one counts. It reloads by itself every
// minute while the page is open, and on "Refresh".
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/manager
//   Who can open: admins and warehouse managers (ManagerLayout)
//   Links to:     /warehouse/packages/:id, /warehouse/assign/:sheetId,
//                 /warehouse/manager/activity
//   Backend:      api/warehouse.js getManagerStats

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getManagerStats } from '../../api/warehouse';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { formatDateTime } from '../Dashboard/format';
import { usePageText } from '../Dashboard/usePageText';
import styles from '../Dashboard/Dashboard.module.css';
import own from './Manager.module.css';

// How often the numbers reload by themselves while the page is open.
const REFRESH_MS = 60 * 1000;

// The cards, in reading order. `watch`: a number that should be zero, so it
// is amber while it is not and green once it is.
const CARDS = [
  { key: 'active_workers' },
  { key: 'signed_in_now', note: true },
  { key: 'received_today' },
  { key: 'processed_today', note: true },
  { key: 'waiting', note: true },
  { key: 'unassigned', note: true, watch: true },
  { key: 'missing_measurements', watch: true },
  { key: 'problems', watch: true },
];

function StatCard({ name, value, note, watch }) {
  const m = usePageText('warehouseManager');
  const tone = watch ? (value > 0 ? own.cardWarn : own.cardOk) : '';
  return (
    <li className={`${own.card} ${tone}`}>
      <span className={own.cardLabel}>{m(`stats.${name}`)}</span>
      <span className={own.cardValue}>{value}</span>
      {note && <span className={own.cardNote}>{m(`statNotes.${name}`)}</span>}
    </li>
  );
}

/** One "needs attention" list: a heading with the full count, and the rows. */
function AttentionList({ name, rows, total, linkFor, describe }) {
  const m = usePageText('warehouseManager');
  return (
    <>
      <h3 className={own.listTitle}>
        <span>{m(`attention.${name}`)}</span>
        <span>{total}</span>
      </h3>
      {rows.length === 0 ? (
        <p className={own.muted}>{m('allClear')}</p>
      ) : (
        <ul className={own.list}>
          {rows.map((row) => {
            const { title, note } = describe(row);
            return (
              <li key={`${name}-${row.damage_id ?? row.id}`}>
                <Link to={linkFor(row)} className={own.item}>
                  <span className={own.itemMain}>
                    <span className={own.itemTitle}>{title}</span>
                    {note && <span className={own.itemNote}>{note}</span>}
                  </span>
                  <span className={own.itemOpen}>{m('open')} →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > rows.length && rows.length > 0 && (
        <p className={own.muted}>{m('andMore', { shown: rows.length, total })}</p>
      )}
    </>
  );
}

export default function ManagerOverview() {
  const m = usePageText('warehouseManager');
  const [data, setData] = useState(null);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  // Asks for the numbers; state changes only once the answer is back.
  const fetchStats = useCallback(
    () =>
      getManagerStats().then(
        (stats) => {
          setData(stats);
          setLoadedAt(new Date());
          setState('ready');
        },
        // Keep showing the last numbers if there were any; say so if not.
        () => setState((current) => (current === 'ready' ? current : 'error')),
      ),
    [],
  );

  // On opening, and every minute while the page stays open.
  useEffect(() => {
    fetchStats();
    const timer = window.setInterval(fetchStats, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [fetchStats]);

  // "Refresh" and "Try again": the same, with the button showing it is busy.
  function load() {
    setBusy(true);
    fetchStats().finally(() => setBusy(false));
  }

  if (state === 'loading') return <Loading inline />;
  if (state === 'error') return <ConnectionError inline onRetry={load} />;

  const { counts, signed_in: signedIn, today, attention, attention_totals: totals } = data;
  const packageLink = (row) => `/warehouse/packages/${row.id}`;
  const since = (row) => (row.since ? m('since', { when: formatDateTime(row.since) }) : '');

  return (
    <>
      <div className={own.toolbar}>
        <span className={own.updated}>
          {loadedAt && m('updatedAt', { time: loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
        </span>
        <button type="button" className={own.button} onClick={load} disabled={busy}>
          {m('refresh')}
        </button>
      </div>

      <ul className={own.cards}>
        {CARDS.map((card) => (
          <StatCard
            key={card.key}
            name={card.key}
            value={counts[card.key] ?? 0}
            note={card.note}
            watch={card.watch}
          />
        ))}
      </ul>

      <p className={own.names}>
        <strong>{m('stats.signed_in_now')}:</strong>{' '}
        {signedIn.length === 0 ? m('nobodySignedIn') : signedIn.map((person) => person.name).join(', ')}
      </p>

      <div className={own.columns}>
        {/* Today's work per worker: the office's daily report. */}
        <section className={own.box} aria-labelledby="manager-today">
          <h2 id="manager-today" className={own.boxTitle}>
            {m('todayTitle')}
          </h2>
          {today.workers.length === 0 ? (
            <p className={own.muted}>{m('todayEmpty')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{m('colWorker')}</th>
                    {today.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {m(`todayColumns.${column.key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {today.workers.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      {today.columns.map((column) => (
                        <td key={column.key} className={styles.numberCell}>
                          {row[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{m('colTotal')}</th>
                    {today.columns.map((column) => (
                      <td key={column.key} className={styles.numberCell}>
                        <strong>{today.totals[column.key]}</strong>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* The packages behind the amber numbers. */}
        <section className={own.box} aria-labelledby="manager-attention">
          <h2 id="manager-attention" className={own.boxTitle}>
            {m('attentionTitle')}
          </h2>
          <AttentionList
            name="problems"
            rows={attention.problems}
            total={totals.problems}
            linkFor={packageLink}
            describe={(row) => ({ title: row.tracking_number, note: `${row.note} · ${since(row)}` })}
          />
          <AttentionList
            name="damage"
            rows={attention.damage}
            total={totals.damage}
            linkFor={packageLink}
            describe={(row) => ({
              title: `${row.tracking_number} · ${row.damage_type}`,
              note: [row.note, since(row)].filter(Boolean).join(' · '),
            })}
          />
          <AttentionList
            name="missing_measurements"
            rows={attention.missing_measurements}
            total={totals.missing_measurements}
            linkFor={packageLink}
            describe={(row) => ({
              title: row.tracking_number,
              note: [row.customer, row.stage_display, since(row)].filter(Boolean).join(' · '),
            })}
          />
          <AttentionList
            name="unassigned"
            rows={attention.unassigned}
            total={totals.unassigned}
            linkFor={(row) => `/warehouse/assign/${row.id}`}
            describe={(row) => ({
              title: row.reference || `#${row.id}`,
              note: [row.supplier, row.recipient, formatDateTime(row.created_at)].filter(Boolean).join(' · '),
            })}
          />
        </section>
      </div>
    </>
  );
}
