import { describe, expect, it } from 'vitest';
import referencePayload from 'promptpay-qr';
import { crc16, generatePromptPayPayload, normalizePromptPayId } from '../../src/promptpay/payload';

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('pads to 4 digits', () => {
    expect(crc16('')).toBe('FFFF');
    expect(crc16('A')).toHaveLength(4);
  });
});

describe('normalizePromptPayId', () => {
  it('accepts common phone formats', () => {
    for (const phone of ['0812345678', '081-234-5678', '081 234 5678', '+66812345678', '66812345678']) {
      expect(normalizePromptPayId(phone, 'PHONE')).toBe('0066812345678');
    }
  });

  it('accepts 13-digit national IDs', () => {
    expect(normalizePromptPayId('1-2345-67890-12-1', 'NATIONAL_ID')).toBe('1234567890121');
  });

  it('rejects invalid IDs', () => {
    expect(() => normalizePromptPayId('081234567', 'PHONE')).toThrow(RangeError);
    expect(() => normalizePromptPayId('08123456789', 'PHONE')).toThrow(RangeError);
    expect(() => normalizePromptPayId('1812345678', 'PHONE')).toThrow(RangeError);
    expect(() => normalizePromptPayId('08abc45678', 'PHONE')).toThrow(RangeError);
    expect(() => normalizePromptPayId('123456789012', 'NATIONAL_ID')).toThrow(RangeError);
  });
});

describe('generatePromptPayPayload', () => {
  it('builds the expected fields', () => {
    const payload = generatePromptPayPayload({ id: '0812345678', type: 'PHONE', amount: 18832 });
    expect(payload).toMatch(/^000201010212/);
    expect(payload).toContain('29370016A000000677010111011300668123456785802TH5303764');
    expect(payload).toContain('5406188.32');
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4));
  });

  it('matches the promptpay-qr reference library exactly', () => {
    const cases = [
      { id: '0812345678', type: 'PHONE', amount: 18832 },
      { id: '0991234567', type: 'PHONE', amount: 1 },
      { id: '0612345678', type: 'PHONE', amount: 100 },
      { id: '0812345678', type: 'PHONE', amount: 123456789 },
      { id: '1234567890121', type: 'NATIONAL_ID', amount: 33333 },
      { id: '3101700012345', type: 'NATIONAL_ID', amount: 50 },
    ] as const;
    for (const c of cases) {
      expect(generatePromptPayPayload(c)).toBe(referencePayload(c.id, { amount: c.amount / 100 }));
    }
  });

  it('rejects amounts that cannot be paid', () => {
    expect(() => generatePromptPayPayload({ id: '0812345678', type: 'PHONE', amount: 0 })).toThrow(RangeError);
    expect(() => generatePromptPayPayload({ id: '0812345678', type: 'PHONE', amount: -100 })).toThrow(RangeError);
    expect(() => generatePromptPayPayload({ id: '0812345678', type: 'PHONE', amount: 10.5 })).toThrow(RangeError);
  });
});
