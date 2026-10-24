import { z } from 'zod';

// Request bodies. Money is integer satang, rates integer basis points (ADR-012); unknown keys are dropped.

/** ฿10M per amount: far above any real bill, and 1,000 such items still stay far inside safe integers. */
export const MAX_SATANG = 1_000_000_000;
const satang = z.number().int().min(0).max(MAX_SATANG);
const basisPoints = z.number().int().min(0).max(10_000);
const name = z.string().trim().min(1).max(100);
const personName = z.string().trim().min(1).max(50);

export const sessionInput = z.object({
  name: personName,
  promptPayId: z.string().trim().min(1).max(20),
  promptPayType: z.enum(['PHONE', 'NATIONAL_ID']),
});

export const createBillInput = z.object({ title: z.string().trim().max(100).optional() }).default({});

const discount = z.discriminatedUnion('type', [
  z.object({ id: z.string().min(1).max(50), label: z.string().max(100), type: z.literal('PERCENT'), rate: basisPoints }),
  z.object({ id: z.string().min(1).max(50), label: z.string().max(100), type: z.literal('FLAT'), amount: satang }),
]);

export const updateBillInput = z.object({
  title: z.string().trim().max(100).optional(),
  restaurantName: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SETTLED']).optional(),
  calcConfig: z
    .object({
      serviceChargeRate: basisPoints,
      vatRate: basisPoints,
      vatMode: z.enum(['EXCLUSIVE', 'INCLUSIVE']),
      discountTiming: z.enum(['BEFORE_SC', 'AFTER_SC']),
    })
    .optional(),
  discounts: z.array(discount).max(10).optional(),
  // Real cash-rounding lines are under ฿1; ±฿1,000 is generous.
  roundingAdjustment: z.number().int().min(-100_000).max(100_000).optional(),
  scannedGrandTotal: satang.nullable().optional(),
});

const quantity = z.number().positive().max(1000);
const modifiers = z.array(z.string().trim().max(100)).max(20);

export const addItemInput = z.object({
  name,
  quantity: quantity.default(1),
  unitPrice: satang,
  totalPrice: satang.optional(),
  itemDiscount: satang.default(0),
  modifiers: modifiers.default([]),
});

export const updateItemInput = z.object({
  name: name.optional(),
  quantity: quantity.optional(),
  unitPrice: satang.nullable().optional(),
  totalPrice: satang.nullable().optional(),
  itemDiscount: satang.optional(),
  modifiers: modifiers.optional(),
  needsReview: z.boolean().optional(),
});

export const addParticipantInput = z.object({ name: personName });

export const updateParticipantInput = z.object({
  name: personName.optional(),
  isPaid: z.boolean().optional(),
});
