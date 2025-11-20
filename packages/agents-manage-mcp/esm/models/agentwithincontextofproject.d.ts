import * as z from "zod";
import { AgentStopWhen } from "./agentstopwhen.js";
import { ContextConfigCreate } from "./contextconfigcreate.js";
import { ExternalAgentCreate } from "./externalagentcreate.js";
import { FullAgentAgentInsert } from "./fullagentagentinsert.js";
import { FunctionCreate } from "./functioncreate.js";
import { FunctionToolCreate } from "./functiontoolcreate.js";
import { Model } from "./model.js";
import { StatusUpdate } from "./statusupdate.js";
import { TeamAgent } from "./teamagent.js";
import { ToolCreate } from "./toolcreate.js";
export type AgentWithinContextOfProject = {
    id: string;
    name: string;
    description?: string | null | undefined;
    defaultSubAgentId?: string | null | undefined;
    contextConfigId?: string | null | undefined;
    models?: Model | undefined;
    statusUpdates?: StatusUpdate | undefined;
    prompt?: string | undefined;
    stopWhen?: AgentStopWhen | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    subAgents: {
        [k: string]: FullAgentAgentInsert;
    };
    tools?: {
        [k: string]: ToolCreate;
    } | undefined;
    externalAgents?: {
        [k: string]: ExternalAgentCreate;
    } | undefined;
    teamAgents?: {
        [k: string]: TeamAgent;
    } | undefined;
    functionTools?: {
        [k: string]: FunctionToolCreate;
    } | undefined;
    functions?: {
        [k: string]: FunctionCreate;
    } | undefined;
    contextConfig?: ContextConfigCreate | undefined;
};
export declare const AgentWithinContextOfProject$zodSchema: z.ZodType<AgentWithinContextOfProject, z.ZodTypeDef, unknown>;
//# sourceMappingURL=agentwithincontextofproject.d.ts.map