// src/pages/Warehouse/ManagerIntakes.jsx
//
// "Intakes": every intake sheet with its intake number (001, 002 ...), for
// the warehouse manager. From here a manager can:
//   - filter by state (being filled in, empty, handed over, archived), by
//     who started it, by customer, by intake number and by date;
//   - DELETE an empty intake. Its number is then free, and the next new
//     intake gets it (backend warehouse/intake_numbers.py decides what
//     "empty" means, and checks again at the moment of deleting);
//   - ARCHIVE an intake that has something on it (with a reason), or bring
//     an archived one back. Nothing with information on it is ever deleted.
//
// Filters live in the address (?view=empty&created_by=3 ...), like the
// activity log, so a link to "the empty intakes" works.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/manager/intakes
//   Who can open: admins and warehouse managers (ManagerLayout checks; the
//                 server refuses delete/archive to everybody else)
//   Links to:     /warehouse/intake?sheet=:id
//   Backend:      api/staff.js listIntakeSheets, deleteIntakeSheet,
//                 archiveIntakeSheet, unarchiveIntakeSheet, listWorkers

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  archiveIntakeSheet,
  deleteIntakeSheet,
  listIntakeSheets,
  listWorkers,
  unarchiveIntakeSheet,
} from '../../api/staff';
import Loading from '../../components/Loading/Loading';
import { formatDateTime } from '../Dashboard/format';
import { Banner, Empty, Pagination, StatusBadge } from '../Dashboard/ui';
import { usePageText } from '../Dashboard/usePageText';
import own from './Manager.module.css';

// The state buttons, and what each one asks the server for.
const VIEWS = {
  all: {},
  draft: { status: 'draft' },
  empty: { empty: 'true' },
  released: { status: 'released' },
  archived: { archived: 'true' },
};

// The filters kept in the address, besides `view` and `page`.
const FILTERS = ['created_by', 'customer_q', 'number', 'created_from', 'created_to'];

/** Which badge a row gets. `empty` comes from the view: the list answer does
 *  not say whether a sheet is empty, the "Empty" view does. */
function badgeFor(row, inEmptyView) {
  if (row.archived) return { key: 'archived', tone: 'neutral' };
  if (row.released) return { key: 'released', tone: 'done' };
  if (inEmptyView || row.permissions?.delete) return { key: 'empty', tone: 'attention' };
  return { key: 'draft', tone: 'progress' };
}

/** "Intake 007", or just "Intake" for a sheet that somehow has no number. */
function useIntakeName() {
  const t = usePageText('warehouseIntakes');
  return (row) => (row.number_display ? t('number', { number: row.number_display }) : t('noNumber'));
}

