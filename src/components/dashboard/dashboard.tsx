"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  WalletCards,
} from "lucide-react";

import type { Invoice } from "@/domain/invoice";
import type { WorkspaceSession } from "@/domain/workspace";
import { paidInvoiceCents, totalInvoiceCents } from "@/domain/invoice";
import { formatMoney, formatRelativeDate, shortenAddress } from "@/lib/format";
import { BrandMark } from "@/components/brand-mark";
import { StatusBadge } from "@/components/status-badge";
import { WalletSignIn } from "@/components/auth/wallet-sign-in";
import { InvoiceForm } from "./invoice-form";

export function Dashboard() {
  const [session, setSession] = useState<WorkspaceSession | null>();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const result = await response.json();
        return result.session as WorkspaceSession;
      })
      .then((authenticatedSession) => setSession(authenticatedSession))
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    fetch("/api/invoices")
      .then(async (response) => {
        if (response.status === 401) {
          setSession(null);
          return { invoices: [] };
        }

        return response.json();
      })
      .then((result) => setInvoices(result.invoices ?? []))
      .finally(() => setLoading(false));
  }, [session]);

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return invoices;
    }

    return invoices.filter((invoice) =>
      [invoice.title, invoice.clientName, invoice.number]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [invoices, query]);

  const metrics = useMemo(() => {
    const total = invoices.reduce((sum, invoice) => sum + totalInvoiceCents(invoice), 0);
    const collected = invoices.reduce((sum, invoice) => sum + paidInvoiceCents(invoice), 0);
    const active = invoices.filter((invoice) => invoice.status !== "paid").length;

    return { total, collected, active };
  }, [invoices]);

  const activity = useMemo(
    () =>
      invoices
        .flatMap((invoice) =>
          invoice.activity.map((entry) => ({ ...entry, invoiceNumber: invoice.number })),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [invoices],
  );

  if (session === undefined) {
    return (
      <main className="client-loading">
        <LoaderCircle className="spin" size={24} /> Loading workspace
      </main>
    );
  }

  if (!session) {
    return (
      <WalletSignIn
        onAuthenticated={(authenticatedSession) => {
          setLoading(true);
          setSession(authenticatedSession);
        }}
      />
    );
  }

  const workspaceName = invoices[0]?.freelancerName ?? "Freelancer workspace";
  const workspaceInitials = workspaceName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setInvoices([]);
    setSession(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <BrandMark />
          <span>TendaPay</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="nav-item active" href="#overview">
            <LayoutDashboard size={18} /> Overview
          </a>
          <a className="nav-item" href="#invoices">
            <FileText size={18} /> Invoices
            <span className="nav-count">{invoices.length}</span>
          </a>
          <a className="nav-item" href="#activity">
            <Bot size={18} /> Tenda agent
          </a>
          <a className="nav-item" href="#wallet">
            <WalletCards size={18} /> Wallet
          </a>
        </nav>

        <div className="sidebar-spacer" />

        <div className="agent-status">
          <span className="agent-status-icon"><Bot size={17} /></span>
          <div>
            <strong>Tenda is active</strong>
            <span>2 actions scheduled</span>
          </div>
          <span className="live-dot" />
        </div>

        <nav className="secondary-nav" aria-label="Account navigation">
          <a className="nav-item" href="#settings"><Settings size={18} /> Settings</a>
        </nav>

        <div className="profile-row">
          <span className="avatar">{workspaceInitials}</span>
          <div><strong>{workspaceName}</strong><span>{shortenAddress(session.address)}</span></div>
          <button
            className="profile-sign-out"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><BrandMark /><strong>TendaPay</strong></div>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search invoices"
              placeholder="Search invoices, clients, or IDs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="icon-button notification-button" aria-label="Notifications">
            <Bell size={18} /><span />
          </button>
          <button
            className="icon-button responsive-sign-out"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut size={17} />
          </button>
        </header>

        <div className="content-frame">
          <section className="page-heading" id="overview">
            <div>
              <span className="eyebrow">Tuesday, 14 July</span>
              <h1>Payments in motion</h1>
              <p>Structure the work, collect each milestone, and let Tenda handle the handoff.</p>
            </div>
            <button className="button primary" onClick={() => setShowInvoiceForm(true)}>
              <Plus size={17} /> New invoice
            </button>
          </section>

          <section className="metrics-grid" aria-label="Account metrics">
            <article className="metric-block">
              <span className="metric-icon green"><CircleDollarSign size={18} /></span>
              <div><span>Contract value</span><strong>{formatMoney(metrics.total)}</strong></div>
              <small>Across {invoices.length} invoices</small>
            </article>
            <article className="metric-block">
              <span className="metric-icon yellow"><Activity size={18} /></span>
              <div><span>Collected</span><strong>{formatMoney(metrics.collected)}</strong></div>
              <small>{metrics.total ? Math.round((metrics.collected / metrics.total) * 100) : 0}% settled</small>
            </article>
            <article className="metric-block">
              <span className="metric-icon coral"><Send size={18} /></span>
              <div><span>Active plans</span><strong>{metrics.active}</strong></div>
              <small>{metrics.active ? "Agent monitoring" : "Nothing outstanding"}</small>
            </article>
          </section>

          <section className="workspace-grid">
            <div className="invoice-panel" id="invoices">
              <div className="panel-heading">
                <div><h2>Invoices</h2><p>Live payment plans and client handoffs.</p></div>
                <button className="icon-button" aria-label="Invoice options"><MoreHorizontal size={18} /></button>
              </div>

              {loading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={22} /> Loading invoices</div>
              ) : filteredInvoices.length ? (
                <div className="invoice-list">
                  {filteredInvoices.map((invoice) => (
                    <Link className="invoice-row" href={`/pay/${invoice.id}`} key={invoice.id}>
                      <span className="invoice-file-icon"><FileText size={18} /></span>
                      <div className="invoice-identity">
                        <strong>{invoice.title}</strong>
                        <span>{invoice.number} / {invoice.clientName}</span>
                      </div>
                      <div className="invoice-progress">
                        <span>{invoice.milestones.filter((item) => ["paid", "released"].includes(item.status)).length}/{invoice.milestones.length} milestones</span>
                        <div><i style={{ width: `${(paidInvoiceCents(invoice) / totalInvoiceCents(invoice)) * 100}%` }} /></div>
                      </div>
                      <strong className="invoice-value">{formatMoney(totalInvoiceCents(invoice))}</strong>
                      <StatusBadge status={invoice.status} />
                      <ArrowUpRight size={17} className="row-arrow" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state"><FileText size={24} /><strong>No matching invoices</strong><span>Try another search or create a new payment plan.</span></div>
              )}
            </div>

            <aside className="activity-panel" id="activity">
              <div className="panel-heading"><div><h2>Tenda activity</h2><p>Decisions and scheduled actions.</p></div><span className="live-label"><i /> Live</span></div>
              <div className="activity-list">
                {activity.map((entry) => (
                  <div className="activity-entry" key={entry.id}>
                    <span className="activity-line" />
                    <span className="activity-dot"><Bot size={13} /></span>
                    <div><strong>{entry.message}</strong><span>{entry.invoiceNumber} / {formatRelativeDate(entry.createdAt)}</span></div>
                  </div>
                ))}
              </div>
              <button className="button secondary full-width"><Bot size={16} /> Review agent queue</button>
            </aside>
          </section>
        </div>
      </main>

      {showInvoiceForm ? (
        <InvoiceForm
          defaultWallet={session.address}
          onClose={() => setShowInvoiceForm(false)}
          onCreated={(invoice) => {
            setInvoices((current) => [invoice, ...current]);
            setShowInvoiceForm(false);
          }}
        />
      ) : null}
    </div>
  );
}
