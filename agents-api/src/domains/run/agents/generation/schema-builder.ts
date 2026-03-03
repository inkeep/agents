import { z } from '@hono/zod-openapi';
import { getLogger } from '../../../../logger';
import {
  ArtifactCreateSchema,
  ArtifactReferenceSchema,
} from '../../artifacts/artifact-component-schema';
import { SchemaProcessor } from '../../utils/SchemaProcessor';
import type { AgentRunContext } from '../agent-types';

const logger = getLogger('Agent');

export function buildDataComponentsSchema(ctx: AgentRunContext): z.ZodType<any> {
  const componentSchemas: z.ZodType<any>[] = [];

  ctx.config.dataComponents?.forEach((dc) => {
    const normalizedProps = SchemaProcessor.makeAllPropertiesRequired(dc.props);
    const propsSchema = z.fromJSONSchema(normalizedProps);
    componentSchemas.push(
      z.object({
        id: z.string(),
        name: z.literal(dc.name),
        props: propsSchema,
      })
    );
  });

  if (ctx.artifactComponents.length > 0) {
    const artifactCreateSchemas = ArtifactCreateSchema.getSchemas(ctx.artifactComponents);
    componentSchemas.push(...artifactCreateSchemas);
    componentSchemas.push(ArtifactReferenceSchema.getSchema());
  }

  let dataComponentsSchema: z.ZodType<any>;
  if (componentSchemas.length === 1) {
    dataComponentsSchema = componentSchemas[0];
    logger.info({ agentId: ctx.config.id }, 'Using single schema (no union needed)');
  } else {
    dataComponentsSchema = z.union(
      componentSchemas as [z.ZodType<any>, z.ZodType<any>, ...z.ZodType<any>[]]
    );
    logger.info({ agentId: ctx.config.id }, 'Created union schema');
  }

  return dataComponentsSchema;
}
