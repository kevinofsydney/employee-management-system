import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "./styles.css";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const demo = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("demo");
const root = createRoot(document.getElementById("root")!);
if (demo) {
  import("./demo").then(({ default: Demo }) => root.render(<React.StrictMode><Demo /></React.StrictMode>));
} else {
  root.render(<React.StrictMode>
    {key && !key.includes("replace_me") ? <ClerkProvider publishableKey={key}><App /></ClerkProvider> :
      <main className="setup"><h1>Translator Roster</h1><p>Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in a local <code>.env</code> file to enable sign-in.</p></main>}
  </React.StrictMode>);
}
