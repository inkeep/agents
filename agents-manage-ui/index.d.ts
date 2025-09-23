export interface NextOpts {
  dir: string;
  port?: number;
  host?: string;
  env?: Record<string, string>;
}

export function buildNext(opts: NextOpts): Promise<void>;
export function devNext(opts: NextOpts): Promise<void>;
export function startNext(opts: NextOpts): Promise<void>;
