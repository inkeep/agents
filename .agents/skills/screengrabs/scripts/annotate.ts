/**
 * PR Screenshot Annotation Script
 *
 * Adds labels, colored borders, and creates side-by-side comparisons.
 *
 * Label mode:
 *   npx tsx annotate.ts --input before.png --label "Before" --border "#ef4444" --output labeled.png
 *
 * Stitch mode:
 *   npx tsx annotate.ts --stitch before.png after.png --labels "Before,After" --output comparison.png
 */

import sharp from 'sharp';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

function getMultiArg(name: string): string[] {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return [];
  const values: string[] = [];
  for (let i = idx + 1; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) break;
    values.push(process.argv[i]);
  }
  return values;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function addLabel(inputPath: string, label: string, borderColor: string, outputPath: string) {
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 800;

  const borderWidth = 3;
  const labelHeight = 36;
  const fontSize = 16;
  const escapedLabel = escapeXml(label);

  const labelSvg = Buffer.from(`
    <svg width="${width}" height="${labelHeight}">
      <rect x="0" y="0" width="${width}" height="${labelHeight}" fill="${borderColor}" />
      <text
        x="${width / 2}" y="${labelHeight / 2 + fontSize / 3}"
        text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${fontSize}" font-weight="bold" fill="white">
        ${escapedLabel}
      </text>
    </svg>
  `);

  await sharp(inputPath)
    .extend({
      top: labelHeight,
      bottom: borderWidth,
      left: borderWidth,
      right: borderWidth,
      background: borderColor,
    })
    .composite([
      {
        input: labelSvg,
        top: 0,
        left: borderWidth,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`Labeled: ${outputPath}`);
}

async function stitchImages(inputPaths: string[], labels: string[], outputPath: string) {
  if (inputPaths.length !== 2) {
    throw new Error('Stitch requires exactly 2 images');
  }

  const gap = 16;
  const labelHeight = 36;
  const fontSize = 16;
  const colors = ['#ef4444', '#22c55e'];

  const images = await Promise.all(
    inputPaths.map(async (p) => {
      const meta = await sharp(p).metadata();
      return { path: p, width: meta.width || 800, height: meta.height || 600 };
    })
  );

  const maxHeight = Math.max(...images.map((i) => i.height));
  const totalWidth = images.reduce((sum, i) => sum + i.width, 0) + gap;

  const labelSvgs = images.map((img, i) => {
    const escapedLabel = escapeXml(labels[i] || (i === 0 ? 'Before' : 'After'));
    return Buffer.from(`
      <svg width="${img.width}" height="${labelHeight}">
        <rect x="0" y="0" width="${img.width}" height="${labelHeight}" fill="${colors[i]}" />
        <text
          x="${img.width / 2}" y="${labelHeight / 2 + fontSize / 3}"
          text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="${fontSize}" font-weight="bold" fill="white">
          ${escapedLabel}
        </text>
      </svg>
    `);
  });

  const imageBuffers = await Promise.all(inputPaths.map((p) => sharp(p).toBuffer()));

  let xOffset = 0;
  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < images.length; i++) {
    composites.push({
      input: labelSvgs[i],
      top: 0,
      left: xOffset,
    });
    composites.push({
      input: imageBuffers[i],
      top: labelHeight,
      left: xOffset,
    });
    xOffset += images[i].width + gap;
  }

  await sharp({
    create: {
      width: totalWidth,
      height: maxHeight + labelHeight,
      channels: 4,
      background: { r: 245, g: 245, b: 245, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);

  console.log(`Stitched: ${outputPath}`);
}

async function main() {
  const inputPath = getArg('input');
  const label = getArg('label');
  const borderColor = getArg('border') || '#6b7280';
  const outputPath = getArg('output');
  const stitchPaths = getMultiArg('stitch');
  const labelsStr = getArg('labels');

  if (stitchPaths.length === 2 && outputPath) {
    const labels = labelsStr ? labelsStr.split(',').map((l) => l.trim()) : ['Before', 'After'];
    await stitchImages(stitchPaths, labels, outputPath);
  } else if (inputPath && outputPath) {
    await addLabel(inputPath, label || 'Screenshot', borderColor, outputPath);
  } else {
    console.error('Usage:');
    console.error(
      '  Label:  npx tsx annotate.ts --input <file> --label <text> --border <color> --output <file>'
    );
    console.error(
      '  Stitch: npx tsx annotate.ts --stitch <file1> <file2> --labels "Before,After" --output <file>'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Annotate failed:', err);
  process.exit(1);
});
