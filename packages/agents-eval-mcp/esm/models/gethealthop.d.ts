import * as z from 'zod';
export type GetHealthResponse = {
  ContentType: string;
  StatusCode: number;
  RawResponse: Response;
};
export declare const GetHealthResponse$zodSchema: z.ZodType<
  GetHealthResponse,
  z.ZodTypeDef,
  unknown
>;
//# sourceMappingURL=gethealthop.d.ts.map
