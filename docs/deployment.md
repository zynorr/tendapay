# Deployment

TendaPay selects production persistence through environment variables. Setting
`DATABASE_URL` enables PostgreSQL. Setting `S3_BUCKET` enables private
S3-compatible file storage. Without them, the application uses `.data/`.

## PostgreSQL

Create a database, set a connection string, and run the tracked migrations:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/tendapay?sslmode=require
```

```bash
npm run db:migrate
```

Migrations are applied once and recorded in `tendapay_schema_migrations`.
Application deployments should run migrations before sending traffic to a new
version.

The PostgreSQL repository stores validated invoice documents in JSONB while
keeping invoice numbers and transaction hashes under database-level unique
constraints. Updates lock the selected invoice row and commit atomically.

## Private object storage

The bucket must not allow public reads. TendaPay downloads objects server-side
only after the invoice repository reports that the milestone is released.

```dotenv
S3_BUCKET=tendapay-deliverables
S3_REGION=us-east-1
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

The application needs these bucket actions:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

Leave `S3_ENDPOINT` blank for AWS. Set it for an S3-compatible provider. Access
keys are optional when the deployment platform supplies workload credentials.

## Deployment order

1. Provision PostgreSQL and a private bucket.
2. Set server-side environment variables.
3. Run `npm run db:migrate`.
4. Build and start the application.
5. Create an invoice, upload a small file, and confirm that it remains locked.
6. Complete a settlement and verify that the same file can now be downloaded.

Switching an existing environment from local storage to cloud adapters does not
move old `.data` records or files. Migrate that data before enabling the new
variables if it must be retained.
