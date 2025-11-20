import { CommandContext, StricliProcess } from "@stricli/core";
export interface LocalContext extends CommandContext {
    readonly process: StricliProcess;
}
export declare function buildContext(process: NodeJS.Process): LocalContext;
//# sourceMappingURL=cli.d.ts.map