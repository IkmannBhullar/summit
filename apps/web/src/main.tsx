// Browser entry point: mounts the React app into index.html's <div id="root">.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

// Fail loudly if index.html is missing the root element, instead of rendering nothing.
if (!rootElement) {
  throw new Error('Missing <div id="root"> in index.html');
}

createRoot(rootElement).render(
  // StrictMode runs extra checks in development (e.g. renders components
  // twice) to surface bugs early. It does nothing in production builds.
  <StrictMode>
    <App />
  </StrictMode>,
);
