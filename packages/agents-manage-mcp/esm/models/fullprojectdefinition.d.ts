import * as z from "zod";
import { AgentWithinContextOfProject } from "./agentwithincontextofproject.js";
import { ArtifactComponentCreate } from "./artifactcomponentcreate.js";
import { CredentialReferenceCreate } from "./credentialreferencecreate.js";
import { DataComponentCreate } from "./datacomponentcreate.js";
import { ExternalAgentCreate } from "./externalagentcreate.js";
import { FunctionCreate } from "./functioncreate.js";
import { FunctionToolCreate } from "./functiontoolcreate.js";
import { ProjectModel } from "./projectmodel.js";
import { StatusUpdate } from "./statusupdate.js";
import { StopWhen } from "./stopwhen.js";
import { ToolCreate } from "./toolcreate.js";
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