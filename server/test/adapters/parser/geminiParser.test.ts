import { receiptFixtures } from '@harngun/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { GeminiParser } from '../../../adapters/parser/geminiParser';
import { ReceiptParseError } from '../../../adapters/parser/receiptSchema';

const receipt = receiptFixtures['restaurant-sc-vat-discount']!;
const image = new Uint8Array([0xff, 0xd8, 0xff]);

/** Stands in for fetch: records each request and replies with `body` and `status`. */
function fakeFetch(body: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => (
    sent.push({ url: String(url), init: init! }), new Response(JSON.stringify(body), { status })
  );
  return { sent, fetchFn: fetchFn as typeof fetch };
}

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
const parserFor = (fetchFn: typeof fetch) => new GeminiParser('test-key', 'test-model', fetchFn);

describe('GeminiParser', () => {
  it('sends the image with the schema and returns the parsed receipt', async () => {
    const { fetchFn, sent } = fakeFetch(reply(JSON.stringify(receipt)));

    expect(await parserFor(fetchFn).parse(image)).toEqual(receipt);

    const { url, init } = sent[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const request = JSON.parse(init.body as string);
    expect(request.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: '/9j/' } });
    expect(request.generationConfig).toMatchObject({ temperature: 0, responseMimeType: 'application/json' });
    expect(request.generationConfig.responseJsonSchema).toMatchObject({ type: 'object' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails clearly when Gemini does not answer in time', async () => {
    const fetchFn = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }) as typeof fetch;

    await expect(parserFor(fetchFn).parse(image)).rejects.toThrow(/did not answer within 45 s/);
  });

  it('fails clearly on an HTTP error such as a rate limit', async () => {
    const { fetchFn } = fakeFetch({ error: { message: 'Resource exhausted' } }, 429);

    await expect(parserFor(fetchFn).parse(image)).rejects.toThrow(/HTTP 429: Resource exhausted/);
  });

  it('fails clearly when the reply has no text', async () => {
    const { fetchFn } = fakeFetch({ candidates: [{ finishReason: 'SAFETY' }] });

    await expect(parserFor(fetchFn).parse(image)).rejects.toThrow(/finishReason: SAFETY/);
  });

  it('rejects text that is not JSON', async () => {
    const { fetchFn } = fakeFetch(reply('I cannot read this receipt.'));

    await expect(parserFor(fetchFn).parse(image)).rejects.toThrow(ReceiptParseError);
  });

  it('rejects JSON that does not match the schema', async () => {
    const broken = { ...receipt, items: [{ ...receipt.items[0], unitPrice: -5 }] };
    const { fetchFn } = fakeFetch(reply(JSON.stringify(broken)));

    await expect(parserFor(fetchFn).parse(image)).rejects.toThrow(/invalid receipt/);
  });
});
