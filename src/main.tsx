import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// Last-resort guard: async failures are handled where they occur, but never
// let an unexpected rejection surface as an uncaught error in the console.
window.addEventListener("unhandledrejection", (event) => {
  console.error("[veyra] Unhandled promise rejection:", event.reason);
  event.preventDefault();
});

// StrictMode is intentionally omitted: its double-mount in development would
// request the webcam and load the model twice.
createRoot(document.getElementById("root")!).render(<App />);
