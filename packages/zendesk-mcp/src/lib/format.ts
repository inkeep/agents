import type { ZendeskComment, ZendeskTicket, ZendeskUser } from './types.js';

export function formatTicket(ticket: ZendeskTicket, subdomain: string): string {
  const lines: string[] = [
    `## Ticket #${ticket.id}: ${ticket.subject}`,
    '',
    `- **Status**: ${ticket.status}`,
    `- **Priority**: ${ticket.priority ?? 'none'}`,
    `- **Type**: ${ticket.type ?? 'none'}`,
  ];

  if (ticket.assignee_id) lines.push(`- **Assignee ID**: ${ticket.assignee_id}`);
  if (ticket.requester_id) lines.push(`- **Requester ID**: ${ticket.requester_id}`);
  if (ticket.organization_id) lines.push(`- **Organization ID**: ${ticket.organization_id}`);
  if (ticket.tags.length > 0) lines.push(`- **Tags**: ${ticket.tags.join(', ')}`);
  lines.push(`- **Created**: ${ticket.created_at}`);
  lines.push(`- **Updated**: ${ticket.updated_at}`);
  if (ticket.due_at) lines.push(`- **Due**: ${ticket.due_at}`);
  lines.push(`- **Channel**: ${ticket.via?.channel ?? 'unknown'}`);
  lines.push(`- **URL**: https://${subdomain}.zendesk.com/agent/tickets/${ticket.id}`);

  return lines.join('\n');
}

export function formatTicketWithDescription(ticket: ZendeskTicket, subdomain: string): string {
  const header = formatTicket(ticket, subdomain);
  return `${header}\n\n### Description\n\n${ticket.description ?? '(no description)'}`;
}

export function formatTicketList(tickets: ZendeskTicket[], subdomain: string): string {
  if (tickets.length === 0) return 'No tickets found.';
  return tickets.map((t) => formatTicket(t, subdomain)).join('\n\n---\n\n');
}

export function formatComment(comment: ZendeskComment, index: number): string {
  const visibility = comment.public ? 'Public' : 'Internal note';
  const lines: string[] = [
    `### Comment ${index + 1} (${visibility})`,
    `- **Author ID**: ${comment.author_id}`,
    `- **Created**: ${comment.created_at}`,
    '',
    comment.body,
  ];
  if (comment.attachments.length > 0) {
    lines.push('', '**Attachments:**');
    for (const a of comment.attachments) {
      lines.push(`- ${a.file_name} (${a.content_type}, ${formatBytes(a.size)})`);
    }
  }
  return lines.join('\n');
}

export function formatUser(user: ZendeskUser): string {
  const lines: string[] = [
    `## ${user.name} (ID: ${user.id})`,
    '',
    `- **Email**: ${user.email}`,
    `- **Role**: ${user.role}`,
    `- **Active**: ${user.active}`,
  ];
  if (user.organization_id) lines.push(`- **Organization ID**: ${user.organization_id}`);
  if (user.phone) lines.push(`- **Phone**: ${user.phone}`);
  if (user.tags.length > 0) lines.push(`- **Tags**: ${user.tags.join(', ')}`);
  lines.push(`- **Created**: ${user.created_at}`);
  if (user.last_login_at) lines.push(`- **Last login**: ${user.last_login_at}`);
  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
