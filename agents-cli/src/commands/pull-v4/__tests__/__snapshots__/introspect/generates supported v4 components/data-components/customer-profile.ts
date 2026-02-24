import { dataComponent } from '@inkeep/agents-sdk';
import { z } from 'zod';

export const customerProfile = dataComponent({
  id: 'customer-profile',
  name: 'Customer Profile',
  description: 'Customer profile data component',
  props: z.object({ "fullName": z.string().optional(), "avatarUrl": z.string().optional() }),
  render: {
    component: '<img src="{{avatarUrl}}" alt="{{fullName}}" />',
    mockData: {
      fullName: 'Ada Lovelace',
      avatarUrl: 'https://example.com/avatar.png',
    },
  },
});
