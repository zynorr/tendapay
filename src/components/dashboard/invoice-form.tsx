"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, FileUp, Plus, Trash2, X } from "lucide-react";

import type { CreateInvoiceInput, Invoice } from "@/domain/invoice";

type InvoiceFormProps = {
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
};

type MilestoneDraft = CreateInvoiceInput["milestones"][number] & {
  amount: string;
  file?: File;
};

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function newMilestone(index: number): MilestoneDraft {
  return {
    title: index === 0 ? "Project deposit" : "Final delivery",
    description: "",
    amount: index === 0 ? "150" : "350",
    amountCents: 0,
    dueDate: futureDate(index === 0 ? 2 : 7),
    deliverableName: "",
  };
}

export function InvoiceForm({ onClose, onCreated }: InvoiceFormProps) {
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    newMilestone(0),
    newMilestone(1),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = useMemo(
    () => milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0),
    [milestones],
  );

  function updateMilestone(index: number, update: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((milestone, candidateIndex) =>
        candidateIndex === index ? { ...milestone, ...update } : milestone,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const body: CreateInvoiceInput = {
      title: String(formData.get("title")),
      clientName: String(formData.get("clientName")),
      clientEmail: String(formData.get("clientEmail")),
      freelancerName: String(formData.get("freelancerName")),
      freelancerWallet: String(formData.get("freelancerWallet")),
      note: String(formData.get("note") ?? ""),
      convertPercent: Number(formData.get("convertPercent") ?? 0),
      milestones: milestones.map((milestone) => ({
        title: milestone.title,
        description: milestone.description,
        dueDate: milestone.dueDate,
        deliverableName: milestone.deliverableName || undefined,
        amountCents: Math.round(Number(milestone.amount) * 100),
      })),
    };

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to create the invoice.");
      }

      let createdInvoice: Invoice = result.invoice;

      for (const [index, milestone] of milestones.entries()) {
        if (!milestone.file) continue;

        const uploadData = new FormData();
        uploadData.append("file", milestone.file);
        const uploadResponse = await fetch(
          `/api/invoices/${createdInvoice.id}/milestones/${createdInvoice.milestones[index].id}/deliverable`,
          { method: "POST", body: uploadData },
        );
        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error ?? "A deliverable could not be uploaded.");
        }

        createdInvoice = uploadResult.invoice;
      }

      onCreated(createdInvoice);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create the invoice.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">New payment plan</span>
            <h2 id="invoice-form-title">Create milestone invoice</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="invoice-form">
          <div className="form-section">
            <h3>Project</h3>
            <div className="field-grid two-columns">
              <label className="field full-width">
                <span>Project title</span>
                <input name="title" placeholder="Website redesign" required />
              </label>
              <label className="field">
                <span>Freelancer or studio</span>
                <input name="freelancerName" placeholder="Amina Studio" required />
              </label>
              <label className="field">
                <span>Receiving wallet</span>
                <input name="freelancerWallet" placeholder="0x..." required />
              </label>
              <label className="field">
                <span>Client name</span>
                <input name="clientName" placeholder="Acme Ltd" required />
              </label>
              <label className="field">
                <span>Client email</span>
                <input name="clientEmail" type="email" placeholder="finance@acme.com" required />
              </label>
            </div>
          </div>

          <div className="form-section milestone-editor">
            <div className="section-heading-row">
              <div>
                <h3>Milestones</h3>
                <p>Each payment releases its associated deliverable.</p>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setMilestones((current) => [...current, newMilestone(current.length)])}
              >
                <Plus size={16} /> Add milestone
              </button>
            </div>

            {milestones.map((milestone, index) => (
              <div className="milestone-form-row" key={`${index}-${milestone.title}`}>
                <span className="milestone-number">{index + 1}</span>
                <div className="milestone-fields">
                  <input
                    aria-label={`Milestone ${index + 1} title`}
                    value={milestone.title}
                    onChange={(event) => updateMilestone(index, { title: event.target.value })}
                    required
                  />
                  <input
                    aria-label={`Milestone ${index + 1} description`}
                    className="muted-input"
                    placeholder="What will be delivered?"
                    value={milestone.description}
                    onChange={(event) => updateMilestone(index, { description: event.target.value })}
                  />
                  <div className="milestone-meta-fields">
                    <label className="money-input">
                      <span>$</span>
                      <input
                        aria-label={`Milestone ${index + 1} amount`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={milestone.amount}
                        onChange={(event) => updateMilestone(index, { amount: event.target.value })}
                        required
                      />
                      <small>USDC</small>
                    </label>
                    <label className="date-input">
                      <CalendarDays size={15} />
                      <input
                        aria-label={`Milestone ${index + 1} due date`}
                        type="date"
                        value={milestone.dueDate}
                        onChange={(event) => updateMilestone(index, { dueDate: event.target.value })}
                        required
                      />
                    </label>
                    <label className="file-input">
                      <FileUp size={15} />
                      <span>{milestone.file?.name ?? "Attach deliverable"}</span>
                      <input
                        aria-label={`Milestone ${index + 1} deliverable`}
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          updateMilestone(index, {
                            file,
                            deliverableName: file?.name ?? "",
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
                <button
                  className="icon-button subtle"
                  type="button"
                  aria-label={`Remove milestone ${index + 1}`}
                  disabled={milestones.length === 1}
                  onClick={() =>
                    setMilestones((current) => current.filter((_, candidate) => candidate !== index))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="form-section">
            <div className="field-grid two-columns">
              <label className="field">
                <span>Convert to cKES after payment</span>
                <div className="percentage-input">
                  <input name="convertPercent" type="number" min="0" max="100" defaultValue="30" />
                  <span>%</span>
                </div>
              </label>
              <label className="field">
                <span>Client note</span>
                <input name="note" placeholder="Payment terms or handoff details" />
              </label>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <footer className="modal-footer">
            <div>
              <span>Total contract value</span>
              <strong>${total.toFixed(2)} USDC</strong>
            </div>
            <div className="footer-actions">
              <button className="button secondary" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create invoice"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
