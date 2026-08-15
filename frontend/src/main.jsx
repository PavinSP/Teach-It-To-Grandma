import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConversationProvider } from "@elevenlabs/react";
import "./index.css";
// Imported and run before App, so `?reset` works even when the state it
// clears is the reason the app won't render.
import { runResetIfAsked } from "./reset";
import App from "./App.jsx";

const wasReset = runResetIfAsked();

if (wasReset) {
  console.log(
    wasReset === "all"
      ? "Reset everything — name, face, XP and badges are gone too."
      : "Reset the lesson. Your name, face, XP and badges are untouched."
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConversationProvider>
      <App />
    </ConversationProvider>
  </StrictMode>
);