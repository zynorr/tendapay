"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Braces,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileLock2,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import type { Invoice, Milestone } from "@/domain/invoice";
import { paidInvoiceCents, totalInvoiceCents } from "@/domain/invoice";
import { formatDate, formatMoney, shortenAddress } from "@/lib/format";
import { payUsdcMilestone } from "@/lib/celo";
import { BrandMark } from "@/components/brand-mark";
import { StatusBadge } from "@/components/status-badge";

type ClientInvoiceProps = {
  invoiceId: string;
};

export function ClientInvoice({ invoiceId }: ClientInvoiceProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingMilestoneId, setPayingMilestoneId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [walletDetected, setWalletDetected] = useState(false);
  const [copiedEndpointId, setCopiedEndpointId] = useState<string | null>(null);

  useEffect(() => {
    const detectionTimer = window.setTimeout(() => {
      setWalletDetected(Boolean(window.ethereum));
    }, 0);

    fetch(`/api/invoices/${invoiceId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("This invoice could not be found.");
        }
        return response.json();
      })
      .then((result) => setInvoice(result.invoice))
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));

    return () => window.clearTimeout(detectionTimer);
  }, [invoiceId]);

  const nextMilestone = useMemo(
    () => invoice?.milestones.find((milestone) => milestone.status === "pending") ?? null,
    [invoice],
  );

  async function confirmDemoPayment(milestone: Milestone) {
    setPayingMilestoneId(milestone.id);
    setError("");

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const response = await fetch(
        `/api/invoices/${invoiceId}/milestones/${milestone.id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionHash: `demo_${crypto.randomUUID()}`,
            payerAddress: "0xDemoClientWallet",
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "The payment could not be confirmed.");
      }

      setInvoice(result.invoice);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Payment failed.");
    } finally {
      setPayingMilestoneId(null);
    }
  }

  async function payWithWallet(milestone: Milestone) {
    if (!invoice) return;

    setPayingMilestoneId(milestone.id);
    setError("");

    try {
      const payment = await payUsdcMilestone({
        recipient: invoice.freelancerWallet,
        amountCents: milestone.amountCents,
      });
      const response = await fetch(
        `/api/invoices/${invoiceId}/milestones/${milestone.id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionHash: payment.hash,
            payerAddress: payment.payerAddress,
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "The payment could not be confirmed.");
      }

      setInvoice(result.invoice);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "The wallet payment could not be completed.",
      );
    } finally {
      setPayingMilestoneId(null);
    }
  }

  async function copyWallet() {
    if (!invoice) return;
    await navigator.clipboard.writeText(invoice.freelancerWallet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyAgentEndpoint(milestoneId: string) {
    const endpoint = `${window.location.origin}/api/x402/invoices/${invoiceId}/milestones/${milestoneId}/deliverable`;
    await navigator.clipboard.writeText(endpoint);
    setCopiedEndpointId(milestoneId);
    window.setTimeout(() => setCopiedEndpointId(null), 1500);
  }

  if (loading) {
    return <main className="client-loading"><LoaderCircle className="spin" size={24} /> Loading secure invoice</main>;
  }

  if (!invoice) {
    return (
      <main className="client-loading">
        <FileLock2 size={28} />
        <strong>{error || "Invoice not found"}</strong>
        <Link className="button secondary" href="/"><ArrowLeft size={16} /> Back to TendaPay</Link>
      </main>
    );
  }

  const paidCents = paidInvoiceCents(invoice);
  const totalCents = totalInvoiceCents(invoice);

  return (
    <div className="client-page">
      <header className="client-header">
        <Link className="brand" href="/"><BrandMark /><span>TendaPay</span></Link>
        <div className="secure-label"><ShieldCheck size={16} /> Verified payment request</div>
      </header>

      <main className="client-content">
        <section className="client-summary">
          <div className="client-summary-heading">
            <div>
              <span className="eyebrow">Invoice {invoice.number}</span>
              <h1>{invoice.title}</h1>
              <p>From <strong>{invoice.freelancerName}</strong> for {invoice.clientName}</p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          <div className="payment-progress-block">
            <div><span>Payment progress</span><strong>{formatMoney(paidCents)} of {formatMoney(totalCents)}</strong></div>
            <div className="large-progress"><i style={{ width: `${(paidCents / totalCents) * 100}%` }} /></div>
          </div>

          <div className="client-detail-strip">
            <div><span>Payment asset</span><strong>USDC on Celo</strong></div>
            <div><span>Milestones</span><strong>{invoice.milestones.length} stages</strong></div>
            <div><span>Receiving wallet</span><button onClick={copyWallet}>{shortenAddress(invoice.freelancerWallet)} {copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
          </div>
        </section>

        <section className="client-workspace">
          <div className="milestone-list-panel">
            <div className="panel-heading"><div><h2>Project milestones</h2><p>Payment releases each delivery independently.</p></div></div>
            <div className="client-milestone-list">
              {invoice.milestones.map((milestone, index) => {
                const isReleased = milestone.status === "released";
                const isNext = nextMilestone?.id === milestone.id;
                return (
                  <article className={`client-milestone ${isNext ? "next" : ""}`} key={milestone.id}>
                    <div className="milestone-index">{isReleased ? <Check size={16} /> : index + 1}</div>
                    <div className="client-milestone-body">
                      <div className="client-milestone-heading">
                        <div><strong>{milestone.title}</strong><span>Due {formatDate(milestone.dueDate)}</span></div>
                        <strong>{formatMoney(milestone.amountCents)}</strong>
                      </div>
                      <p>{milestone.description}</p>
                      <div className={`deliverable-row ${isReleased ? "released" : ""}`}>
                        {isReleased ? <Download size={16} /> : <LockKeyhole size={16} />}
                        <span>{milestone.deliverableName ?? "Digital deliverable"}</span>
                        {isReleased && milestone.deliverableStorageKey ? (
                          <a
                            href={`/api/invoices/${invoice.id}/milestones/${milestone.id}/deliverable`}
                            download
                          >
                            Download
                          </a>
                        ) : isReleased ? (
                          <small>Release recorded</small>
                        ) : (
                          <small>Unlocks after payment</small>
                        )}
                      </div>
                      {isNext ? (
                        <>
                          <div className="milestone-payment-actions">
                            <button
                              className="button primary milestone-pay-button"
                              disabled={payingMilestoneId !== null}
                              onClick={() => payWithWallet(milestone)}
                            >
                              {payingMilestoneId === milestone.id ? (
                                <><LoaderCircle className="spin" size={17} /> Confirming on Celo...</>
                              ) : (
                                <><Wallet size={17} /> Pay {formatMoney(milestone.amountCents)}</>
                              )}
                            </button>
                            {process.env.NODE_ENV !== "production" ? (
                              <button
                                className="text-button demo-payment-button"
                                disabled={payingMilestoneId !== null}
                                onClick={() => confirmDemoPayment(milestone)}
                              >
                                Run demo settlement
                              </button>
                            ) : null}
                          </div>
                          <div className="agent-endpoint">
                            <Braces size={15} />
                            <div>
                              <span>Agent payment endpoint</span>
                              <code>/api/x402/.../{milestone.id.slice(-8)}</code>
                            </div>
                            <button
                              aria-label={`Copy x402 endpoint for ${milestone.title}`}
                              onClick={() => copyAgentEndpoint(milestone.id)}
                            >
                              {copiedEndpointId === milestone.id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="payment-aside">
            <div className="agent-note">
              <span className="agent-note-icon"><Sparkles size={17} /></span>
              <div><span>Tenda agent</span><strong>{nextMilestone ? `Next: ${nextMilestone.title}` : "All milestones settled"}</strong><p>{nextMilestone ? "Payment is sent directly to the freelancer. Tenda releases the file after settlement." : "The complete handoff is available and the payment record is finalized."}</p></div>
            </div>

            <div className="receipt-panel">
              <ReceiptText size={19} />
              <div><strong>Onchain receipt</strong><p>Every settlement is recorded on Celo and linked to this invoice.</p></div>
              <button className="text-button">View activity <ExternalLink size={14} /></button>
            </div>

            <div className="network-panel">
              <span className="network-mark">C</span>
              <div><span>Settlement network</span><strong>Celo mainnet</strong></div>
              <span className={`network-status ${walletDetected ? "" : "wallet-missing"}`}>
                <i /> {walletDetected ? "Wallet ready" : "Wallet not detected"}
              </span>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            <p className="demo-disclaimer">Payments settle directly to the freelancer in USDC. Tenda verifies the Celo receipt before releasing work.</p>
          </aside>
        </section>
      </main>

      <footer className="client-footer"><span>Payment terms secured by TendaPay</span><span>USDC · Celo</span></footer>
    </div>
  );
}
