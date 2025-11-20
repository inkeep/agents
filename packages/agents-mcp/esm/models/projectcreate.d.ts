import * as z from 'zod';
import { type ProjectModel } from './projectmodel.js';
import { type StopWhen } from './stopwhen.js';
export type ProjectCreate = {
    id: string;
    name: string;
    description: string;
    models: ProjectModel | null;
    stopWhen?: StopWhen | null | undefined;
};
export declare const ProjectCreate$zodSchema: z.ZodType<ProjectCreate, z.ZodTypeDef, unknown>;
//# sourceMappingURL=projectcreate.d.ts.map