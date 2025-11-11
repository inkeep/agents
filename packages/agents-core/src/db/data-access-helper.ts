import type { DatabaseClient } from './client';
import type { ResolvedRef } from '../dolt/ref';
import { withRefConnection } from './ref-connection';

export const createDataAccessFn = <TParams, TResult>(
  queryFn: (db: DatabaseClient, params: TParams) => Promise<TResult>
) => {
  return (db: DatabaseClient, ref?: ResolvedRef) =>
    async (params: TParams): Promise<TResult> => {
      const execute = (db: DatabaseClient) => queryFn(db, params);

      if (ref) {
        return withRefConnection(db, ref, execute);
      }
      return execute(db);
    };
};
