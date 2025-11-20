export declare class APIError extends Error {
    readonly httpMeta: {
        response: Response;
        request: Request;
        body: string;
    };
    constructor(message: string, httpMeta: {
        response: Response;
        request: Request;
        body: string;
    });
}
//# sourceMappingURL=apierror.d.ts.map