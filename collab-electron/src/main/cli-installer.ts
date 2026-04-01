import { app } from "electron";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const IS_WIN = process.platform === "win32";
const INSTALL_DIR = IS_WIN
  ? join(
    process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local"),
    "Collaborator",
    "bin",
  )
  : join(homedir(), ".local", "bin");
const INSTALL_PATH = join(INSTALL_DIR, IS_WIN ? "collab-canvas.cmd" : "collab-canvas");
const WINDOWS_AUXILIARY = ["collab-canvas.ps1"];
const COLLAB_DIR = join(homedir(), ".collaborator");
const HINT_MARKER = join(COLLAB_DIR, "cli-path-hinted");

function getCliSource(): string {
  const fileName = IS_WIN ? "collab-canvas.cmd" : "collab-canvas-cli.sh";
  if (app.isPackaged) {
    return join(process.resourcesPath, fileName);
  }
  return join(app.getAppPath(), "scripts", fileName);
}

function getAuxiliaryCliSources(): Array<{ source: string; target: string }> {
  if (!IS_WIN) return [];
  return WINDOWS_AUXILIARY.map((fileName) => ({
    source: app.isPackaged
      ? join(process.resourcesPath, fileName)
      : join(app.getAppPath(), "scripts", fileName),
    target: join(INSTALL_DIR, fileName),
  }));
}

export function installCli(): void {
  const source = getCliSource();
  if (!existsSync(source)) {
    console.warn(
      "[cli-installer] CLI source not found:", source,
    );
    return;
  }

  const legacyNames = IS_WIN
    ? ["collab.cmd", "collab.ps1"]
    : ["collab"];
  for (const name of legacyNames) {
    const legacy = join(INSTALL_DIR, name);
    if (existsSync(legacy)) {
      unlinkSync(legacy);
      console.log("[cli-installer] removed legacy CLI:", legacy);
    }
  }

  mkdirSync(INSTALL_DIR, { recursive: true });
  copyFileSync(source, INSTALL_PATH);
  for (const extra of getAuxiliaryCliSources()) {
    if (existsSync(extra.source)) {
      copyFileSync(extra.source, extra.target);
    } else {
      console.warn("[cli-installer] Auxiliary CLI source not found:", extra.source);
    }
  }
  if (!IS_WIN) {
    chmodSync(INSTALL_PATH, 0o755);
  }

  if (!existsSync(HINT_MARKER)) {
    const pathEnv = process.env["PATH"] ?? "";
    const separator = IS_WIN ? ";" : ":";
    if (!pathEnv.split(separator).includes(INSTALL_DIR)) {
      const hint = IS_WIN
        ? `[cli-installer] collab-canvas installed to ${INSTALL_PATH}. ` +
          `Add ${INSTALL_DIR} to your PATH to use it from any terminal.`
        : `[cli-installer] collab-canvas installed to ${INSTALL_PATH}. ` +
          `Add ~/.local/bin to your PATH to use it from any terminal:\n` +
          `  export PATH="$HOME/.local/bin:$PATH"`;
      console.log(
        hint,
      );
      mkdirSync(COLLAB_DIR, { recursive: true });
      writeFileSync(HINT_MARKER, "", "utf-8");
    }
  }
}
