import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../express/app';
import { failingParser, fakeDeps } from '../helpers/fakes';

let server: Server | undefined;

afterEach(() => {
  server?.close();
});

/** Starts the app on a free port and returns a tiny client for it. */
function start(deps = fakeDeps().deps) {
  server = createApp(deps).listen(0);
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return async (method: string, path: string, { token, body, raw }: { token?: string; body?: unknown; raw?: string } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };
}

async function signIn(api: ReturnType<typeof start>) {
  const { json } = await api('POST', '/api/session', { body: { name: 'Koses', promptPayId: '0812345678', promptPayType: 'PHONE' } });
  return json.token as string;
}

describe('express app', () => {
  it('GET /api/health returns ok', async () => {
    const api = start();

    expect(await api('GET', '/api/health')).toEqual({ status: 200, json: { ok: true } });
  });

  it('creates a bill with 201 and polls it with 304 until it changes', async () => {
    const api = start();
    const token = await signIn(api);
    const created = await api('POST', '/api/bills', { token });
    const { id, version } = created.json.bill;

    expect(created.status).toBe(201);
    expect((await api('GET', `/api/bills/${id}?since=${version}`, { token })).status).toBe(304);
    await api('PATCH', `/api/bills/${id}`, { token, body: { title: 'Dinner' } });
    const changed = await api('GET', `/api/bills/${id}?since=${version}`, { token });
    expect(changed.status).toBe(200);
    expect(changed.json.bill.title).toBe('Dinner');
    expect(changed.json.split.guard.status).toBe('INCOMPLETE');
  });

  it('maps core errors to status codes with one error shape', async () => {
    const api = start();
    const token = await signIn(api);
    const { json } = await api('POST', '/api/bills', { token });

    expect(await api('GET', '/api/bills/x')).toMatchObject({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } });
    expect(await api('GET', '/api/bills/missing', { token })).toMatchObject({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
    expect(await api('POST', `/api/receipts/${json.bill.id}/parse`, { token })).toMatchObject({ status: 409 });
    expect(await api('POST', `/api/bills/${json.bill.id}/items`, { token, body: { name: 'x', unitPrice: -1 } })).toMatchObject({
      status: 400,
      json: { error: { code: 'BAD_REQUEST', message: expect.stringContaining('unitPrice') } },
    });
    expect(await api('PATCH', `/api/bills/${json.bill.id}`, { token, raw: '{bad json' })).toMatchObject({ status: 400 });
    expect(await api('GET', '/api/nope', { token })).toMatchObject({ status: 404 });
  });

  it('logs a parser failure on the server but sends only a generic message', async () => {
    const { deps, images } = fakeDeps(failingParser);
    const api = start(deps);
    const token = await signIn(api);
    const { json } = await api('POST', '/api/receipts/upload-url', { token });
    images.images.set(json.bill.receiptImageKey, new Uint8Array([1]));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await api('POST', `/api/receipts/${json.bill.id}/parse`, { token });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.json)).not.toContain('model unavailable');
    expect(log).toHaveBeenCalledWith('[PARSER_FAILED]', expect.objectContaining({ message: 'model unavailable' }));
    log.mockRestore();
  });
});
