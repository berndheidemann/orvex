import React from "react";
import { Text } from "ink";

const { createElement: h } = React;

export function ProgressBar(props: {
  filled: number;
  total: number;
  width: number;
  color?: string;
}): React.ReactElement {
  const { filled, total, width, color = "green" } = props;
  const f = total > 0 ? Math.round((filled / total) * width) : 0;
  return h(Text, { color }, "█".repeat(f) + "░".repeat(Math.max(0, width - f)));
}
