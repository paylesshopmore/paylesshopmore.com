import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useSiteSwitches } from '../../hooks/useSiteSwitches';
import styles from './Footer.module.css';

// Headings and labels are translation keys; hrefs are not translated.
// `signedIn` links only show to somebody signed in, as in the header.
const FOOTER_LINKS = [
  {
    heading: 'footer.navigation',
    links: [
      { key: 'nav.home', href: '/' },
      { key: 'nav.services', href: '/services' },
      { key: 'nav.tracking', href: '/tracking', signedIn: true },
      { key: 'nav.booking', href: '/booking' },
      { key: 'nav.calculator', href: '/calculator' },
      { key: 'nav.contact', href: '/contact' },
    ],
  },
  {
    heading: 'footer.company',
    links: [
      { key: 'footer.about', href: '/about-us' },
      { key: 'footer.blog', href: '/blog' },
      { key: 'footer.faq', href: '/faq' },
    ],
  },
  {
    heading: 'footer.legal',
    links: [
      { key: 'footer.privacy', href: '/privacy' },
      { key: 'footer.terms', href: '/terms' },
      { key: 'footer.cookies', href: '/cookies' },
    ],
  },
];

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://facebook.com' },
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  // An admin can hide the Calculator page (Site settings in the Django admin).
  const { showCalculator } = useSiteSwitches();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          {/* Brand block */}
          <div className={styles.brand}>
            <NavLink to="/" className={styles.logo}>
              PayLesShopMore<span className={styles.dot}>.com</span>
            </NavLink>
            <p className={styles.tagline}>{t('footer.tagline')}</p>

            <ul className={styles.social} aria-label={t('footer.social')}>
              {SOCIAL_LINKS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className={styles.socialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Link columns */}
          <nav className={styles.columns} aria-label={t('footer.footerNav')}>
            {FOOTER_LINKS.map((col) => (
              <div key={col.heading} className={styles.column}>
                <h3 className={styles.heading}>{t(col.heading)}</h3>
                <ul className={styles.linkList}>
                  {col.links.filter((link) => (!link.signedIn || isAuthenticated) && (showCalculator || link.href !== '/calculator')).map((link) => (
                    <li key={link.href}>
                      <NavLink
                        to={link.href}
                        className={({ isActive }) =>
                          isActive
                            ? `${styles.link} ${styles.linkActive}`
                            : styles.link
                        }
                      >
                        {t(link.key)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar */}
        <div className={styles.bottom}>
          <p className={styles.copyright}>
            &copy; {year} PayLesShopMore.com — {t('footer.rights')}
          </p>
          <p className={styles.madeIn}>{t('footer.madeIn')} 🇳🇱</p>
        </div>
      </div>
    </footer>
  );
}
