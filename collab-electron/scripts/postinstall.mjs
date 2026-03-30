import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// On Windows, node-pty's build files need two patches:
// 1. winpty.gyp uses bare .bat filenames in cmd /c calls. Modern Windows may
//    not resolve them without a .\ prefix.
// 2. Both binding.gyp and winpty.gyp require Spectre-mitigated libraries
//    which may not be installed in VS Build Tools.
if (process.platform === "win32") {
  const winptyGyp = join(
    "node_modules",
    "node-pty",
    "deps",
    "winpty",
    "src",
    "winpty.gyp"
  );
  if (existsSync(winptyGyp)) {
    let content = readFileSync(winptyGyp, "utf8");
    content = content.replace(
      /&& GetCommitHash\.bat/g,
      "&& .\\\\GetCommitHash.bat"
    );
    content = content.replace(
      /&& UpdateGenVersion\.bat/g,
      "&& .\\\\UpdateGenVersion.bat"
    );
    content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
    writeFileSync(winptyGyp, content);
    console.log("Patched winpty.gyp");
  }

  const bindingGyp = join("node_modules", "node-pty", "binding.gyp");
  if (existsSync(bindingGyp)) {
    let content = readFileSync(bindingGyp, "utf8");
    content = content.replace(/'SpectreMitigation': 'Spectre'/g, "'SpectreMitigation': 'false'");
    writeFileSync(bindingGyp, content);
    console.log("Patched binding.gyp");
  }
}

execSync("electron-rebuild -f -w node-pty", { stdio: "inherit" });
