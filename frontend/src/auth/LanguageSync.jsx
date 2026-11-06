// src/auth/LanguageSync.jsx
//
// Keeps the website's language and the signed-in account's saved language
// (`language` on the profile) in step. Renders nothing.
//
// There is ONE language setting for the whole site: LanguageContext
// (src/i18n). The header's switcher, the language rail and the tour's own
// picker (components/Tutorial/TutorialLanguage.jsx) all change that one
// setting. This component only connects it to the account.
//
// WHAT HAPPENS WHEN
//
//   1. Somebody signs in (or opens the site already signed in):
//      - The account has a saved language → the site switches to it. A
//        Dutch-speaking customer on a borrowed English browser still gets
//        Dutch. This happens once per sign-in, not on every render, so it
//        never fights a choice the customer makes afterwards.
//      - The account has no saved language yet (a brand-new account, or one
//        from before this was stored) → the language the visitor was already
//        using as a guest is saved on the account.
//
//   2. A signed-in customer changes language (anywhere: header, rail, tour)
//      → the new language is saved on the account, so e-mails about their
//      shipments arrive in it (backend notifications/messages.py) and it is
//      loaded again next time.
//
//   3. Signing out leaves the site in the language it is in: the browser
//      keeps its own copy (localStorage, in LanguageContext).
//
// A failed save is ignored: the worst case is one e-mail in the previous
// language, and the next change or page load tries again.

import { useEffect, useRef } from 'react';
import { saveProfileLanguage } from '../api/profile';
import { useLanguage } from '../i18n/useLanguage';
import { useAuth } from './useAuth';

export default function LanguageSync() {
  const { user } = useAuth();
  const { language, setLanguage, languages } = useLanguage();
  // "<user id>:<language>" last sent, so a re-render does not send it again
  // while the profile in memory still holds the old value.
  const sent = useRef(null);
  // The account whose saved language has already been applied (step 1
  // above). Reset on sign-out, so the next sign-in applies its own.
  const applied = useRef(null);
  // { id, language } last saved successfully. The account in memory (`user`)
  // is not refetched after a save, so without this a customer who switched
  // NL -> EN -> NL would look "already NL" and the last change would never
  // be saved.
  const saved = useRef(null);

  useEffect(() => {
    if (!user?.id) {
      applied.current = null;
      saved.current = null;
      return;
    }

    // Step 1: the first time we see this account, its saved language wins -
    // if it is one the site offers (a language switched off in
    // translations.js counts as "no preference").
    if (applied.current !== user.id) {
      applied.current = user.id;
      const preferred = user.language;
      const offered = (languages ?? []).some((lang) => lang.code === preferred);
      if (preferred && offered && preferred !== language) {
        // The effect runs again with the new language, finds it equal to
        // the account's, and sends nothing.
        setLanguage(preferred);
        return;
      }
    }

    // Step 2 (and step 1 for an account without a saved language): save
    // the language the site is in on the account.
    const onAccount =
      saved.current?.id === user.id ? saved.current.language : user.language;
    if (!language || onAccount === language) return;
    const key = `${user.id}:${language}`;
    if (sent.current === key) return;
    sent.current = key;
    const userId = user.id;
    saveProfileLanguage(language)
      .then(() => {
        saved.current = { id: userId, language };
      })
      .catch(() => {
        sent.current = null;
      });
  }, [user?.id, user?.language, language, languages, setLanguage]);

  return null;
}
