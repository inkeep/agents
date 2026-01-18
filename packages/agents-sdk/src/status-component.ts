import type { StatusComponent as StatusComponentType } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import { convertZodToJsonSchema, isZodSchema } from '@inkeep/agents-core/utils/schema-conversion';
import type { z } from 'zod';

const logger = getLogger('statusComponent');

type StatusComponentConfigWithZod = Omit<StatusComponentType, 'detailsSchema'> & {
  detailsSchema?: Record<string, unknown> | z.ZodObject<any>;
};

export interface StatusComponentInterface {
  config: StatusComponentType;
  getType(): string;
  getDescription(): string | undefined;
  getDetailsSchema(): StatusComponentType['detailsSchema'];
}

export class StatusComponent implements StatusComponentInterface {
  public config: StatusComponentType;

  constructor(config: StatusComponentConfigWithZod) {
    let processedDetailsSchema: StatusComponentType['detailsSchema'];
    if (config.detailsSchema && isZodSchema(config.detailsSchema)) {
      const jsonSchema = convertZodToJsonSchema(config.detailsSchema);
      processedDetailsSchema = {
        type: 'object',
        properties: (jsonSchema.properties as Record<string, any>) || {},
        required: (jsonSchema.required as string[]) || undefined,
      };
    } else {
      processedDetailsSchema = config.detailsSchema as StatusComponentType['detailsSchema'];
    }

    this.config = {
      ...config,
      detailsSchema: processedDetailsSchema,
    };

    logger.info(
      {
        statusComponentType: config.type,
      },
      'StatusComponent constructor initialized'
    );
  }

  getType(): string {
    return this.config.type;
  }

  getDescription(): string | undefined {
    return this.config.description;
  }

  getDetailsSchema(): StatusComponentType['detailsSchema'] {
    return this.config.detailsSchema;
  }
}
