import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  attachDeliverableRecord,
  confirmPaymentRecord,
  createInvoiceRecord,
  createInvoiceSchema,
  invoiceSchema,
  type ConfirmedPayment,
  type CreateInvoiceInput,
  type DeliverableAttachment,
  type Invoice,
} from "@/domain/invoice";
import {
  DEMO_OWNER_ADDRESS,
  workspaceIdForAddress,
} from "@/domain/workspace";
import type { InvoiceRepository } from "@/lib/server/invoice-repository";

const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "invoices.json");

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createSeedInvoice(): Invoice {
  const now = new Date().toISOString();

  return invoiceSchema.parse({
    id: "inv_tenda_demo",
    workspaceId: workspaceIdForAddress(DEMO_OWNER_ADDRESS),
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

function nextInvoiceNumber(invoices: Invoice[]): string {
  const highestNumber = invoices.reduce((highest, invoice) => {
    const value = Number.parseInt(invoice.number.replace(/\D/g, ""), 10);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);

  return `TD-${String(highestNumber + 1).padStart(3, "0")}`;
}

export class LocalInvoiceRepository implements InvoiceRepository {
  private writeQueue = Promise.resolve();

  private async ensureDataFile(): Promise<void> {
    await mkdir(dataDirectory, { recursive: true });

    try {
      await readFile(dataFile, "utf8");
    } catch {
      await writeFile(dataFile, JSON.stringify([createSeedInvoice()], null, 2));
    }
  }

  private async readInvoices(): Promise<Invoice[]> {
    await this.ensureDataFile();
    const contents = await readFile(dataFile, "utf8");
    return invoiceSchema.array().parse(JSON.parse(contents));
  }

  private async persistInvoices(invoices: Invoice[]): Promise<void> {
    const temporaryFile = `${dataFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(invoices, null, 2));
    await rename(temporaryFile, dataFile);
  }

  private withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async list(workspaceId: string): Promise<Invoice[]> {
    const invoices = await this.readInvoices();
    return invoices.filter((invoice) => invoice.workspaceId === workspaceId);
  }

  async findById(id: string): Promise<Invoice | null> {
    const invoices = await this.readInvoices();
    return invoices.find((invoice) => invoice.id === id) ?? null;
  }

  async findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<Invoice | null> {
    const invoice = await this.findById(id);
    return invoice?.workspaceId === workspaceId ? invoice : null;
  }

  async create(workspaceId: string, input: CreateInvoiceInput): Promise<Invoice> {
    const validatedInput = createInvoiceSchema.parse(input);

    return this.withWriteLock(async () => {
      const invoices = await this.readInvoices();
      const invoice = createInvoiceRecord(
        validatedInput,
        nextInvoiceNumber(invoices),
        workspaceId,
      );

      await this.persistInvoices([invoice, ...invoices]);
      return invoice;
    });
  }

  async attachDeliverable(
    workspaceId: string,
    invoiceId: string,
    milestoneId: string,
    deliverable: DeliverableAttachment,
  ): Promise<Invoice | null> {
    return this.withWriteLock(async () => {
      const invoices = await this.readInvoices();
      const invoiceIndex = invoices.findIndex((invoice) => invoice.id === invoiceId);

      if (
        invoiceIndex < 0 ||
        invoices[invoiceIndex].workspaceId !== workspaceId
      ) {
        return null;
      }

      const updatedInvoice = attachDeliverableRecord(
        invoices[invoiceIndex],
        milestoneId,
        deliverable,
      );

      if (!updatedInvoice) {
        return null;
      }

      invoices[invoiceIndex] = updatedInvoice;
      await this.persistInvoices(invoices);
      return updatedInvoice;
    });
  }

  async confirmPayment(
    invoiceId: string,
    milestoneId: string,
    payment: ConfirmedPayment,
  ): Promise<Invoice | null> {
    return this.withWriteLock(async () => {
      const invoices = await this.readInvoices();
      const invoiceIndex = invoices.findIndex((invoice) => invoice.id === invoiceId);

      if (invoiceIndex < 0) {
        return null;
      }

      const currentInvoice = invoices[invoiceIndex];
      const currentMilestone = currentInvoice.milestones.find(
        (milestone) => milestone.id === milestoneId,
      );

      if (!currentMilestone) {
        return null;
      }

      if (["paid", "released"].includes(currentMilestone.status)) {
        return currentInvoice;
      }

      const transactionAlreadyUsed = invoices.some((invoice) =>
        invoice.milestones.some(
          (milestone) => milestone.transactionHash === payment.transactionHash,
        ),
      );

      if (transactionAlreadyUsed) {
        throw new Error("This transaction has already settled another milestone.");
      }

      const updatedInvoice = confirmPaymentRecord(
        currentInvoice,
        milestoneId,
        payment,
      );

      if (!updatedInvoice) {
        return null;
      }

      invoices[invoiceIndex] = updatedInvoice;
      await this.persistInvoices(invoices);
      return updatedInvoice;
    });
  }
}
