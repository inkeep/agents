import type { Edge, Node } from '@xyflow/react';
import { useEffect } from 'react';
import type { AnimatedEdge } from '@/components/agent/configuration/edge-types';
import type { AnimatedNode } from '@/components/agent/configuration/node-types';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { sentry } from '@/lib/sentry';
import { useDefaultSubAgentIdRef } from '@/components/agent/use-default-sub-agent-id-ref';

export function useAnimateGraph(): void {
  const defaultSubAgentIdRef = useDefaultSubAgentIdRef();

  useEffect(() => {
    const animateGraph: EventListenerOrEventListenerObject = (event) => {
      // @ts-expect-error -- improve types
      const data = event.detail;

      const { playgroundConversationId } = agentStore.getState();
      if (data.conversationId !== playgroundConversationId) {
        return;
      }

      agentStore.setState((state) => {
        const { edges: prevEdges, nodes: prevNodes } = state;

        function updateNodeStatus(
          cb: (node: Node<AnimatedNode & Record<string, unknown>>) => AnimatedNode['status']
        ) {
          return prevNodes.map((node) => {
            return {
              ...node,
              data: {
                ...node.data,
                status: cb(node),
              },
            };
          });
        }
        function updateEdgeStatus(
          cb: (edge: Edge<AnimatedEdge & Record<string, unknown>>) => AnimatedEdge['status']
        ) {
          return prevEdges.map((node) => {
            return {
              ...node,
              data: {
                ...node.data,
                status: cb(node),
              },
            };
          });
        }
        switch (data.type) {
          case 'agent_initializing': {
            return {
              nodes: updateNodeStatus((node) => {
                // this prevents the node from highlighting if the copilot triggers this event
                if (data?.details?.agentId !== /* agentId */ location.pathname.split('/')[5]) {
                  return;
                }
                if (node.id === defaultSubAgentIdRef.current) {
                  return 'delegating';
                }
                return node.data.status;
              }),
            };
          }
          case 'delegation_sent':
          case 'transfer': {
            const { fromSubAgent, targetSubAgent } = data.details?.data || {};

            return {
              edges: updateEdgeStatus((edge) =>
                edge.source === fromSubAgent && edge.target === targetSubAgent
                  ? 'delegating'
                  : edge.data?.status
              ),
              nodes: updateNodeStatus((node) =>
                node.id === fromSubAgent || node.id === targetSubAgent
                  ? 'delegating'
                  : node.data.status
              ),
            };
          }
          case 'delegation_returned': {
            const { targetSubAgent, fromSubAgent } = data.details?.data || {};
            return {
              edges: updateEdgeStatus((edge) =>
                edge.source === targetSubAgent && edge.target === fromSubAgent
                  ? 'inverted-delegating'
                  : edge.data?.status
              ),
              nodes: updateNodeStatus((node) => {
                if (node.id === targetSubAgent) {
                  return 'delegating';
                }
                return node.id === fromSubAgent ? 'inverted-delegating' : node.data.status;
              }),
            };
          }
          case 'tool_call': {
            const relationshipId = data.details?.data?.relationshipId;
            if (!relationshipId) {
              const error = new Error('[type: tool_call] relationshipId is missing');
              sentry.captureException(error, { extra: data });
              console.warn(error);
            }
            return {
              edges: updateEdgeStatus((edge) => {
                const node = prevNodes.find((node) => node.id === edge.target);
                return !!relationshipId && relationshipId === node?.data.relationshipId
                  ? 'delegating'
                  : edge.data?.status;
              }),
              nodes: updateNodeStatus((node) =>
                node.data.id === data.details?.subAgentId ||
                (relationshipId && relationshipId === node.data.relationshipId)
                  ? 'delegating'
                  : node.data.status
              ),
            };
          }
          case 'error': {
            const { relationshipId, agent } = data.details?.data ?? {};
            if (!relationshipId && !data.agent && !agent) {
              const error = new Error(`[type: error] relationshipId is missing`);
              sentry.captureException(error, { extra: data });
              console.warn(error);
            }
            return {
              nodes: updateNodeStatus((node) =>
                relationshipId === node.data.relationshipId ||
                [agent, data.agent].includes(node.data.id)
                  ? 'error'
                  : node.data.status
              ),
            };
          }
          case 'tool_result': {
            const relationshipId = data.details?.data?.relationshipId;
            if (!relationshipId) {
              const error = new Error('[type: tool_result] relationshipId is missing');
              sentry.captureException(error, { extra: data });
              console.warn(error);
            }
            return {
              edges: updateEdgeStatus((edge) => {
                const node = prevNodes.find((node) => node.id === edge.target);

                return data.details?.subAgentId === edge.source &&
                  relationshipId &&
                  relationshipId === node?.data.relationshipId
                  ? 'inverted-delegating'
                  : edge.data?.status;
              }),
              nodes: updateNodeStatus((node) => {
                if (relationshipId && relationshipId === node.data.relationshipId) {
                  return data.details?.data?.error ? 'error' : 'inverted-delegating';
                }
                if (node.id === data.details?.subAgentId) {
                  return 'delegating';
                }

                return node.data.status;
              }),
            };
          }
          case 'completion': {
            return {
              edges: updateEdgeStatus(() => null),
              nodes: updateNodeStatus(() => null),
            };
          }
          case 'agent_reasoning':
          case 'agent_generate': {
            return {
              nodes: updateNodeStatus((node) =>
                node.id === data.details?.subAgentId ? 'executing' : node.data.status
              ),
            };
          }
        }
        return state;
      });
    };

    const onCompletion = () => {
      animateGraph({
        // @ts-expect-error
        detail: {
          type: 'completion',
        },
      });
    };

    document.addEventListener('ikp-data-operation', animateGraph);
    document.addEventListener('ikp-aborted', onCompletion);
    return () => {
      document.removeEventListener('ikp-data-operation', animateGraph);
      document.removeEventListener('ikp-aborted', onCompletion);
    };
  }, []);
}
