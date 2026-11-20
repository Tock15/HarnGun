import { GetParametersCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { AppError, type Deps } from '../core';
import { errorResponse, routes, type Route } from '../routes';

/** Request handling for the Lambda entry point (lambda/index.ts), kept apart so tests can pass fake deps. */

/** The parts of an API Gateway HTTP API (payload 2.0) event we read. */
export interface HttpEvent {
  routeKey: string;
  pathParameters?: Record<string, string>;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const byRouteKey = new Map<string, Route>(routes.map((route) => [`${route.method} ${route.path}`, route]));

export async function handle(deps: Deps, event: HttpEvent): Promise<HttpResult> {
  try {
    const route = byRouteKey.get(event.routeKey);
    if (!route) throw new AppError('NOT_FOUND', 'No such API route');
    const params = event.pathParameters ?? {};
    const body = await route.run(deps, { params, body: readBody(event), authorization: event.headers?.authorization });
    return json(route.status, body);
  } catch (error) {
    const { status, body } = errorResponse(error);
    return json(status, body);
  }
}

function readBody(event: HttpEvent): unknown {
  if (!event.body) return undefined;
  const text = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body is not valid JSON');
  }
}

const json = (statusCode: number, body: unknown): HttpResult => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Secrets live in SSM Parameter Store; the template passes only their names (`*_PARAM`).
 * A function gets only the names it may read, e.g. only ParseReceipt gets the Gemini key.
 */
export async function loadSecrets(env: NodeJS.ProcessEnv, ssm: Pick<SSMClient, 'send'>): Promise<Record<string, string>> {
  const wanted = Object.entries({ DEV_AUTH_SECRET: env.DEV_AUTH_SECRET_PARAM, GEMINI_API_KEY: env.GEMINI_API_KEY_PARAM }).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  if (wanted.length === 0) return {};

  const { Parameters = [], InvalidParameters = [] } = await ssm.send(
    new GetParametersCommand({ Names: wanted.map(([, name]) => name), WithDecryption: true }),
  );
  if (InvalidParameters.length > 0) throw new Error(`Missing SSM parameters: ${InvalidParameters.join(', ')}`);
  return Object.fromEntries(wanted.map(([key, name]) => [key, Parameters.find((p) => p.Name === name)?.Value ?? '']));
}
