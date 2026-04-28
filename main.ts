import { resolveMx } from "node:dns/promises";
import { create_mx_resolver } from "./lib.ts";

create_mx_resolver({
  resolve_mx: resolveMx,
  timeout: Number(process.env["RESOLVE_TIMEOUT_MS"] ?? 5_000),
}).listen(Number(process.env["PORT"] ?? 3000), () => {
  console.log(`listening on http://localhost:${process.env["PORT"] ?? 3000}`);
});
