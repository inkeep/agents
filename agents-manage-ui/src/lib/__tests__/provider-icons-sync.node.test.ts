import fs from 'node:fs';
import { getAllProviderIcons } from '../provider-icons';

describe('provider-icons-sync', () => {
  it('should have COMMON_PROVIDER_ICONS in sync with actual files in public/assets/provider-icons', () => {
    // Read actual files from the filesystem
    const actualFiles = fs.readdirSync('public/assets/provider-icons');
    const actualIcons = actualFiles
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.replace('.svg', ''))
      .sort();

    // Get the icons from our COMMON_PROVIDER_ICONS
    const commonIcons = getAllProviderIcons();

    // Compare the two lists
    const missingInCommon = actualIcons.filter((icon) => !commonIcons.includes(icon));
    const extraInCommon = commonIcons.filter((icon) => !actualIcons.includes(icon));

    // The test passes only if both lists are identical
    expect(missingInCommon).toEqual([]);
    expect(extraInCommon).toEqual([]);

    // Also verify the counts match
    expect(commonIcons.length).toBe(actualIcons.length);
  });
});
