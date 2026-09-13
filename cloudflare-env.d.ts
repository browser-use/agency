// Bindings supplied by the local Vite/Cloudflare runtime in vite.config.ts.
declare module "cloudflare:workers" {
  export const env: {
    DB: import("@cloudflare/workers-types").D1Database;
    RADAR_AGENT_KEY?: string;
  };
}
