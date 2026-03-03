import { branchesMergeBranch } from "../../funcs/branchesMergeBranch.js";
import { MergeBranchRequest$zodSchema } from "../../models/mergebranchop.js";
import { formatResult, ToolDefinition } from "../tools.js";

const args = {
  request: MergeBranchRequest$zodSchema,
};

export const tool$branchesMergeBranch: ToolDefinition<typeof args> = {
  name: "branches-merge-branch",
  description: `Merge Branch

Merge a branch into the project main branch.`,
  annotations: {
    "title": "",
    "destructiveHint": false,
    "idempotentHint": false,
    "openWorldHint": false,
    "readOnlyHint": false,
  },
  args,
  tool: async (client, args, ctx) => {
    const [result, apiCall] = await branchesMergeBranch(
      client,
      args.request,
      { fetchOptions: { signal: ctx.signal } },
    ).$inspect();

    if (!result.ok) {
      return {
        content: [{ type: "text", text: result.error.message }],
        isError: true,
      };
    }

    const value = result.value;

    return formatResult(value, apiCall);
  },
};
