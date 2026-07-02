import spawn from "cross-spawn";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Collect stdout/stderr/exit-code from a spawned child. Uses `cross-spawn` so
 * that Windows npm shims (e.g. `claude.cmd`) resolve correctly and arguments
 * are quoted safely — plain `child_process.execFile` cannot run `.cmd` files.
 * Never rejects — inspect `code`.
 */
function collect(
  command: string,
  args: string[],
  cwd: string,
  input?: string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", () => resolve({ stdout, stderr, code: 1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    if (input !== undefined && child.stdin) {
      child.stdin.on("error", () => {
        /* ignore EPIPE if the child exits early */
      });
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/** Run a command with no stdin. */
export function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<ExecResult> {
  return collect(command, args, cwd);
}

/**
 * Run a command, writing `input` to its stdin. Used for large prompts that
 * would exceed the OS argv length limit if passed as an argument.
 */
export function runWithInput(
  command: string,
  args: string[],
  cwd: string,
  input: string,
): Promise<ExecResult> {
  return collect(command, args, cwd, input);
}

/** True if an executable can be found on PATH (via `<cmd> --version`). */
export async function commandExists(
  command: string,
  cwd: string,
): Promise<boolean> {
  const res = await run(command, ["--version"], cwd);
  return res.code === 0;
}
