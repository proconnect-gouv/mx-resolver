import { createServer } from "node:http";
import type { MxRecord } from "node:dns";

const DOMAIN_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const SAFE_CODES = new Set(["ENODATA", "ENOTFOUND", "ETIMEOUT", "ESERVFAIL"]);

export interface MxResolverOptions {
  resolve_mx: (domain: string) => Promise<MxRecord[]>;
  timeout?: number;
}

export function create_mx_resolver({
  resolve_mx,
  timeout = 5_000,
}: MxResolverOptions) {
  return createServer(async (req, res) => {
    const domain = req.url?.slice(1) ?? "";
    const json = { "Content-Type": "application/json" };

    if (!domain) {
      res.writeHead(400, { ...json, "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "domain required" }));
      return;
    }

    if (!DOMAIN_RE.test(domain)) {
      res.writeHead(400, { ...json, "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "invalid domain" }));
      return;
    }

    try {
      const records = await Promise.race([
        resolve_mx(domain),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" }),
              ),
            timeout,
          ),
        ),
      ]);
      res.writeHead(200, { ...json, "Cache-Control": "public, max-age=300" });
      res.end(JSON.stringify(records));
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (code === "ETIMEOUT") {
        res.writeHead(504, { ...json, "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "DNS timeout" }));
        return;
      }
      const message = SAFE_CODES.has(code)
        ? `${code} ${domain}`
        : "DNS resolution failed";
      res.writeHead(404, { ...json, "Cache-Control": "public, max-age=60" });
      res.end(JSON.stringify({ error: message }));
    }
  });
}
