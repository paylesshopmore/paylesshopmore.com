// src/pages/Warehouse/UnassignedQueue.jsx
//
// "Without a customer": goods that came in with nothing to say whose they
// are - an intake sheet not tied to any customer, shipment or booking. The
// oldest first, because what has waited longest is the most urgent.
//
// Each row has one button, "Find customer", which opens AssignCustomer.jsx.
// A sheet only leaves this list once somebody has found and confirmed its
// customer; nothing is ever linked automatically. When in doubt, the goods
// stay here - that is the point of the list.
//
// CONNECTED PAGES  (the whole map: docs/WEBSITE-MAP.md)
//   Address:      /warehouse/unassigned
//   Who can open: everybody in the warehouse (the intake section)
//   Links to:     /warehouse/assign/:sheetId
//   Linked from:  the warehouse menu, warehouse management (overview)
//   Backend:      api/staff.js listIntakeSheets({ unassigned: 'true' })

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listIntakeSheets } from '../../api/staff';
import Loading from '../../components/Loading/Loading';
import { formatDateTime } from '../Dashboard/format';
import { Empty, Pagination } from '../Dashboard/ui';
import { usePageText } from '../Dashboard/usePageText';
import styles from '../Dashboard/Dashboard.module.css';
import own from './Manager.module.css';

export default function UnassignedQueue() {
  const w = usePageText('warehouseCustomers');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  // The answer, labelled with the request it answers (see ManagerActivity).
  const requestKey = `${page}#${attempt}`;
  const [answer, setAnswer] = useState({ key: null, data: null, failed: false });
  const state = answer.key !== requestKey ? 'loading' : answer.failed ? 'error' : 'ready';

  useEffect(() => {
    let live = true;
    listIntakeSheets({ unassigned: 'true', page })
      .then((data) => live && setAnswer({ key: requestKey, data, failed: false }))
      .catch(() => live && setAnswer({ key: requestKey, data: null, failed: true }));
    return () => {
      live = false;
    };
  }, [page, requestKey]);

  const rows = answer.data?.results ?? [];

  return (
    <div className={own.area}>
      <header className={styles.head}>
        <h1 className={styles.title}>{w('queueTitle')}</h1>
        <p className={styles.subtitle}>{w('queueIntro')}</p>
      </header>

      {state === 'loading' && <Loading inline />}

      {state === 'error' && (
        <p className={own.muted} role="alert">
          {w('queueFailed')}{' '}
          <button type="button" className={own.button} onClick={() => setAttempt((n) => n + 1)}>
            {w('retry')}
          </button>
        </p>
      )}

      {state === 'ready' &&
        (rows.length === 0 ? (
          <Empty>{w('queueEmpty')}</Empty>
        ) : (
          <>
            {/* A list of big tap targets rather than a table: this is used
                on an iPad standing next to the goods. */}
            <ul className={own.list}>
              {rows.map((sheet) => (
                <li key={sheet.id}>
                  <Link to={`/warehouse/assign/${sheet.id}`} className={own.item}>
                    <span className={own.itemMain}>
                      <span className={own.itemTitle}>{sheet.reference || `#${sheet.id}`}</span>
                      <span className={own.itemNote}>
                        {[
                          sheet.supplier || sheet.sender,
                          sheet.recipient,
                          sheet.colli_count ? w('colli', { count: sheet.colli_count }) : '',
                          formatDateTime(sheet.created_at),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className={own.itemOpen}>{w('findCustomer')} →</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              count={answer.data.count}
              hasNext={answer.data.hasNext}
              hasPrevious={answer.data.hasPrevious}
              onChange={setPage}
            />
          </>
        ))}
    </div>
  );
}
