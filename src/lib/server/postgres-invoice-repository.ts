import type { Pool, PoolClient } from "pg";

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
import type { InvoiceRepository } from "@/lib/server/invoice-repository";
import { getPostgresPool } from "@/lib/server/postgres-client";

type InvoiceRow = { payload: unknown };

function parseInvoiceRow(row: InvoiceRow | undefined): Invoice | null {
  return row ? invoiceSchema.parse(row.payload) : null;
}

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly pool: Pool = getPostgresPool()) {}

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(workspaceId: string): Promise<Invoice[]> {
    const result = await this.pool.query<InvoiceRow>(
      `
        SELECT payload
        FROM tendapay_invoices
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `,
      [workspaceId],
    );

    return result.rows.map((row) => invoiceSchema.parse(row.payload));
  }

  async findById(id: string): Promise<Invoice | null> {
    const result = await this.pool.query<InvoiceRow>(
      `
        SELECT payload
        FROM tendapay_invoices
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return parseInvoiceRow(result.rows[0]);
  }

  async findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<Invoice | null> {
    const result = await this.pool.query<InvoiceRow>(
      `
        SELECT payload
        FROM tendapay_invoices
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [id, workspaceId],
    );

    return parseInvoiceRow(result.rows[0]);
  }

  async create(workspaceId: string, input: CreateInvoiceInput): Promise<Invoice> {
    const validatedInput = createInvoiceSchema.parse(input);

    return this.withTransaction(async (client) => {
      const sequenceResult = await client.query<{ value: string }>(
        "SELECT nextval('tendapay_invoice_number_seq')::text AS value",
      );
      const number = `TD-${sequenceResult.rows[0].value.padStart(3, "0")}`;
      const invoice = createInvoiceRecord(validatedInput, number, workspaceId);

      await client.query(
        `
          INSERT INTO tendapay_invoices (
            id,
            workspace_id,
            number,
            payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        `,
        [
          invoice.id,
          invoice.workspaceId,
          invoice.number,
          JSON.stringify(invoice),
          invoice.createdAt,
          invoice.updatedAt,
        ],
      );

      return invoice;
    });
  }

  async attachDeliverable(
    workspaceId: string,
    invoiceId: string,
    milestoneId: string,
    deliverable: DeliverableAttachment,
  ): Promise<Invoice | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<InvoiceRow>(
        `
          SELECT payload
          FROM tendapay_invoices
          WHERE id = $1 AND workspace_id = $2
          FOR UPDATE
        `,
        [invoiceId, workspaceId],
      );
      const invoice = parseInvoiceRow(result.rows[0]);

      if (!invoice) {
        return null;
      }

      const updatedInvoice = attachDeliverableRecord(
        invoice,
        milestoneId,
        deliverable,
      );

      if (!updatedInvoice) {
        return null;
      }

      await this.updateInvoice(client, updatedInvoice);
      return updatedInvoice;
    });
  }

  async confirmPayment(
    invoiceId: string,
    milestoneId: string,
    payment: ConfirmedPayment,
  ): Promise<Invoice | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<InvoiceRow>(
        `
          SELECT payload
          FROM tendapay_invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [invoiceId],
      );
      const invoice = parseInvoiceRow(result.rows[0]);

      if (!invoice) {
        return null;
      }

      const milestone = invoice.milestones.find(
        (candidate) => candidate.id === milestoneId,
      );

      if (!milestone) {
        return null;
      }

      if (["paid", "released"].includes(milestone.status)) {
        return invoice;
      }

      const existingTransaction = await client.query(
        `
          SELECT transaction_hash
          FROM tendapay_payment_transactions
          WHERE transaction_hash = $1
          LIMIT 1
        `,
        [payment.transactionHash],
      );

      if (existingTransaction.rowCount) {
        throw new Error("This transaction has already settled another milestone.");
      }

      try {
        await client.query(
          `
            INSERT INTO tendapay_payment_transactions (
              transaction_hash,
              invoice_id,
              milestone_id
            )
            VALUES ($1, $2, $3)
          `,
          [payment.transactionHash, invoiceId, milestoneId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new Error("This transaction has already settled another milestone.");
        }

        throw error;
      }

      const updatedInvoice = confirmPaymentRecord(invoice, milestoneId, payment);

      if (!updatedInvoice) {
        return null;
      }

      await this.updateInvoice(client, updatedInvoice);
      return updatedInvoice;
    });
  }

  private async updateInvoice(client: PoolClient, invoice: Invoice): Promise<void> {
    await client.query(
      `
        UPDATE tendapay_invoices
        SET payload = $2::jsonb,
            updated_at = $3
        WHERE id = $1
      `,
      [invoice.id, JSON.stringify(invoice), invoice.updatedAt],
    );
  }
}
