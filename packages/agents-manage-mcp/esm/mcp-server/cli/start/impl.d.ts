import { SDKOptions } from "../../../lib/config.js";
import { LocalContext } from "../../cli.js";
import { ConsoleLoggerLevel } from "../../console-logger.js";
interface StartCommandFlags {
    readonly transport: "stdio" | "sse";
    readonly port: number;
    readonly tool?: string[];
    readonly "server-url"?: string;
    readonly "server-index"?: SDKOptions["serverIdx"];
    readonly "log-level": ConsoleLoggerLevel;
    readonly env?: [string, string][];
}
export declare function main(this: LocalContext, flags: StartCommandFlags): Promise<void>;
export {};
//# sourceMappingURL=impl.d.ts.map