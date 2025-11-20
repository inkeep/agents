type BinaryData = Uint8Array | ArrayBuffer | Blob | ReadableStream | Response | string;
export declare function bytesToBase64(u8arr: Uint8Array): string;
export declare function consumeStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array>;
export declare function isAsyncIterable(value: unknown): value is AsyncIterable<string>;
export declare function isBinaryData(value: unknown): value is BinaryData;
export declare function valueToBase64(value: BinaryData | null | undefined): Promise<string | null>;
export {};
//# sourceMappingURL=shared.d.ts.map