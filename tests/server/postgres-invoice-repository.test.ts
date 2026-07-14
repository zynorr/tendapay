import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { newDb } from "pg-mem";
import type { Pool } from "pg";

import { PostgresInvoiceRepository } from "@/lib/server/postgres-invoice-repository";

const invoiceInput = {
  title: "Launch campaign",
  clientName: "Nia Coffee",
  clientEmail: "hello@nia.example",
  freelancerName: "Amina Studio",
  freelancerWallet: "0x2f0B23f53734252Bda2277357e97e1517d6B042A",
  note: "",
  convertPercent: 0,
  milestones: [
    {
      title: "Creative direction",
      description: "Moodboard and visual routes.",
      amountCents: 15_000,
      dueDate: "2099-01-01",
    },
  ],
};

async function createRepository() {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  const migration = await readFile(
    path.join(process.cwd(), "db", "migrations", "001_initial.sql"),
    "utf8",
  );

  await pool.query(migration);
  return { pool, repository: new PostgresInvoiceRepository(pool) };
}

test("PostgreSQL repository persists invoice, file, and settlement state", async () => {
  const { pool, repository } = await createRepository();

  try {
    const invoice = await repository.create(invoiceInput);
    const milestone = invoice.milestones[0];

    assert.equal(invoice.number, "TD-001");
    assert.equal((await repository.list()).length, 1);
    assert.equal((await repository.findById(invoice.id))?.id, invoice.id);

    const withFile = await repository.attachDeliverable(invoice.id, milestone.id, {
      storageKey: `${invoice.id}/${milestone.id}/direction.pdf`,
      name: "direction.pdf",
      mimeType: "application/pdf",
      size: 64,
    });

    assert.equal(withFile?.milestones[0].deliverableName, "direction.pdf");

    const settled = await repository.confirmPayment(invoice.id, milestone.id, {
      transactionHash: "demo_postgres_settlement",
      payerAddress: "0xDemoClientWallet",
    });

    assert.equal(settled?.status, "paid");
    assert.equal(settled?.milestones[0].status, "released");
  } finally {
    await pool.end();
  }
});

test("PostgreSQL repository rejects a reused transaction hash", async () => {
  const { pool, repository } = await createRepository();

  try {
    const firstInvoice = await repository.create(invoiceInput);
    const secondInvoice = await repository.create({
      ...invoiceInput,
      title: "Second launch campaign",
    });
    const transactionHash = "demo_duplicate_settlement";

    await repository.confirmPayment(
      firstInvoice.id,
      firstInvoice.milestones[0].id,
      { transactionHash },
    );

    await assert.rejects(
      repository.confirmPayment(
        secondInvoice.id,
        secondInvoice.milestones[0].id,
        { transactionHash },
      ),
      /already settled another milestone/,
    );

    const unchangedInvoice = await repository.findById(secondInvoice.id);
    assert.equal(unchangedInvoice?.status, "sent");
    assert.equal(unchangedInvoice?.milestones[0].status, "pending");
  } finally {
    await pool.end();
  }
});
