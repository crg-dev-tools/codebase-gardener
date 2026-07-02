#!/usr/bin/env node
import { main } from "./cli";

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
