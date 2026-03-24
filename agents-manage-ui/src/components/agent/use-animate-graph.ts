import type { Edge, Node } from '@xyflow/react';
import { useEffect } from 'react';
import type { AnimatedEdge } from '@/components/agent/configuration/edge-types';
import { type AnimatedNode, NodeType } from '@/components/agent/configuration/node-types';
import { useDefaultSubAgentNodeIdRef } from '@/components/agent/use-default-sub-agent-id-ref';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { findSubAgentNodeId, getSubAgentIdForNode } from '@/features/agent/domain';
import { agentStore } from '@/features/agent/state/use-agent-store';
import { sentry } from '@/lib/sentry';

export function useAnimateGraph(): void {
  const form = useFullAgentFormContext();
  const defaultSubAgentNodeIdRef = useDefaultSubAgentNodeIdRef();

  // biome-ignore lint/correctness/useExhaustiveDependencies: subscribe once and read latest form values imperatively
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
        const subAgentFormData = form.getValues('subAgents');

        const resolveSubAgentNodeId = (subAgentId?: string | null) =>
          findSubAgentNodeId(prevNodes, subAgentId, subAgentFormData) ?? subAgentId;

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
                if (node.id === defaultSubAgentNodeIdRef.current) {
                  return 'delegating';
                }
                return node.data.status;
              }),
            };
          }
          case 'delegation_sent':
          case 'transfer': {
            const { fromSubAgent, targetSubAgent } = data.details?.data || {};
            const fromNodeId = resolveSubAgentNodeId(fromSubAgent);
            const targetNodeId = resolveSubAgentNodeId(targetSubAgent);

            return {
              edges: updateEdgeStatus((edge) =>
                edge.source === fromNodeId && edge.target === targetNodeId
                  ? 'delegating'
                  : edge.data?.status
              ),
              nodes: updateNodeStatus((node) =>
                node.id === fromNodeId || node.id === targetNodeId ? 'delegating' : node.data.status
              ),
            };
          }
          case 'delegation_returned': {
            const { targetSubAgent, fromSubAgent } = data.details?.data || {};
            const targetNodeId = resolveSubAgentNodeId(targetSubAgent);
            const fromNodeId = resolveSubAgentNodeId(fromSubAgent);
            return {
              edges: updateEdgeStatus((edge) =>
                edge.source === targetNodeId && edge.target === fromNodeId
                  ? 'inverted-delegating'
                  : edge.data?.status
              ),
              nodes: updateNodeStatus((node) => {
                if (node.id === targetNodeId) {
                  return 'delegating';
                }
                return node.id === fromNodeId ? 'inverted-delegating' : node.data.status;
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
              nodes: updateNodeStatus((node) => {
                const subAgentId =
                  node.type === NodeType.SubAgent
                    ? getSubAgentIdForNode(node, subAgentFormData)
                    : undefined;
                return subAgentId === data.details?.subAgentId ||
                  (relationshipId && relationshipId === node.data.relationshipId)
                  ? 'delegating'
                  : node.data.status;
              }),
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
              nodes: updateNodeStatus((node) => {
                const subAgentId =
                  node.type === NodeType.SubAgent
                    ? getSubAgentIdForNode(node, subAgentFormData)
                    : undefined;
                return relationshipId === node.data.relationshipId ||
                  [agent, data.agent].includes(subAgentId)
                  ? 'error'
                  : node.data.status;
              }),
            };
          }
          case 'tool_result': {
            const relationshipId = data.details?.data?.relationshipId;
            const subAgentNodeId = resolveSubAgentNodeId(data.details?.subAgentId);
            if (!relationshipId) {
              const error = new Error('[type: tool_result] relationshipId is missing');
              sentry.captureException(error, { extra: data });
              console.warn(error);
            }
            return {
              edges: updateEdgeStatus((edge) => {
                const node = prevNodes.find((node) => node.id === edge.target);

                return subAgentNodeId === edge.source &&
                  relationshipId &&
                  relationshipId === node?.data.relationshipId
                  ? 'inverted-delegating'
                  : edge.data?.status;
              }),
              nodes: updateNodeStatus((node) => {
                if (relationshipId && relationshipId === node.data.relationshipId) {
                  return data.details?.data?.error ? 'error' : 'inverted-delegating';
                }
                if (node.id === subAgentNodeId) {
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
            const subAgentNodeId = resolveSubAgentNodeId(data.details?.subAgentId);
            return {
              nodes: updateNodeStatus((node) =>
                node.id === subAgentNodeId ? 'executing' : node.data.status
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
