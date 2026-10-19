import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ command }) => {
  // The local Windows sandbox cannot let esbuild crawl parent directories during dependency optimisation.
  const optimise = { noDiscovery: true, include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "@clerk/react"] };
  return {
    plugins: [cloudflare()],
    optimizeDeps: optimise,
    environments: { translator_roster: { optimizeDeps: { ...optimise, ...(command === "serve" ? { disabled: true } : {}) } } }
  };
});
