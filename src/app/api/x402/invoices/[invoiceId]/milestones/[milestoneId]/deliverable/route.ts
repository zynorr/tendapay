import { readDeliverable } from "@/lib/server/deliverable-storage";
import { invoiceRepository } from "@/lib/server/invoice-repository";
import { createThirdwebX402Gateway } from "@/lib/server/thirdweb-x402-gateway";
import { handleX402Deliverable } from "@/lib/server/x402-deliverable-handler";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string; milestoneId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const params = await context.params;

    return await handleX402Deliverable(request, params, {
      repository: invoiceRepository,
      readDeliverable,
      getGateway: createThirdwebX402Gateway,
    });
  } catch (error) {
    console.error("Unable to settle x402 milestone", error);
    return Response.json(
      { error: "The x402 payment could not be settled." },
      { status: 500 },
    );
  }
}
