import log from "electron-log/main.js";
import { join } from "node:path";
import { COLLAB_DIR } from "./paths";

log.transports.file.resolvePathFn = () =>
  join(COLLAB_DIR, "logs", "main.log");

log.initialize();

export default log;
