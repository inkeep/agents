import { describe, expect, it } from 'vitest';
import {
  formatComment,
  formatTicket,
  formatTicketList,
  formatTicketWithDescription,
  formatUser,
} from '../lib/format.js';
import type { ZendeskComment, ZendeskTicket, ZendeskUser } from '../lib/types.js';

const mockTicket: ZendeskTicket = {
  id: 12345,
  url: 'https://test.zendesk.com/api/v2/tickets/12345.json',
  subject: 'SSO login not working',
  raw_subject: 'SSO login not working',
  description: 'Users are unable to log in via SSO since the last deployment.',
  status: 'open',
  type: 'incident',
  priority: 'high',
  requester_id: 100,
  submitter_id: 100,
  assignee_id: 200,
  group_id: 300,
  organization_id: 400,
  tags: ['sso', 'login', 'production'],
  created_at: '2024-03-15T10:00:00Z',
  updated_at: '2024-03-15T14:00:00Z',
  due_at: null,
  via: { channel: 'web' },
  satisfaction_rating: null,
  custom_fields: [],
};

const mockComment: ZendeskComment = {
  id: 111,
  type: 'Comment',
  body: 'I cannot log in via SSO.',
  html_body: '<p>I cannot log in via SSO.</p>',
  plain_body: 'I cannot log in via SSO.',
  author_id: 100,
  public: true,
  created_at: '2024-03-15T10:00:00Z',
  attachments: [
    {
      id: 222,
      file_name: 'screenshot.png',
      content_url: 'https://cdn.zendesk.com/screenshot.png',
      content_type: 'image/png',
      size: 52400,
    },
  ],
};

const mockUser: ZendeskUser = {
  id: 456,
  url: 'https://test.zendesk.com/api/v2/users/456.json',
  name: 'Jane Smith',
  email: 'jane@example.com',
  alias: null,
  role: 'end-user',
  active: true,
  verified: true,
  organization_id: 400,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-03-15T12:00:00Z',
  last_login_at: '2024-03-14T09:00:00Z',
  phone: '+15551234567',
  tags: ['vip'],
  notes: '',
  details: '',
};

describe('formatTicket', () => {
  it('includes ticket ID and subject', () => {
    const result = formatTicket(mockTicket, 'test');
    expect(result).toContain('## Ticket #12345: SSO login not working');
  });

  it('includes status and priority', () => {
    const result = formatTicket(mockTicket, 'test');
    expect(result).toContain('**Status**: open');
    expect(result).toContain('**Priority**: high');
  });

  it('includes tags', () => {
    const result = formatTicket(mockTicket, 'test');
    expect(result).toContain('sso, login, production');
  });

  it('includes Zendesk URL with subdomain', () => {
    const result = formatTicket(mockTicket, 'mycompany');
    expect(result).toContain('https://mycompany.zendesk.com/agent/tickets/12345');
  });

  it('handles missing priority', () => {
    const ticket = { ...mockTicket, priority: null };
    const result = formatTicket(ticket, 'test');
    expect(result).toContain('**Priority**: none');
  });
});

describe('formatTicketWithDescription', () => {
  it('includes description section', () => {
    const result = formatTicketWithDescription(mockTicket, 'test');
    expect(result).toContain('### Description');
    expect(result).toContain('Users are unable to log in via SSO');
  });
});

describe('formatTicketList', () => {
  it('returns "No tickets found" for empty list', () => {
    expect(formatTicketList([], 'test')).toBe('No tickets found.');
  });

  it('separates tickets with dividers', () => {
    const result = formatTicketList([mockTicket, mockTicket], 'test');
    expect(result).toContain('---');
  });
});

describe('formatComment', () => {
  it('shows public visibility', () => {
    const result = formatComment(mockComment, 0);
    expect(result).toContain('Public');
  });

  it('shows internal note visibility', () => {
    const internalComment = { ...mockComment, public: false };
    const result = formatComment(internalComment, 0);
    expect(result).toContain('Internal note');
  });

  it('includes comment body', () => {
    const result = formatComment(mockComment, 0);
    expect(result).toContain('I cannot log in via SSO.');
  });

  it('lists attachments', () => {
    const result = formatComment(mockComment, 0);
    expect(result).toContain('screenshot.png');
    expect(result).toContain('image/png');
  });

  it('formats attachment sizes', () => {
    const result = formatComment(mockComment, 0);
    expect(result).toContain('51.2 KB');
  });
});

describe('formatUser', () => {
  it('includes name and ID', () => {
    const result = formatUser(mockUser);
    expect(result).toContain('## Jane Smith (ID: 456)');
  });

  it('includes email and role', () => {
    const result = formatUser(mockUser);
    expect(result).toContain('**Email**: jane@example.com');
    expect(result).toContain('**Role**: end-user');
  });

  it('includes phone when present', () => {
    const result = formatUser(mockUser);
    expect(result).toContain('+15551234567');
  });

  it('includes tags', () => {
    const result = formatUser(mockUser);
    expect(result).toContain('vip');
  });
});
