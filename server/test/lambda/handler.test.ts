import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { describe, expect, it } from 'vitest';
import { handle, loadSecrets, type HttpEvent } from '../../lambda/handler';
import { fakeDeps } from '../helpers/fakes';

/** Sends one API Gateway-style event and parses the JSON reply. */
function client(deps = fakeDeps().deps) {
  return async (routeKey: string, { params, token, body, raw, base64 }: { params?: Record<string, string>; token?: string; body?: unknown; raw?: string; base64?: boolean } = {}) => {
    const text = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const event: HttpEvent = {
      routeKey,
      pathParameters: params,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: text && base64 ? Buffer.from(text).toString('base64') : text,
      isBase64Encoded: Boolean(base64),
    };
    const res = await handle(deps, event);
    expect(res.headers['content-type']).toBe('application/json');
    return { status: res.statusCode, json: JSON.parse(res.body) };
  };
}

const session = { name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' };

describe('lambda handler', () => {
  it('serves health without a session', async () => {
    expect(await client()('GET /api/health')).toEqual({ status: 200, json: { ok: true } });
  });

  it('creates a bill and reads it back through path parameters', async () => {
    const api = client();
    const { json: signedIn } = await api('POST /api/session', { body: session });
    const created = await api('POST /api/bills', { token: signedIn.token });
    const id = created.json.bill.id as string;

    expect(created.status).toBe(201);
    await api('PATCH /api/bills/{id}', { token: signedIn.token, params: { id }, body: { title: 'Dinner' } });
    const read = await api('GET /api/bills/{id}', { token: signedIn.token, params: { id } });
    expect(read).toMatchObject({ status: 200, json: { bill: { id, title: 'Dinner' } } });
  });

  it('reads a base64-encoded body', async () => {
    const { status } = await client()('POST /api/session', { body: session, base64: true });

    expect(status).toBe(201);
  });

  it('maps errors to the same shape as Express', async () => {
    const api = client();

    expect(await api('GET /api/bills/{id}', { params: { id: 'x' } })).toMatchObject({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
    expect(await api('POST /api/session', { raw: '{bad json' })).toMatchObject({ status: 400, json: { error: { code: 'BAD_REQUEST' } } });
    expect(await api('GET /api/nope')).toMatchObject({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
});

describe('loadSecrets', () => {
  const fakeSsm = (values: Record<string, string>) => {
    const asked: string[][] = [];
    return {
      asked,
      ssm: {
        send: async (command: GetParametersCommand) => {
          const names = command.input.Names ?? [];
          asked.push(names);
          return {
            Parameters: names.filter((n) => n in values).map((Name) => ({ Name, Value: values[Name] })),
            InvalidParameters: names.filter((n) => !(n in values)),
          };
        },
      } as never,
    };
  };

  it('asks only for the parameters this function was given', async () => {
    const { ssm, asked } = fakeSsm({ '/harngun/dev-auth-secret': 's3cret' });

    expect(await loadSecrets({ DEV_AUTH_SECRET_PARAM: '/harngun/dev-auth-secret' }, ssm)).toEqual({ DEV_AUTH_SECRET: 's3cret' });
    expect(asked).toEqual([['/harngun/dev-auth-secret']]);
  });

  it('skips SSM when no parameter names are set', async () => {
    const { ssm, asked } = fakeSsm({});

    expect(await loadSecrets({}, ssm)).toEqual({});
    expect(asked).toEqual([]);
  });

  it('refuses to start when a parameter is missing', async () => {
    const { ssm } = fakeSsm({});

    await expect(loadSecrets({ GEMINI_API_KEY_PARAM: '/harngun/gemini-api-key' }, ssm)).rejects.toThrow('/harngun/gemini-api-key');
  });
});
