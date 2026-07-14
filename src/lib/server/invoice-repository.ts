import type {
  ConfirmedPayment,
  CreateInvoiceInput,
  DeliverableAttachment,
  Invoice,
} from "@/domain/invoice";
import { LocalInvoiceRepository } from "@/lib/server/local-invoice-repository";
import { PostgresInvoiceRepository } from "@/lib/server/postgres-invoice-repository";

export interface InvoiceRepository {
  list(workspaceId: string): Promise<Invoice[]>;
  findById(id: string): Promise<Invoice | null>;
  findByIdForWorkspace(id: string, workspaceId: string): Promise<Invoice | null>;
  create(workspaceId: string, input: CreateInvoiceInput): Promise<Invoice>;
  attachDeliverable(
    workspaceId: string,
    invoiceId: string,
    milestoneId: string,
    deliverable: DeliverableAttachment,
  ): Promise<Invoice | null>;
  confirmPayment(
    invoiceId: string,
    milestoneId: string,
    payment: ConfirmedPayment,
  ): Promise<Invoice | null>;
}

function createRepository(): InvoiceRepository {
  return process.env.DATABASE_URL?.trim()
    ? new PostgresInvoiceRepository()
    : new LocalInvoiceRepository();
}

export const invoiceRepository = createRepository();
