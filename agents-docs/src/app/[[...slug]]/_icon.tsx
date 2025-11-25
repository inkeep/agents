'use client';

import type { FC } from 'react';
import { icon } from '@inkeep/docskit';

export const Icon: FC<{ iconName: string }> = ({ iconName }) => {
  return icon(iconName);
};
