import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./product-upload.css";
import "./design-tokens.css";
import "./crm.css";
import "./feedback.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
