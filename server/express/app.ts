import express, { type ErrorRequestHandler } from 'express';
import { AppError, type Deps } from '../core';
import { errorResponse, routes } from '../routes';

/** Thin HTTP wrapper: serves the shared route table (routes.ts) as Express routes. */
export function createApp(deps: Deps) {
  const app = express();
  app.use(express.json());

  for (const route of routes) {
    // API Gateway writes params as {id}, Express as :id.
    const path = route.path.replace(/\{(\w+)\}/g, ':$1');
    app[route.method.toLowerCase() as 'get'](path, async (req, res) => {
      const params = req.params as Record<string, string>;
      res.status(route.status).json(await route.run(deps, { params, body: req.body, authorization: req.get('authorization') }));
    });
  }

  app.use('/api', () => {
    throw new AppError('NOT_FOUND', 'No such API route');
  });
  app.use(errorHandler);
  return app;
}

// Express 5 forwards rejected promises here.
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const { status, body } =
    (error as { type?: string }).type === 'entity.parse.failed'
      ? errorResponse(new AppError('BAD_REQUEST', 'Request body is not valid JSON'))
      : errorResponse(error);
  res.status(status).json(body);
};
