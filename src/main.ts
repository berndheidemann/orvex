import React from "react";
import { render, Box, Text } from "ink";
import { Dashboard } from "./components/Dashboard.ts";

const { createElement: h } = React;

function App(): React.ReactElement {
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyan" }, "Kinema"),
    h(Text, { dimColor: true }, "─".repeat(40)),
    h(Dashboard, null),
  );
}

render(h(App, null));
