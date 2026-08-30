import { isNotFound, isRedirect } from '@tanstack/react-router';
import { createMiddleware, createStart } from '@tanstack/react-start';

import { AppError, AppErrorCode } from './lib/error';
import { logger } from './logger';

const errorHandlingMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (err) {
      // redirects and not-found responses are control flow, not errors
      if (isRedirect(err) || isNotFound(err)) {
        throw err;
      }
      const appError = AppError.fromInstanceOrRpc(err);
      if (appError.code >= AppErrorCode.InternalServerError) {
        logger.fatal(...(await appError.toLogs()));
      }
      throw appError;
    }
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [errorHandlingMiddleware],
}));
