import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { create_mx_resolver } from "./lib.ts";
import type { MxResolverOptions } from "./lib.ts";

function get(port: number, path: string) {
  return new Promise<{
    status: number;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  }>((resolve, reject) => {
    request({ port, path }, (res) => {
      let raw = "";
      res.on("data", (chunk: string) => (raw += chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode!,
          body: JSON.parse(raw),
          headers: res.headers,
        }),
      );
    })
      .on("error", reject)
      .end();
  });
}

async function make_test_server(options: MxResolverOptions) {
  const server = create_mx_resolver(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    [Symbol.asyncDispose]: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("resolves MX records", async () => {
  await using server = await make_test_server({
    resolve_mx: async () => [
      { exchange: "mx.ox.numerique.gouv.fr", priority: 1 },
    ],
  });
  const { status, body } = await get(server.port, "/beta.gouv.fr");
  assert.equal(status, 200);
  assert.deepEqual(body, [
    { exchange: "mx.ox.numerique.gouv.fr", priority: 1 },
  ]);
});

test("returns error when no MX records", async () => {
  await using server = await make_test_server({
    resolve_mx: async (domain) => {
      throw Object.assign(new Error(`queryMx ENODATA ${domain}`), {
        code: "ENODATA",
      });
    },
  });
  const { status, body } = await get(server.port, "/alpha.gouv.fr");
  assert.equal(status, 404);
  assert.deepEqual(body, { error: "ENODATA alpha.gouv.fr" });
});

test("returns error when domain missing", async () => {
  await using server = await make_test_server({ resolve_mx: async () => [] });
  const { status, body } = await get(server.port, "/");
  assert.equal(status, 400);
  assert.deepEqual(body, { error: "domain required" });
});

// Step 1 — input validation
for (const bad of [
  "localhost",
  "192.168.1.1",
  "../etc/passwd",
  "<script>",
  "foo",
]) {
  test(`rejects invalid domain: ${bad}`, async () => {
    await using server = await make_test_server({ resolve_mx: async () => [] });
    const { status, body } = await get(server.port, `/${bad}`);
    assert.equal(status, 400);
    assert.deepEqual(body, { error: "invalid domain" });
  });
}

// Step 2 — error message leakage
test("does not leak unexpected error internals", async () => {
  await using server = await make_test_server({
    resolve_mx: async () => {
      throw new Error(
        "ECONNREFUSED tcp://internal-resolver:53 - socket hang up",
      );
    },
  });
  const { status, body } = await get(server.port, "/example.com");
  assert.equal(status, 404);
  assert.deepEqual(body, { error: "DNS resolution failed" });
});

test("forwards safe DNS error codes", async () => {
  await using server = await make_test_server({
    resolve_mx: async (domain) => {
      throw Object.assign(new Error(`queryMx ENOTFOUND ${domain}`), {
        code: "ENOTFOUND",
      });
    },
  });
  const { status, body } = await get(server.port, "/example.com");
  assert.equal(status, 404);
  assert.deepEqual(body, { error: "ENOTFOUND example.com" });
});

// Cache-Control headers
test("200 response has Cache-Control max-age=300", async () => {
  await using server = await make_test_server({
    resolve_mx: async () => [{ exchange: "mx.example.com", priority: 10 }],
  });
  const { headers } = await get(server.port, "/example.com");
  assert.equal(headers["cache-control"], "public, max-age=300");
});

test("404 response has Cache-Control max-age=60", async () => {
  await using server = await make_test_server({
    resolve_mx: async (domain) => {
      throw Object.assign(new Error(`ENODATA ${domain}`), { code: "ENODATA" });
    },
  });
  const { headers } = await get(server.port, "/example.com");
  assert.equal(headers["cache-control"], "public, max-age=60");
});

test("400 response has Cache-Control no-store", async () => {
  await using server = await make_test_server({ resolve_mx: async () => [] });
  const { headers } = await get(server.port, "/");
  assert.equal(headers["cache-control"], "no-store");
});

test("504 response has Cache-Control no-store", async () => {
  await using server = await make_test_server({
    resolve_mx: () => new Promise((resolve) => setTimeout(resolve, 100)),
    timeout: 50,
  });
  const { headers } = await get(server.port, "/example.com");
  assert.equal(headers["cache-control"], "no-store");
});

// Step 3 — timeout
test("times out slow DNS", async () => {
  await using server = await make_test_server({
    resolve_mx: () => new Promise(() => {}),
    timeout: 1,
  });
  const { status, body } = await get(server.port, "/example.com");
  assert.equal(status, 504);
  assert.deepEqual(body, { error: "DNS timeout" });
});
