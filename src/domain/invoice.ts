import { z } from "zod";

export const milestoneStatusSchema = z.enum([
  "pending",
  "payment_pending",
  "paid",
  "released",
]);

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
]);

export const milestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2),
  description: z.string().default(""),
  amountCents: z.number().int().positive(),
  dueDate: z.string().date(),
  status: milestoneStatusSchema,
  deliverableName: z.string().optional(),
  deliverableStorageKey: z.string().optional(),
  deliverableMimeType: z.string().optional(),
  deliverableSize: z.number().int().nonnegative().optional(),
  paidAt: z.string().datetime().optional(),
  releasedAt: z.string().datetime().optional(),
  transactionHash: z.string().optional(),
  payerAddress: z.string().optional(),
});

export const activitySchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "invoice_created",
    "invoice_sent",
    "reminder_scheduled",
    "payment_confirmed",
    "deliverable_released",
  ]),
  message: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const invoiceSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  title: z.string().min(2),
  clientName: z.string().min(2),
  clientEmail: z.string().email(),
  freelancerName: z.string().min(2),
  freelancerWallet: z.string().min(1),
  currency: z.literal("USDC"),
  status: invoiceStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  note: z.string().default(""),
  convertPercent: z.number().int().min(0).max(100),
  milestones: z.array(milestoneSchema).min(1),
  activity: z.array(activitySchema),
});

export const createInvoiceSchema = z.object({
  title: z.string().trim().min(2).max(100),
  clientName: z.string().trim().min(2).max(80),
  clientEmail: z.string().trim().email(),
  freelancerName: z.string().trim().min(2).max(80),
  freelancerWallet: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM wallet address."),
  note: z.string().trim().max(500).default(""),
  convertPercent: z.number().int().min(0).max(100).default(0),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().max(300).default(""),
        amountCents: z.number().int().positive(),
        dueDate: z.string().date(),
        deliverableName: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(8),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type DeliverableAttachment = {
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
};
export type ConfirmedPayment = {
  transactionHash: string;
  payerAddress?: string;
};

export function totalInvoiceCents(invoice: Invoice): number {
  return invoice.milestones.reduce(
    (total, milestone) => total + milestone.amountCents,
    0,
  );
}

export function paidInvoiceCents(invoice: Invoice): number {
  return invoice.milestones.reduce((total, milestone) => {
    return milestone.status === "paid" || milestone.status === "released"
      ? total + milestone.amountCents
      : total;
  }, 0);
}

export function deriveInvoiceStatus(invoice: Invoice): Invoice["status"] {
  const paidCount = invoice.milestones.filter((milestone) =>
    ["paid", "released"].includes(milestone.status),
  ).length;

  if (paidCount === invoice.milestones.length) {
    return "paid";
  }

  if (paidCount > 0) {
    return "partially_paid";
  }

  const earliestDueDate = invoice.milestones
    .map((milestone) => milestone.dueDate)
    .sort()[0];

  return earliestDueDate < new Date().toISOString().slice(0, 10)
    ? "overdue"
    : "sent";
}

export function createInvoiceRecord(
  input: CreateInvoiceInput,
  number: string,
): Invoice {
  const validatedInput = createInvoiceSchema.parse(input);
  const now = new Date().toISOString();

  return invoiceSchema.parse({
    ...validatedInput,
    id: `inv_${crypto.randomUUID()}`,
    number,
    currency: "USDC",
    status: "sent",
    createdAt: now,
    updatedAt: now,
    milestones: validatedInput.milestones.map((milestone) => ({
      ...milestone,
      id: `mil_${crypto.randomUUID()}`,
      status: "pending",
    })),
    activity: [
      {
        id: `act_${crypto.randomUUID()}`,
        type: "invoice_created",
        message: `${validatedInput.freelancerName} created the payment plan.`,
        createdAt: now,
      },
      {
        id: `act_${crypto.randomUUID()}`,
        type: "reminder_scheduled",
        message: "Tenda scheduled milestone reminders.",
        createdAt: now,
      },
    ],
  });
}

export function attachDeliverableRecord(
  invoice: Invoice,
  milestoneId: string,
  deliverable: DeliverableAttachment,
): Invoice | null {
  const milestoneExists = invoice.milestones.some(
    (milestone) => milestone.id === milestoneId,
  );

  if (!milestoneExists) {
    return null;
  }

  return invoiceSchema.parse({
    ...invoice,
    updatedAt: new Date().toISOString(),
    milestones: invoice.milestones.map((milestone) =>
      milestone.id === milestoneId
        ? {
            ...milestone,
            deliverableName: deliverable.name,
            deliverableStorageKey: deliverable.storageKey,
            deliverableMimeType: deliverable.mimeType,
            deliverableSize: deliverable.size,
          }
        : milestone,
    ),
  });
}

export function confirmPaymentRecord(
  invoice: Invoice,
  milestoneId: string,
  payment: ConfirmedPayment,
): Invoice | null {
  const milestone = invoice.milestones.find(
    (candidate) => candidate.id === milestoneId,
  );

  if (!milestone) {
    return null;
  }

  if (["paid", "released"].includes(milestone.status)) {
    return invoice;
  }

  const now = new Date().toISOString();
  const updatedInvoice: Invoice = {
    ...invoice,
    updatedAt: now,
    milestones: invoice.milestones.map((candidate) =>
      candidate.id === milestoneId
        ? {
            ...candidate,
            status: "released",
            paidAt: now,
            releasedAt: now,
            transactionHash: payment.transactionHash,
            payerAddress: payment.payerAddress,
          }
        : candidate,
    ),
    activity: [
      {
        id: `act_${crypto.randomUUID()}`,
        type: "payment_confirmed",
        message: `Payment confirmed for ${milestone.title}.`,
        createdAt: now,
      },
      {
        id: `act_${crypto.randomUUID()}`,
        type: "deliverable_released",
        message: `${milestone.deliverableName ?? "The deliverable"} was released to the client.`,
        createdAt: now,
      },
      ...invoice.activity,
    ],
  };

  updatedInvoice.status = deriveInvoiceStatus(updatedInvoice);
  return invoiceSchema.parse(updatedInvoice);
}
