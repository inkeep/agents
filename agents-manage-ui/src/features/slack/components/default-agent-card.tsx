'use client';

import { Bot, Check, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getAllAgentsForSlack, type SlackAgentOption } from '../actions/agents';
import { slackApi } from '../api/slack-api';
import { useSlack } from '../context/slack-provider';
import { localDb } from '../db';

type Agent = SlackAgentOption;

interface DefaultAgentConfig {
  agentId: string;
  agentName: string;
  projectId: string;
  projectName: string;
}

export function DefaultAgentCard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { latestWorkspace, actions } = useSlack();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<DefaultAgentConfig | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const loadSavedDefault = async () => {
      if (typeof window === 'undefined') return;

      const workspaces = localDb.workspaces.findAll();
      if (workspaces.length > 0) {
        const workspace = workspaces[0];
        const defaultAgent = workspace.metadata?.defaultAgent as DefaultAgentConfig | undefined;
        if (defaultAgent) {
          setSelectedAgent(defaultAgent);
          return;
        }
      }

      if (latestWorkspace?.teamId) {
        try {
          const settings = await slackApi.getWorkspaceSettings(latestWorkspace.teamId);
          if (settings.defaultAgent) {
            setSelectedAgent(settings.defaultAgent);
          }
        } catch {
          console.log('No saved workspace settings found');
        }
      }
    };

    loadSavedDefault();
  }, [latestWorkspace?.teamId]);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const result = await getAllAgentsForSlack(tenantId);
      if (result.success) {
        setAgents(result.data);
      } else {
        console.error('Failed to fetch agents:', result.error);
        actions.setNotification({
          type: 'error',
          message: 'Failed to load agents. Make sure you have projects configured.',
          action: 'error',
        });
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      actions.setNotification({
        type: 'error',
        message: 'Failed to load agents. Make sure you are logged in.',
        action: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAgent = async (agent: Agent) => {
    const config: DefaultAgentConfig = {
      agentId: agent.id,
      agentName: agent.name || agent.id,
      projectId: agent.projectId,
      projectName: agent.projectName || 'Unknown Project',
    };

    setSelectedAgent(config);
    setOpen(false);
    setSaving(true);

    try {
      const workspaces = localDb.workspaces.findAll();
      if (workspaces.length > 0) {
        const workspace = workspaces[0];
        localDb.workspaces.upsert({
          ...workspace,
          metadata: {
            ...workspace.metadata,
            defaultAgent: config,
          },
        });
      }

      if (latestWorkspace?.teamId) {
        await slackApi.setWorkspaceDefaultAgent({
          teamId: latestWorkspace.teamId,
          defaultAgent: config,
        });
      }

      actions.setNotification({
        type: 'success',
        message: `Default agent set to "${config.agentName}"`,
        action: 'connected',
      });
    } catch (error) {
      console.error('Failed to save default agent:', error);
      actions.setNotification({
        type: 'error',
        message: 'Failed to save default agent',
        action: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Default Agent
        </CardTitle>
        <CardDescription>
          Set the default agent for @mentions and /inkeep commands in Slack
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!mounted ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded w-full" />
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="flex-1 justify-between"
                    onClick={() => {
                      if (agents.length === 0) {
                        fetchAgents();
                      }
                    }}
                  >
                    {selectedAgent ? (
                      <span className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        {selectedAgent.agentName}
                        <span className="text-muted-foreground text-xs">
                          ({selectedAgent.projectName})
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select an agent...</span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search agents..." />
                    <CommandList>
                      <CommandEmpty>
                        {loading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="ml-2">Loading agents...</span>
                          </div>
                        ) : (
                          'No agents found.'
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {agents.map((agent) => (
                          <CommandItem
                            key={agent.id}
                            value={`${agent.name} ${agent.projectName}`}
                            onSelect={() => handleSelectAgent(agent)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedAgent?.agentId === agent.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{agent.name || agent.id}</span>
                              <span className="text-xs text-muted-foreground">
                                {agent.projectName || 'Unknown Project'}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="icon"
                onClick={fetchAgents}
                disabled={loading}
                title="Refresh agents"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            {saving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </div>
            )}

            {selectedAgent && !saving && (
              <div className="text-sm text-muted-foreground">
                All @Inkeep mentions and /inkeep commands will use{' '}
                <strong>{selectedAgent.agentName}</strong> by default.
              </div>
            )}

            {!selectedAgent && !saving && (
              <div className="text-sm text-muted-foreground">
                No default agent configured. Users will be prompted to select an agent.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
