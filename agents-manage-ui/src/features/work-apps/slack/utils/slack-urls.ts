const VALID_SLACK_DOMAIN = /^[a-z0-9-]+$/;

export function getSlackProfileUrl(slackUserId: string, teamDomain?: string): string {
  if (teamDomain && VALID_SLACK_DOMAIN.test(teamDomain)) {
    return `https://${teamDomain}.slack.com/team/${slackUserId}`;
  }
  return `https://app.slack.com/team/${slackUserId}`;
}
