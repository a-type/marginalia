import { QueryClient } from '@tanstack/react-query';
import { DbClient } from '@tanstack/react-db';

export function getContext() {
  const queryClient = new QueryClient();
  const dbClient = new DbClient();

  return {
    dbClient,
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
