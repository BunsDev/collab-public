import log from "electron-log/main.js";
import { join } from "node:path";
import { COLLAB_DIR } from "./paths";

const sessionTimestamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replace(/\.\d+Z$/, "");

log.transports.file.resolvePathFn = () =>
  join(COLLAB_DIR, "logs", `main-${sessionTimestamp}.log`);

log.initialize();

// Route console.* to electron-log so main-process output
// goes to both stdout and the log file.
Object.assign(console, {
  log: log.info,
  info: log.info,
  warn: log.warn,
  error: log.error,
  debug: log.debug,
});

export default log;
