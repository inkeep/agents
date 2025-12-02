import * as z from 'zod';
import { type AgentWithinContextOfProject } from './agentwithincontextofproject.js';
import { type ArtifactComponentCreate } from './artifactcomponentcreate.js';
import { type CredentialReferenceCreate } from './credentialreferencecreate.js';
import { type DataComponentCreate } from './datacomponentcreate.js';
import { type ExternalAgentCreate } from './externalagentcreate.js';
import { type FunctionCreate } from './functioncreate.js';
import { type FunctionToolCreate } from './functiontoolcreate.js';
import { type ProjectModel } from './projectmodel.js';
import { type StatusUpdate } from './statusupdate.js';
import { type StopWhen } from './stopwhen.js';
import { type ToolCreate } from './toolcreate.js';
export type FullProjectDefinition = {
    id: string;
    name: string;
    description: string;
    models: ProjectModel | null;
    stopWhen?: StopWhen | null | undefined;
    agents: {
        [k: string]: AgentWithinContextOfProject;
    };
    tools: {
        [k: string]: ToolCreate;
    };
    functionTools?: {
        [k: string]: FunctionToolCreate;
    } | undefined;
    functions?: {
        [k: string]: FunctionCreate;
    } | undefined;
    dataComponents?: {
        [k: string]: DataComponentCreate;
    } | undefined;
    artifactComponents?: {
        [k: string]: ArtifactComponentCreate;
    } | undefined;
    externalAgents?: {
        [k: string]: ExternalAgentCreate;
    } | undefined;
    statusUpdates?: StatusUpdate | undefined;
    credentialReferences?: {
        [k: string]: CredentialReferenceCreate;
    } | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
};
export declare const FullProjectDefinition$zodSchema: z.ZodType<FullProjectDefinition, z.ZodTypeDef, unknown>;
//# sourceMappingURL=fullprojectdefinition.d.ts.map