function IntakeRow({ row, inEmptyView, onDone }) {
  const t = usePageText('warehouseIntakes');
  const name = useIntakeName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = row.permissions ?? {};
  const badge = badgeFor(row, inEmptyView);
  const number = row.number_display || row.label;

  // Runs one action; tells the list what happened so it can reload.
  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      await action();
      onDone(t(message, { number }));
    } catch (caught) {
      setError(caught?.status === 409 ? t('notEmpty') : t('failed'));
      setBusy(false);
    }
  }

  function remove() {
    if (!window.confirm(t('deleteConfirm', { number }))) return;
    run(() => deleteIntakeSheet(row.id), 'deleted');
  }

  function archive() {
    const reason = window.prompt(t('archivePrompt', { number }));
    // Cancelled, or nothing typed: the server needs a reason, so stop here.
    if (!reason || !reason.trim()) return;
    run(() => archiveIntakeSheet(row.id, reason.trim()), 'archived');
  }

  return (
    <li className={own.reviewRow}>
      <div className={own.reviewHead}>
        <span className={own.itemMain}>
          <span className={own.itemTitle}>
            {name(row)}
            {row.reference && <span className={own.muted}> · {row.reference}</span>}
          </span>
          <span className={own.itemNote}>
            {[
              row.customer ? `${row.customer.name} (${row.customer.customer_code})` : t('noCustomer'),
              row.supplier,
              row.destination,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className={own.itemNote}>
            {t('startedBy', { name: row.created_by_name || row.employee_name || '-', when: formatDateTime(row.created_at) })}
          </span>
          {row.archived && row.archive_reason && (
            <span className={own.itemNote}>{t('archivedBecause', { reason: row.archive_reason })}</span>
          )}
        </span>
        <StatusBadge tone={badge.tone}>{t(`badge.${badge.key}`)}</StatusBadge>
      </div>

      {error && (
        <p className={own.muted} role="alert">
          {error}
        </p>
      )}

      <p className={own.actions}>
        <Link to={`/warehouse/intake?sheet=${row.id}`} className={own.button}>
          {t('open')}
        </Link>
        {/* Delete only on an EMPTY intake (the server says so per row);
            anything else can be archived instead. */}
        {allowed.delete && (
          <button type="button" className={own.button} disabled={busy} onClick={remove}>
            {t('delete')}
          </button>
        )}
        {allowed.archive && !allowed.delete && (
          <button type="button" className={own.button} disabled={busy} onClick={archive}>
            {t('archive')}
          </button>
        )}
        {allowed.unarchive && (
          <button
            type="button"
            className={own.button}
            disabled={busy}
            onClick={() => run(() => unarchiveIntakeSheet(row.id), 'unarchived')}
          >
            {t('unarchive')}
          </button>
        )}
      </p>
    </li>
  );
}

export default function ManagerIntakes() {
  const t = usePageText('warehouseIntakes');
  const [params, setParams] = useSearchParams();
  const view = Object.hasOwn(VIEWS, params.get('view')) ? params.get('view') : 'all';
  const page = Number(params.get('page')) || 1;
  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) || '']));

  // The two typed filters are only sent when the manager presses Enter /
  // leaves the box, not on every key.
  const [typed, setTyped] = useState({ customer_q: filters.customer_q, number: filters.number });
  const [workers, setWorkers] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState('');

  const requestKey = `${view}|${FILTERS.map((key) => filters[key]).join('|')}|${page}#${attempt}`;
  // The answer, labelled with the request it answers, so a slow old answer
  // never shows under new filters (see ManagerActivity).
  const [answer, setAnswer] = useState({ key: null, data: null, failed: false });
  const state = answer.key !== requestKey ? 'loading' : answer.failed ? 'error' : 'ready';

  useEffect(() => {
    let live = true;
    const wanted = { ...VIEWS[view], page };
    for (const key of FILTERS) if (filters[key]) wanted[key] = filters[key];
    listIntakeSheets(wanted)
      .then((data) => live && setAnswer({ key: requestKey, data, failed: false }))
      .catch(() => live && setAnswer({ key: requestKey, data: null, failed: true }));
    return () => {
      live = false;
    };
    // requestKey holds every value the request is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // The "Started by" list, once. Without it the filter just has "Everybody".
  useEffect(() => {
    let live = true;
    listWorkers({ page_size: 200 })
      .then((data) => live && setWorkers(data.results ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function set(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setParams(next);
    setDone('');
  }

  function setPage(number) {
    const next = new URLSearchParams(params);
    if (number > 1) next.set('page', String(number));
    else next.delete('page');
    setParams(next);
  }

  function applyTyped(event) {
    event?.preventDefault();
    set({ customer_q: typed.customer_q.trim(), number: typed.number.trim() });
  }

  // Enter in one of the two text boxes applies them (the form has no
  // submit button, so the browser would not do it by itself).
  function enterApplies(event) {
    if (event.key === 'Enter') applyTyped(event);
  }

  function clearAll() {
    setTyped({ customer_q: '', number: '' });
    setParams(view === 'all' ? {} : { view });
    setDone('');
  }

  function afterAction(message) {
    setDone(message);
    setAttempt((n) => n + 1);
  }

  const rows = answer.data?.results ?? [];
  const anyFilter = FILTERS.some((key) => filters[key]);

  return (
    <section aria-labelledby="manager-intakes">
      <h2 id="manager-intakes" className={own.boxTitle}>
        {t('title')}
      </h2>
      <p className={own.muted}>{t('intro')}</p>

      <div className={own.reviewFilters}>
        <div className={own.chips} role="group" aria-label={t('viewLabel')}>
          {Object.keys(VIEWS).map((value) => (
            <button
              key={value}
              type="button"
              className={value === view ? `${own.chip} ${own.chipActive}` : own.chip}
              aria-pressed={value === view}
              onClick={() => set({ view: value === 'all' ? '' : value })}
            >
              {t(`view.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <form className={own.filters} onSubmit={applyTyped}>
        <label className={own.field}>
          <span className={own.fieldLabel}>{t('filterWorker')}</span>
          <select
            className={own.input}
            value={filters.created_by}
            onChange={(event) => set({ created_by: event.target.value })}
          >
            <option value="">{t('everybody')}</option>
            {workers.map((person) => (
              <option key={person.id} value={String(person.id)}>
                {person.name || person.email}
              </option>
            ))}
          </select>
        </label>
        <label className={own.field}>
          <span className={own.fieldLabel}>{t('filterCustomer')}</span>
          <input
            className={own.input}
            type="search"
            value={typed.customer_q}
            placeholder={t('filterCustomerHint')}
            onChange={(event) => setTyped((now) => ({ ...now, customer_q: event.target.value }))}
            onBlur={applyTyped}
            onKeyDown={enterApplies}
          />
        </label>
        <label className={own.field}>
          <span className={own.fieldLabel}>{t('filterNumber')}</span>
          <input
            className={own.input}
            inputMode="numeric"
            value={typed.number}
            placeholder="002"
            onChange={(event) =>
              setTyped((now) => ({ ...now, number: event.target.value.replace(/\D/g, '').slice(0, 6) }))
            }
            onBlur={applyTyped}
            onKeyDown={enterApplies}
          />
        </label>
        <label className={own.field}>
          <span className={own.fieldLabel}>{t('filterFrom')}</span>
          <input
            className={own.input}
            type="date"
            value={filters.created_from}
            onChange={(event) => set({ created_from: event.target.value })}
          />
        </label>
        <label className={own.field}>
          <span className={own.fieldLabel}>{t('filterTo')}</span>
          <input
            className={own.input}
            type="date"
            value={filters.created_to}
            onChange={(event) => set({ created_to: event.target.value })}
          />
        </label>
        <button type="button" className={own.button} onClick={clearAll} disabled={!anyFilter}>
          {t('clear')}
        </button>
      </form>

      <Banner tone="success">{done}</Banner>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && (
        <p className={own.muted} role="alert">
          {t('loadFailed')}{' '}
          <button type="button" className={own.button} onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </button>
        </p>
      )}
      {state === 'ready' &&
        (rows.length === 0 ? (
          <Empty>{t('empty')}</Empty>
        ) : (
          <>
            <p className={own.muted}>{t('count', { count: answer.data.count })}</p>
            <ul className={own.list}>
              {rows.map((row) => (
                <IntakeRow
                  key={`${row.id}-${row.updated_at}`}
                  row={row}
                  inEmptyView={view === 'empty'}
                  onDone={afterAction}
                />
              ))}
            </ul>
            <Pagination
              page={page}
              count={answer.data.count}
              hasNext={answer.data.hasNext}
              hasPrevious={page > 1}
              onChange={setPage}
            />
          </>
        ))}
    </section>
  );
}
