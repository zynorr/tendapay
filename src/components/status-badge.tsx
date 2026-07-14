import type { Invoice, Milestone } from "@/domain/invoice";

type Status = Invoice["status"] | Milestone["status"];

const labels: Record<Status, string> = {
  draft: "Draft",
  sent: "Awaiting payment",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  pending: "Due",
  payment_pending: "Confirming",
  released: "Released",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
