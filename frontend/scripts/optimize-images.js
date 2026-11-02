// Turns the photographs in src/images into WebP at the sizes the site
// actually displays them.
//
//     npm run images
//
// Run by hand, not as part of the build, and the output is committed. Two
// reasons: the source photographs change about once a year, and making every
// build and every CI run depend on sharp — a package with a compiled binary
// per platform — is a large tax on a step whose answer never changes.
//
// The originals stay where they are. They are the masters: re-running this
// after changing a width has to start from full quality, not from the last
// compression.

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'src/images';
const OUTPUT = 'src/images/optimized';

// The widths a photo is actually painted at, give or take a device pixel
// ratio. 1600 covers a full-bleed banner on a laptop, 960 a tablet or a
// two-column card, 480 a phone.
const WIDTHS = [480, 960, 1600];

// Everything else in src/images is a flag: SVG, or a PNG small enough that
// the WebP header would be a meaningful fraction of it.
const PHOTOGRAPHS = [
  'Aruba-centraal.avif',
  'Bonaire-centraal.jpg',
  'box-cart.jpg',
  'boxes.png',
  'container-ship.webp',
  'Curacao-centraal.webp',
  'port-haven-ship.jpeg',
  'Suriname-centraal.webp',
];

// 78 is where WebP stops being distinguishable from the original on a
// photograph at viewing size, and well past where the file stops shrinking
// usefully.
const QUALITY = 78;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

/** Strip the extension and the punctuation that makes a bad identifier. */
function stem(filename) {
  return basename(filename, extname(filename)).replaceAll('.', '-');
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  const known = new Set(await readdir(SOURCE));
  const missing = PHOTOGRAPHS.filter((name) => !known.has(name));

  if (missing.length > 0) {
    throw new Error(`not in ${SOURCE}: ${missing.join(', ')}`);
  }

  let before = 0;
  let after = 0;
  const manifest = [];

  for (const name of PHOTOGRAPHS) {
    const source = join(SOURCE, name);
    const image = sharp(source);
    const { width: sourceWidth, height: sourceHeight } = await image.metadata();
    const original = (await stat(source)).size;
    before += original;

    // Never upscale: a 540px photograph enlarged to 1600 is a bigger file
    // that looks worse than the one it came from. But always emit the source
    // at full width, or a 959px banner would ship as the 480px variant and
    // the optimisation would be a visible downgrade.
    const largest = Math.min(sourceWidth, WIDTHS.at(-1));
    const widths = [...WIDTHS.filter((width) => width < largest), largest];

    const variants = [];

    for (const width of widths) {
      const target = join(OUTPUT, `${stem(name)}-${width}.webp`);
      const { size } = await sharp(source)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(target);

      after += size;
      variants.push({ width, file: `${stem(name)}-${width}.webp`, size });
      console.log(`  ${target.padEnd(48)} ${kb(size)}`);
    }

    manifest.push({
      name,
      stem: stem(name),
      // The intrinsic size of the largest variant, for the width and height
      // attributes that stop the page reflowing when the image lands.
      width: variants.at(-1).width,
      height: Math.round(
        (variants.at(-1).width / sourceWidth) * sourceHeight,
      ),
      variants,
    });

    console.log(`${name}: ${kb(original)} -> ${variants.length} variants`);
  }

  await writeFile(join(OUTPUT, 'photos.js'), photosModule(manifest), 'utf8');

  console.log(
    `\n${PHOTOGRAPHS.length} photographs: ${kb(before)} of originals, ` +
      `${kb(after)} across every generated size. A visitor loads one size, ` +
      `not all of them.`,
  );
}

/** aruba-centraal -> arubaCentraal, so the export is a usable identifier. */
function identifier(value) {
  const camel = value
    .split('-')
    .map((part, index) =>
      index === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');

  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

/**
 * The generated module the components import.
 *
 * Generated rather than hand-written because it is the part that would rot:
 * change a width in WIDTHS and every srcset in the app has to change with it.
 * Vite needs each variant imported by a literal path to fingerprint it and put
 * it in the build, so a runtime loop over a manifest would not do.
 */
function photosModule(entries) {
  const imports = [];
  const exports = [];

  for (const entry of entries) {
    const name = identifier(entry.stem);
    const srcSet = [];

    for (const variant of entry.variants) {
      const local = `${name}${variant.width}`;
      imports.push(`import ${local} from './${variant.file}';`);
      srcSet.push(`\${${local}} ${variant.width}w`);
    }

    const largest = `${name}${entry.width}`;
    const smallest = `${name}${entry.variants[0].width}`;

    exports.push(
      `/** ${entry.name} — ${entry.width}×${entry.height} at full size. */\n` +
        `export const ${name} = {\n` +
        `  src: ${largest},\n` +
        `  srcSet: \`${srcSet.join(', ')}\`,\n` +
        `  // For a CSS background, which cannot express a srcset. Use it\n` +
        `  // where the image is painted small, such as a card thumbnail.\n` +
        `  small: ${smallest},\n` +
        `  width: ${entry.width},\n` +
        `  height: ${entry.height},\n` +
        `};`,
    );
  }

  return (
    '// Generated by scripts/optimize-images.js — do not edit.\n' +
    '//\n' +
    '// Each export carries a src for browsers that ignore srcSet, the srcSet\n' +
    '// itself, and the intrinsic size. Pass width and height to the <img> as\n' +
    '// well: they are what reserve the space so the page does not jump when\n' +
    '// the photograph arrives.\n' +
    '//\n' +
    "// Regenerate with `npm run images` after changing a source photograph.\n" +
    '\n' +
    `${imports.join('\n')}\n\n${exports.join('\n\n')}\n`
  );
}

await main();
