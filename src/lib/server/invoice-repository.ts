import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createInvoiceSchema,
  deriveInvoiceStatus,
  invoiceSchema,
  type CreateInvoiceInput,
  type Invoice,
} from "@/domain/invoice";

const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "invoices.json");
let writeQueue = Promise.resolve();

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createSeedInvoice(): Invoice {
  const now = new Date().toISOString();

  return invoiceSchema.parse({
    id: "inv_tenda_demo",
    number: "TD-001",
    title: "Nairobi Coffee brand launch",
    clientName: "Nia Coffee Co.",
    clientEmail: "hello@niacoffee.example",
    freelancerName: "Amina Studio",
    freelancerWallet: "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
    currency: "USDC",
    status: "sent",
    createdAt: now,
    updatedAt: now,
    note: "Final source files unlock after the last milestone settles.",
    convertPercent: 30,
    milestones: [
      {
        id: "mil_discovery",
        title: "Creative direction",
        description: "Moodboard, typography direction, and two visual routes.",
        amountCents: 15000,
        dueDate: daysFromToday(2),
        status: "pending",
        deliverableName: "creative-direction.pdf",
      },
      {
        id: "mil_identity",
        title: "Brand identity",
        description: "Primary identity, color system, and packaging lockup.",
        amountCents: 30000,
        dueDate: daysFromToday(7),
        status: "pending",
        deliverableName: "nia-brand-preview.pdf",
      },
      {
        id: "mil_handoff",
        title: "Source file handoff",
        description: "Production-ready assets and a compact brand guide.",
        amountCents: 15000,
        dueDate: daysFromToday(10),
        status: "pending",
        deliverableName: "nia-brand-source-files.zip",
      },
    ],
    activity: [
      {
        id: "act_created",
        type: "invoice_created",
        message: "Amina created a three-stage payment plan.",
        createdAt: now,
      },
      {
        id: "act_scheduled",
        type: "reminder_scheduled",
        message: "Tenda scheduled a reminder 24 hours before the first due date.",
        createdAt: now,
      },
    ],
  });
}

async function ensureDataFile(): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify([createSeedInvoice()], null, 2));
  }
}

async function readInvoices(): Promise<Invoice[]> {
  await ensureDataFile();
  const contents = await readFile(dataFile, "utf8");
  return invoiceSchema.array().parse(JSON.parse(contents));
}

async function persistInvoices(invoices: Invoice[]): Promise<void> {
  const temporaryFile = `${dataFile}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(invoices, null, 2));
  await rename(temporaryFile, dataFile);
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function nextInvoiceNumber(invoices: Invoice[]): string {
  const highestNumber = invoices.reduce((highest, invoice) => {
    const value = Number.parseInt(invoice.number.replace(/\D/g, ""), 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);

  return `TD-${String(highestNumber + 1).padStart(3, "0")}`;
}

export const invoiceRepository = {
  async list(): Promise<Invoice[]> {
    return readInvoices();
  },

  async findById(id: string): Promise<Invoice | null> {
    const invoices = await readInvoices();
    return invoices.find((invoice) => invoice.id === id) ?? null;
  },

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const validatedInput = createInvoiceSchema.parse(input);

    return withWriteLock(async () => {
      const invoices = await readInvoices();
      const now = new Date().toISOString();
      const invoice = invoiceSchema.parse({
        ...validatedInput,
        id: `inv_${crypto.randomUUID()}`,
        number: nextInvoiceNumber(invoices),
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

      await persistInvoices([invoice, ...invoices]);
      return invoice;
    });
  },

  async attachDeliverable(
    invoiceId: string,
    milestoneId: string,
    deliverable: {
      storageKey: string;
      name: string;
      mimeType: string;
      size: number;
    },
  ): Promise<Invoice | null> {
    return withWriteLock(async () => {
      const invoices = await readInvoices();
      const invoiceIndex = invoices.findIndex((invoice) => invoice.id === invoiceId);

      if (invoiceIndex < 0) {
        return null;
      }

      const invoice = invoices[invoiceIndex];
      const milestoneIndex = invoice.milestones.findIndex(
        (milestone) => milestone.id === milestoneId,
      );

      if (milestoneIndex < 0) {
        return null;
      }

      const updatedInvoice = invoiceSchema.parse({
        ...invoice,
        updatedAt: new Date().toISOString(),
        milestones: invoice.milestones.map((milestone, index) =>
          index === milestoneIndex
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

      invoices[invoiceIndex] = updatedInvoice;
      await persistInvoices(invoices);
      return updatedInvoice;
    });
  },

  async confirmPayment(
    invoiceId: string,
    milestoneId: string,
    payment: {
      transactionHash: string;
      payerAddress?: string;
    },
  ): Promise<Invoice | null> {
    return withWriteLock(async () => {
      const invoices = await readInvoices();
      const invoiceIndex = invoices.findIndex((invoice) => invoice.id === invoiceId);

      if (invoiceIndex < 0) {
        return null;
      }

      const invoice = invoices[invoiceIndex];
      const milestoneIndex = invoice.milestones.findIndex(
        (milestone) => milestone.id === milestoneId,
      );

      if (milestoneIndex < 0) {
        return null;
      }

      const milestone = invoice.milestones[milestoneIndex];
      if (["paid", "released"].includes(milestone.status)) {
        return invoice;
      }

      const transactionAlreadyUsed = invoices.some((candidateInvoice) =>
        candidateInvoice.milestones.some(
          (candidateMilestone) =>
            candidateMilestone.transactionHash === payment.transactionHash,
        ),
      );

      if (transactionAlreadyUsed) {
        throw new Error("This transaction has already settled another milestone.");
      }

      const now = new Date().toISOString();
      const updatedInvoice: Invoice = {
        ...invoice,
        updatedAt: now,
        milestones: invoice.milestones.map((candidate, index) =>
          index === milestoneIndex
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
      invoices[invoiceIndex] = invoiceSchema.parse(updatedInvoice);
      await persistInvoices(invoices);
      return invoices[invoiceIndex];
    });
  },
};
