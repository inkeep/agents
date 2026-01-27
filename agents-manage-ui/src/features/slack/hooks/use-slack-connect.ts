'use client';

import Nango from '@nangohq/frontend';
import { useCallback, useState } from 'react';
import { localDb } from '../db';
import type { SlackNotification, SlackUserLink } from '../types';

interface ConnectSlackOptions {
  userId: string;
  userEmail?: string;
  userName?: string;
  tenantId: string;
  slackTeamId?: string;
  inkeepSessionToken?: string;
  inkeepSessionExpiresAt?: string;
  onSuccess?: (link: SlackUserLink) => void;
  onError?: (error: string) => void;
}

export function useSlackConnect() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [notification, setNotification] = useState<SlackNotification | null>(null);

  const connectSlack = useCallback(async (options: ConnectSlackOptions) => {
    const {
      userId,
      userEmail,
      userName,
      tenantId,
      slackTeamId,
      inkeepSessionToken,
      inkeepSessionExpiresAt,
      onSuccess,
      onError,
    } = options;

    if (!userId) {
      const errorMsg = 'Please log in to connect your Slack account';
      setNotification({ type: 'error', message: errorMsg });
      onError?.(errorMsg);
      return;
    }

    setIsConnecting(true);
    setNotification(null);

    console.log('=== INITIATING SLACK USER CONNECTION ===');
    console.log({ userId, userEmail, userName, tenantId });
    console.log('=========================================');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/manage/slack/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userEmail,
          userName,
          tenantId,
          sessionToken: inkeepSessionToken,
          sessionExpiresAt: inkeepSessionExpiresAt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create Nango session');
      }

      const { sessionToken: nangoSessionToken } = await response.json();

      console.log('=== NANGO SESSION TOKEN RECEIVED ===');
      console.log({ sessionToken: nangoSessionToken ? 'present' : 'missing' });
      console.log('====================================');

      const nango = new Nango();
      let hasConnected = false;

      const connect = nango.openConnectUI({
        onEvent: (event) => {
          const eventType = event.type;
          const eventPayload = 'payload' in event ? event.payload : undefined;
          const connectionId =
            eventPayload && 'connectionId' in eventPayload ? eventPayload.connectionId : undefined;

          console.log('=== NANGO CONNECT EVENT ===');
          console.log(JSON.stringify(event, null, 2));
          console.log('===========================');

          if (eventType === 'connect') {
            hasConnected = true;
            setIsConnecting(false);

            const connId = connectionId || userId;

            const newLink: SlackUserLink = {
              slackUserId: '',
              slackTeamId: slackTeamId || '',
              appUserId: userId,
              appUserEmail: userEmail,
              appUserName: userName,
              nangoConnectionId: connId,
              isLinked: true,
              linkedAt: new Date().toISOString(),
            };

            console.log('=== USER LINK CREATED ===');
            console.log(JSON.stringify(newLink, null, 2));
            console.log('=========================');

            localDb.users.upsert({
              id: userId,
              tenantId,
              organizationId: tenantId,
              email: userEmail || '',
              name: userName,
              role: 'member',
              metadata: {},
            });

            localDb.slackUserConnections.upsert({
              slackUserId: '',
              slackWorkspaceId: slackTeamId || '',
              inkeepUserId: userId,
              inkeepUserEmail: userEmail,
              inkeepUserName: userName,
              tenantId,
              organizationId: tenantId,
              slackAppClientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || '',
              nangoConnectionId: connId,
              nangoIntegrationId: 'slack-agent',
              connectedAt: new Date().toISOString(),
              isSlackAdmin: false,
              isSlackOwner: false,
              status: 'active',
              metadata: {},
            });

            localDb.auditLogs.create({
              tenantId,
              userId,
              action: 'connection.create',
              resourceType: 'connection',
              resourceId: connId,
              integrationType: 'slack',
              details: {
                slackTeamId,
                nangoConnectionId: connId,
              },
            });

            console.log('[useSlackConnect] Saved to new database');

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('inkeep-db-update'));
            }

            setNotification({
              type: 'success',
              message: 'Slack account connected successfully!',
            });

            onSuccess?.(newLink);
          } else if (eventType === 'close') {
            setIsConnecting(false);
            if (!hasConnected) {
              const errorMsg = 'Connection cancelled';
              setNotification({ type: 'error', message: errorMsg });
              onError?.(errorMsg);
            }
          }
        },
      });

      connect.setSessionToken(nangoSessionToken);
    } catch (error) {
      console.error('Failed to connect Slack:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to connect Slack account';
      setNotification({ type: 'error', message: errorMsg });
      setIsConnecting(false);
      onError?.(errorMsg);
    }
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return {
    isConnecting,
    notification,
    connectSlack,
    clearNotification,
  };
}
