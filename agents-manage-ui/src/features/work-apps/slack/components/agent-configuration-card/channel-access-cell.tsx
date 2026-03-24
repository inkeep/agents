import { ChannelAccessPopover } from './channel-access-popover';
import type { Channel } from './types';

interface ChannelAccessCellProps {
  channel: Channel;
  onToggleGrantAccess: (channelId: string, grantAccess: boolean) => void;
}

export function ChannelAccessCell({ channel, onToggleGrantAccess }: ChannelAccessCellProps) {
  if (!channel.hasAgentConfig) return null;

  const grantAccess = channel.agentConfig?.grantAccessToMembers ?? true;

  return (
    <div>
      <ChannelAccessPopover
        grantAccess={grantAccess}
        onToggleGrantAccess={(v) => onToggleGrantAccess(channel.id, v)}
        idPrefix={channel.id}
      />
    </div>
  );
}
