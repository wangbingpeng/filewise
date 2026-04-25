import { runMigrations } from "./migrate";

let initialized = false;

export function ensureDbInitialized() {
  if (!initialized) {
    runMigrations();
    initialized = true;
  }
}
