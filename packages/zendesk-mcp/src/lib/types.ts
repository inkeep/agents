export interface ZendeskTicket {
  id: number;
  url: string;
  subject: string;
  raw_subject: string;
  description: string;
  status: string;
  type: string | null;
  priority: string | null;
  requester_id: number;
  submitter_id: number;
  assignee_id: number | null;
  group_id: number | null;
  organization_id: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  due_at: string | null;
  via: { channel: string };
  satisfaction_rating: { score: string; comment?: string } | null;
  custom_fields: Array<{ id: number; value: string | null }>;
}

export interface ZendeskComment {
  id: number;
  type: string;
  body: string;
  html_body: string;
  plain_body: string;
  author_id: number;
  public: boolean;
  created_at: string;
  attachments: Array<{
    id: number;
    file_name: string;
    content_url: string;
    content_type: string;
    size: number;
  }>;
}

export interface ZendeskUser {
  id: number;
  url: string;
  name: string;
  email: string;
  alias: string | null;
  role: string;
  active: boolean;
  verified: boolean;
  organization_id: number | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  phone: string | null;
  tags: string[];
  notes: string;
  details: string;
}

export interface ZendeskSearchResponse {
  results: ZendeskTicket[];
  count: number;
  next_page: string | null;
  previous_page: string | null;
}

export interface ZendeskTicketResponse {
  ticket: ZendeskTicket;
}

export interface ZendeskCommentsResponse {
  comments: ZendeskComment[];
  meta?: { has_more: boolean; after_cursor?: string; before_cursor?: string };
  links?: { next: string | null; prev: string | null };
  count?: number;
  next_page?: string | null;
}

export interface ZendeskUsersSearchResponse {
  users: ZendeskUser[];
  count: number;
  next_page: string | null;
  previous_page: string | null;
}

export interface ZendeskTicketsListResponse {
  tickets: ZendeskTicket[];
  meta?: { has_more: boolean; after_cursor?: string; before_cursor?: string };
  links?: { next: string | null; prev: string | null };
}
