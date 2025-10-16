import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllProviderIcons } from '../provider-icons';

describe('provider-icons-sync', () => {
  it('should have COMMON_PROVIDER_ICONS in sync with actual files in public/assets/provider-icons', () => {
    // Read actual files from the filesystem
    const iconsDir = path.join(process.cwd(), 'public/assets/provider-icons');
    const actualFiles = fs.readdirSync(iconsDir);
    const actualIcons = actualFiles
      .filter(file => file.endsWith('.svg'))
      .map(file => file.replace('.svg', ''))
      .sort();

    // Get the icons from our COMMON_PROVIDER_ICONS
    const commonIcons = getAllProviderIcons();

    // Compare the two lists
    const missingInCommon = actualIcons.filter(icon => !commonIcons.includes(icon));
    const extraInCommon = commonIcons.filter(icon => !actualIcons.includes(icon));

    // Create helpful error messages
    let errorMessage = '';
    
    if (missingInCommon.length > 0) {
      errorMessage += `\nMissing in COMMON_PROVIDER_ICONS (found in filesystem but not in code):\n`;
      errorMessage += missingInCommon.map(icon => `  - '${icon}',`).join('\n');
    }
    
    if (extraInCommon.length > 0) {
      errorMessage += `\nExtra in COMMON_PROVIDER_ICONS (found in code but not in filesystem):\n`;
      errorMessage += extraInCommon.map(icon => `  - '${icon}' (should be removed)`).join('\n');
    }

    if (errorMessage) {
      errorMessage = `COMMON_PROVIDER_ICONS is out of sync with public/assets/provider-icons/\n${errorMessage}\n\nPlease update the COMMON_PROVIDER_ICONS set in src/lib/provider-icons.ts`;
    }

    // The test passes only if both lists are identical
    expect(missingInCommon).toEqual([]);
    expect(extraInCommon).toEqual([]);
    
    // Also verify the counts match
    expect(commonIcons.length).toBe(actualIcons.length);
  });
});
