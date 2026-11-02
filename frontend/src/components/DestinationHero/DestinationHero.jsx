// src/components/DestinationHero/DestinationHero.jsx
import styles from './DestinationHero.module.css';

/**
 * Full-bleed banner with a title centred over a photo. Shared by the
 * /destinations index, each island page and the services page, so they
 * cannot drift apart.
 *
 * `eyebrow` is an optional short word above the title, in yellow ("ONZE"
 * over "DIENSTEN"). `brand` lays the brand colours over the photo: a navy
 * tint, the blue diagonal streaks of the other page banners, and a yellow
 * rule under the title.
 *
 * `flag` names an island whose flag fills the letters of the title
 * ('aruba', 'bonaire' or 'curacao'); the class of that name in the CSS draws it.
 *
 * @param {{ title: string, image?: string | null, eyebrow?: string, brand?: boolean, flag?: string }} props
 */
export default function DestinationHero({ title, image, eyebrow, brand = false, flag }) {
  const classes = [styles.hero];
  if (!image) classes.push(styles.heroPlain);
  if (brand) classes.push(styles.heroBrand);

  return (
    <section
      className={classes.join(' ')}
      style={image ? { '--hero-image': `url(${image})` } : undefined}
    >
      <div className={styles.inner}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={flag ? `${styles.title} ${styles[flag]}` : styles.title}>
          {title}
        </h1>
      </div>
    </section>
  );
}
