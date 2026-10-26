import { describe, expect, it } from 'vitest';
import { BedrockParser } from '../adapters/parser/bedrockParser';
import { GeminiParser } from '../adapters/parser/geminiParser';
import { MockParser } from '../adapters/parser/mockParser';
import { createAdapters, loadConfig } from '../config';

const base = { TABLE_NAME: 't', S3_BUCKET: 'b', DEV_AUTH_SECRET: 'test-secret-16-chars' };
const parserFor = (env: Record<string, string>) => createAdapters(loadConfig({ ...base, ...env })).parser;

describe('parser choice', () => {
  it('uses the mock unless MOCK_AI is false, even with a Gemini key', () => {
    expect(parserFor({ GEMINI_API_KEY: 'k' })).toBeInstanceOf(MockParser);
  });

  it('uses Gemini when a key is set, without needing the Bedrock variables', () => {
    expect(parserFor({ MOCK_AI: 'false', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' })).toBeInstanceOf(GeminiParser);
  });

  it('requires GEMINI_MODEL alongside the key', () => {
    expect(() => parserFor({ MOCK_AI: 'false', GEMINI_API_KEY: 'k' })).toThrow(/GEMINI_MODEL/);
  });

  it('falls back to Bedrock without a key, and still requires its variables', () => {
    expect(() => parserFor({ MOCK_AI: 'false' })).toThrow(/BEDROCK_REGION, BEDROCK_MODEL_ID/);
    expect(parserFor({ MOCK_AI: 'false', BEDROCK_REGION: 'r', BEDROCK_MODEL_ID: 'm' })).toBeInstanceOf(BedrockParser);
  });
});
