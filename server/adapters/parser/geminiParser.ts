import type { ParsedReceipt } from '@harngun/shared';
import type { ReceiptParser } from '../../ports';
import { RECEIPT_RULES, ReceiptParseError, receiptJsonSchema, receiptSchema } from './receiptSchema';

const PROMPT = `Read this Thai restaurant receipt.
${RECEIPT_RULES}`;

// Below Nginx's default 60 s proxy_read_timeout, so the app's own error reaches the user instead of a 504.
const TIMEOUT_MS = 45_000;

/** The parts of a generateContent reply this parser reads. */
interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { message?: string };
}

/** Dev-only parser on the Gemini API, for real scans while Bedrock is unavailable. Plain fetch, no SDK. */
export class GeminiParser implements ReceiptParser {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async parse(image: Uint8Array): Promise<ParsedReceipt> {
    let response: Response;
    try {
      response = await this.fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: 'POST',
        // In a header rather than the URL, so the key never appears in a logged URL.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: Buffer.from(image).toString('base64') } }, { text: PROMPT }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: receiptJsonSchema },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new ReceiptParseError(`Gemini did not answer within ${TIMEOUT_MS / 1000} s`);
      throw error;
    }

    const body = (await response.json().catch(() => ({}))) as GenerateContentResponse;
    if (!response.ok) throw new ReceiptParseError(`Gemini returned HTTP ${response.status}: ${body.error?.message ?? response.statusText}`);

    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) throw new ReceiptParseError(`Model did not return a receipt (finishReason: ${candidate?.finishReason})`);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ReceiptParseError('Model returned text that is not JSON');
    }
    const result = receiptSchema.safeParse(json);
    if (!result.success) throw new ReceiptParseError(`Model returned an invalid receipt: ${result.error.message}`);
    return result.data;
  }
}
