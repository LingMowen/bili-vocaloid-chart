import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import "./index.css";
import "./i18n/index.js";
import App from "./App.jsx";
import { queryClient } from "./query.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={400}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Tooltip.Provider>
  </StrictMode>
);