import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <App />
    </div>
  </React.StrictMode>
);
