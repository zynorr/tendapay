# Demo Guide

## Start from a clean state

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell uses `Copy-Item .env.example .env.local` for the second
command. Remove `.data/` before starting when you need the original sample
invoice again. Do not remove it if it contains deliverables you need.

## Freelancer flow

1. Open the dashboard.
2. Select **New invoice**.
3. Enter the project, client, receiving wallet, and milestone details.
4. Attach a deliverable to one or more milestones.
5. Create the invoice and open its client link from the invoice list.

## Client flow without funds

1. Open `TD-001` from the dashboard.
2. Review the recipient, milestone amount, and protected file.
3. Select **Run demo settlement** under the next payment button.
4. Confirm that progress updates and the matching deliverable is released.
5. Download the released file when that milestone has an uploaded attachment.

Demo settlement is available only when `NODE_ENV` is not `production`.

## Live wallet flow

Before presenting a live payment, confirm that:

- The client browser has MiniPay or another injected EIP-1193 wallet.
- The wallet holds enough Celo USDC for the milestone and transaction fee.
- The receiving address belongs to the intended freelancer.
- `NEXT_PUBLIC_CELO_ATTRIBUTION_CODE` contains the registered application code.

Select the milestone payment button, approve the chain switch if requested, and
approve the USDC transaction. TendaPay waits for the receipt and independently
verifies it before releasing the file. After wallet approval, the transaction
hash is retained in the browser until confirmation succeeds. If verification
is interrupted, select **Resume confirmation**; this retries the existing hash
and does not send another payment.

## x402 flow

Configure `THIRDWEB_SECRET_KEY` and `THIRDWEB_SERVER_WALLET_ADDRESS`, then use the
agent endpoint shown below the next milestone. An unpaid request should receive
a `402` challenge. A payment-capable client can satisfy that challenge and
receive the deliverable in the same request flow.

## Reset and health checks

Run the repository checks before a demo:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The production build currently emits a non-blocking warning from the transitive
thirdweb `ox/tempo` module. The application build still completes successfully.
