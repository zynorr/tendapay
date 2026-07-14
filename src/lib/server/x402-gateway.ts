export type X402SettlementRequest = {
  resourceUrl: string;
  paymentData: string | null;
  payTo: string;
  priceCents: number;
  description: string;
  mimeType: string;
  invoiceId: string;
  milestoneId: string;
};

export type X402SettlementResult =
  | {
      settled: false;
      status: number;
      responseBody: unknown;
      responseHeaders: Record<string, string>;
    }
  | {
      settled: true;
      transactionHash: string;
      payerAddress?: string;
      responseHeaders: Record<string, string>;
    };

export interface X402Gateway {
  settle(request: X402SettlementRequest): Promise<X402SettlementResult>;
}
