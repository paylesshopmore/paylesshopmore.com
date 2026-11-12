// src/components/AttachmentList/ReceivedBadge.jsx
//
// The small green "Ontvangen in ons magazijn" label on a store order or a
// product, shown once an admin in the office pressed "Bestelling ontvangen"
// or "Product ontvangen" (the API then sends `received_at`). Shown to the
// customer (My bookings) and the office (Dashboard -> Bookings) alike.

import { useContext } from 'react';
import { CheckCircleIcon } from '../Icons/icons';
import { LanguageContext } from '../../i18n/context';
import styles from './AttachmentList.module.css';

/** @param {{ receivedAt: string | null | undefined }} props */
export default function ReceivedBadge({ receivedAt }) {
  const site = useContext(LanguageContext);
  if (!receivedAt) return null;
  const key = 'orderOverview.receivedBadge';
  const word = site?.t?.(key);
  return (
    <span className={styles.receivedBadge}>
      <CheckCircleIcon size={14} />
      {word && word !== key ? word : 'Received at our warehouse'}
    </span>
  );
}
