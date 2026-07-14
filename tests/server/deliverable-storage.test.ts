import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

test("S3 storage writes, reads, and deletes a private deliverable", async () => {
  const objects = new Map<string, Buffer>();
  const server = createServer((request, response) => {
    const key = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

    if (request.method === "PUT") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        objects.set(key, Buffer.concat(chunks));
        response.writeHead(200, { ETag: '"test-etag"' });
        response.end();
      });
      return;
    }

    if (request.method === "GET") {
      const contents = objects.get(key);
      if (!contents) {
        response.writeHead(404);
        response.end();
        return;
      }

      response.writeHead(200, {
        "Content-Length": contents.byteLength,
        "Content-Type": "application/octet-stream",
      });
      response.end(contents);
      return;
    }

    if (request.method === "DELETE") {
      objects.delete(key);
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(405);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ENDPOINT = `http://127.0.0.1:${address.port}`;
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_FORCE_PATH_STYLE = "true";

  try {
    const { deleteDeliverable, readDeliverable, storeDeliverable } = await import(
      "@/lib/server/deliverable-storage"
    );
    const contents = Buffer.from("TendaPay protected handoff");
    const stored = await storeDeliverable({
      invoiceId: "inv_test",
      milestoneId: "mil_test",
      file: new File([contents], "Final handoff.zip", {
        type: "application/zip",
      }),
    });

    assert.match(stored.storageKey, /^inv_test\/mil_test\//);
    assert.equal(stored.name, "Final-handoff.zip");
    assert.deepEqual(await readDeliverable(stored.storageKey), contents);

    await deleteDeliverable(stored.storageKey);
    await assert.rejects(readDeliverable(stored.storageKey));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
