import fs from 'node:fs';
import { ICONS_NAMES as commonIcons } from '../provider-icons';

describe('provider-icons-sync', () => {
  it('should have COMMON_PROVIDER_ICONS in sync with actual files in public/assets/provider-icons', () => {
    const actualIcons = fs
      .globSync('**/*', {
        cwd: 'public/assets/provider-icons',
      })
      .map((file) => file.replace(/\.svg$/, ''));
    expect(actualIcons.sort()).toStrictEqual(commonIcons);
  });
});
