import { ClientInvoice } from "@/components/client/client-invoice";

type PageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function PaymentPage({ params }: PageProps) {
  const { invoiceId } = await params;
  return <ClientInvoice invoiceId={invoiceId} />;
}
