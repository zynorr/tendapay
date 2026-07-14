import { z } from "zod";

const pendingPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  milestoneId: z.string().min(1),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  payerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  submittedAt: z.string().datetime(),
});

export type PendingPayment = z.infer<typeof pendingPaymentSchema>;

function storageKey(invoiceId: string, milestoneId: string): string {
  return `tendapay:pending:${invoiceId}:${milestoneId}`;
}

export function readPendingPayment(
  storage: Pick<Storage, "getItem" | "removeItem">,
  invoiceId: string,
  milestoneId: string,
): PendingPayment | null {
  const key = storageKey(invoiceId, milestoneId);
  const value = storage.getItem(key);

  if (!value) {
    return null;
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(value);
  } catch {
    storage.removeItem(key);
    return null;
  }

  const parsed = pendingPaymentSchema.safeParse(parsedValue);

  if (!parsed.success) {
    storage.removeItem(key);
    return null;
  }

  return parsed.data;
}

export function savePendingPayment(
  storage: Pick<Storage, "setItem">,
  payment: PendingPayment,
): void {
  storage.setItem(
    storageKey(payment.invoiceId, payment.milestoneId),
    JSON.stringify(pendingPaymentSchema.parse(payment)),
  );
}

export function clearPendingPayment(
  storage: Pick<Storage, "removeItem">,
  invoiceId: string,
  milestoneId: string,
): void {
  storage.removeItem(storageKey(invoiceId, milestoneId));
}
