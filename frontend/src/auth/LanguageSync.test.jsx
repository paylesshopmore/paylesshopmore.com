// LanguageSync: the account learns the site language, so e-mails use it.

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveProfileLanguage } from '../api/profile';
import LanguageSync from './LanguageSync';

vi.mock('../api/profile', () => ({ saveProfileLanguage: vi.fn() }));

const auth = { user: null };
vi.mock('./useAuth', () => ({ useAuth: () => auth }));

// A stand-in for LanguageContext: setLanguage changes `language`, like the
// real one, and the tests re-render to see the effect run again.
const lang = {
  language: 'nl',
  languages: [{ code: 'nl' }, { code: 'en' }],
  setLanguage: vi.fn((code) => {
    lang.language = code;
  }),
};
vi.mock('../i18n/useLanguage', () => ({ useLanguage: () => lang }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  saveProfileLanguage.mockReset().mockResolvedValue({});
  auth.user = null;
  lang.language = 'nl';
  lang.setLanguage.mockClear();
});

describe('LanguageSync', () => {
  it('does nothing for a visitor who is not signed in', () => {
    render(<LanguageSync />);
    expect(saveProfileLanguage).not.toHaveBeenCalled();
  });

  it('does nothing when the account already has the site language', () => {
    auth.user = { id: 1, language: 'nl' };
    render(<LanguageSync />);
    expect(saveProfileLanguage).not.toHaveBeenCalled();
  });

  it('saves the guest language on an account with no saved language yet', () => {
    auth.user = { id: 1, language: '' };
    lang.language = 'pap';
    const { rerender } = render(<LanguageSync />);
    rerender(<LanguageSync />);

    expect(saveProfileLanguage).toHaveBeenCalledTimes(1);
    expect(saveProfileLanguage).toHaveBeenCalledWith('pap');
  });

  it('saves again when the customer switches language', () => {
    auth.user = { id: 1, language: 'nl' };
    const { rerender } = render(<LanguageSync />);
    lang.language = 'en';
    rerender(<LanguageSync />);

    expect(saveProfileLanguage).toHaveBeenCalledWith('en');
  });

  it('switches the site to the English saved on the account at sign-in', () => {
    lang.language = 'nl';
    const { rerender } = render(<LanguageSync />);
    auth.user = { id: 1, language: 'en' };
    rerender(<LanguageSync />);
    rerender(<LanguageSync />);

    expect(lang.setLanguage).toHaveBeenCalledWith('en');
    // Taking the account's language is not a change to save back.
    expect(saveProfileLanguage).not.toHaveBeenCalled();
  });

  it('switches the site to the Dutch saved on the account at sign-in', () => {
    lang.language = 'en';
    auth.user = { id: 2, language: 'nl' };
    render(<LanguageSync />);

    expect(lang.setLanguage).toHaveBeenCalledWith('nl');
  });

  it('treats a saved language the site no longer offers as no preference', () => {
    lang.language = 'en';
    auth.user = { id: 1, language: 'pap' };
    render(<LanguageSync />);

    expect(lang.setLanguage).not.toHaveBeenCalled();
    expect(saveProfileLanguage).toHaveBeenCalledWith('en');
  });

  it('applies the account language only once, then lets the customer choose', () => {
    auth.user = { id: 1, language: 'nl' };
    const { rerender } = render(<LanguageSync />);
    lang.language = 'en';
    rerender(<LanguageSync />);

    expect(lang.setLanguage).not.toHaveBeenCalled();
    expect(saveProfileLanguage).toHaveBeenCalledWith('en');
  });

  it('saves a switch back to the first language (NL -> EN -> NL)', async () => {
    auth.user = { id: 1, language: 'nl' };
    const { rerender } = render(<LanguageSync />);
    lang.language = 'en';
    rerender(<LanguageSync />);
    await flush();
    lang.language = 'nl';
    rerender(<LanguageSync />);

    expect(saveProfileLanguage).toHaveBeenLastCalledWith('nl');
  });

  it('applies the next account language after signing out and in again', () => {
    auth.user = { id: 1, language: 'nl' };
    const { rerender } = render(<LanguageSync />);
    auth.user = null;
    rerender(<LanguageSync />);
    auth.user = { id: 2, language: 'en' };
    rerender(<LanguageSync />);

    expect(lang.setLanguage).toHaveBeenCalledWith('en');
  });
});
