# TendaPay

TendaPay is a milestone payment workspace for independent professionals and
their clients. Clients pay each milestone directly to the freelancer in USDC
on Celo. TendaPay verifies the settlement and unlocks the matching deliverable.

The application does not custody project funds.

## MVP

- Create milestone invoices and attach deliverables.
- Share a focused client payment page.
- Pay exact USDC amounts with MiniPay or another injected EVM wallet.
- Verify token, recipient, amount, receipt status, and transaction reuse.
- Append ERC-8021 attribution to browser wallet transactions.
- Release protected files after confirmed settlement.
- Offer milestone files through an x402 payment endpoint for agents.
- Run simulated settlements in development without a funded wallet.

## Local setup

TendaPay requires Node.js 24 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of
`cp`. Open [http://localhost:3000](http://localhost:3000) after the server
starts. Next.js selects another port when 3000 is unavailable.

The first request creates a sample invoice in `.data/invoices.json`.
Application data and uploaded files under `.data/` are local-only and ignored
by Git.

## Configuration

Copy `.env.example` and set only the integrations you need:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CELO_RPC_URL` | No | Celo RPC; defaults to Forno. |
| `NEXT_PUBLIC_CELO_ATTRIBUTION_CODE` | Production | Registered ERC-8021 application code. |
| `THIRDWEB_SECRET_KEY` | x402 only | Server-side thirdweb client credential. |
| `THIRDWEB_SERVER_WALLET_ADDRESS` | x402 only | Wallet that signs facilitator requests. |
| `X402_FACILITATOR_URL` | No | Defaults to `https://x402.celo.org`. |

Never expose the thirdweb secret through a `NEXT_PUBLIC_` variable.

## Commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Demo guide](docs/demo.md)

## MVP boundaries

The current repository uses JSON and local disk storage to keep the hackathon
demo self-contained. A production deployment needs authenticated freelancer
accounts, a transactional database, private object storage, expiring client
links, and operational monitoring.
