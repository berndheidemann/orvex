import React from "react";
import { Box, Text, useInput } from "ink";
import type { EduInitConfig } from "../hooks/useEduInitRunner.ts";
import type { ProjectContext } from "../hooks/useProjectContext.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";

const { createElement: h, useState } = React;

// ── Field definitions ──────────────────────────────────────────

type EduFieldKey = "fach" | "thema" | "jahrgangsstufe" | "vorwissen" | "zeitMinuten" | "heterogenitaet";
type ActiveEduField = EduFieldKey | "summary";

interface EduFieldDef {
  key: EduFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  numeric: boolean;
}

const EDU_FIELDS: EduFieldDef[] = [
  { key: "fach",           label: "Fach",                                    placeholder: "z. B. Mathematik, Deutsch, Biologie",     required: true,  numeric: false },
  { key: "thema",          label: "Thema",                                   placeholder: "z. B. Bruchrechnung, Lyrik, Fotosynthese", required: true,  numeric: false },
  { key: "jahrgangsstufe", label: "Jahrgangsstufe",                          placeholder: "z. B. 7, 10, Q1",                         required: true,  numeric: false },
  { key: "vorwissen",      label: "Vorwissen der Lernenden",                 placeholder: "z. B. Grundrechenarten beherrscht",        required: true,  numeric: false },
  { key: "zeitMinuten",    label: "Unterrichtszeit (Minuten)",               placeholder: "z. B. 45, 90",                            required: true,  numeric: true  },
  { key: "heterogenitaet", label: "Heterogenität / besondere Anforderungen", placeholder: "(optional — Enter überspringt)",           required: false, numeric: false },
];

function validateField(field: EduFieldDef, value: string): string | null {
  if (field.required && value.trim() === "") {
    return `${field.label} ist ein Pflichtfeld`;
  }
  if (field.numeric && value.trim() !== "") {
    const parsed = parseInt(value.trim(), 10);
    if (isNaN(parsed) || parsed <= 0) {
      return "Bitte eine Zahl > 0 eingeben";
    }
  }
  return null;
}

// ── EduSetup ───────────────────────────────────────────────────

export function EduSetup(props: {
  onStart: (config: EduInitConfig) => void;
  projectContext?: ProjectContext;
}): React.ReactElement {
  const { onStart, projectContext } = props;
  const { columns } = useTerminalSize();

  const [values, setValues] = useState<Record<EduFieldKey, string>>({
    fach: "",
    thema: "",
    jahrgangsstufe: "",
    vorwissen: "",
    zeitMinuten: "",
    heterogenitaet: "",
  });
  const [activeField, setActiveField] = useState<ActiveEduField>("fach");
  const [error, setError] = useState("");

  const divider = "─".repeat(Math.min(columns, 60));
  const currentFieldIdx = EDU_FIELDS.findIndex((f) => f.key === activeField);
  const currentFieldDef = currentFieldIdx >= 0 ? EDU_FIELDS[currentFieldIdx] : null;

  const advanceField = () => {
    const nextIdx = currentFieldIdx + 1;
    if (nextIdx >= EDU_FIELDS.length) {
      setActiveField("summary");
    } else {
      setActiveField(EDU_FIELDS[nextIdx].key);
    }
    setError("");
  };

  const doStart = (vals: Record<EduFieldKey, string>) => {
    const zeitVal = parseInt(vals.zeitMinuten.trim(), 10);
    onStart({
      fach: vals.fach.trim(),
      thema: vals.thema.trim(),
      jahrgangsstufe: vals.jahrgangsstufe.trim(),
      vorwissen: vals.vorwissen.trim(),
      zeitMinuten: isNaN(zeitVal) ? 45 : zeitVal,
      heterogenitaet: vals.heterogenitaet.trim(),
    });
  };

  useInput((input, key) => {
    if (activeField === "summary") {
      if (key.return || input === "y" || input === "j") {
        doStart(values);
      } else if (key.escape || input === "n") {
        setValues({ fach: "", thema: "", jahrgangsstufe: "", vorwissen: "", zeitMinuten: "", heterogenitaet: "" });
        setActiveField("fach");
        setError("");
      }
      return;
    }

    if (!currentFieldDef) return;

    // Escape — jump to summary view (shows what was entered, allows confirm or restart)
    if (key.escape) {
      setActiveField("summary");
      setError("");
      return;
    }

    // Tab — skip current field (bypasses required check)
    if (key.tab) {
      advanceField();
      return;
    }

    if (key.return) {
      const err = validateField(currentFieldDef, values[currentFieldDef.key]);
      if (err) {
        setError(err);
      } else {
        advanceField();
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValues((prev: Record<EduFieldKey, string>) => ({
        ...prev,
        [currentFieldDef.key]: prev[currentFieldDef.key].slice(0, -1),
      }));
      setError("");
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      // Numeric fields: only accept digits
      if (currentFieldDef.numeric && !/^[0-9]$/.test(input)) return;
      setValues((prev: Record<EduFieldKey, string>) => ({
        ...prev,
        [currentFieldDef.key]: prev[currentFieldDef.key] + input,
      }));
      setError("");
    }
  });

  if (activeField === "summary") {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(
        Box,
        { flexDirection: "row", gap: 2 },
        h(Text, { bold: true, color: "cyan" }, "Orvex"),
        h(Text, { dimColor: true }, "—"),
        h(Text, { dimColor: true }, "Edu-Init — Zusammenfassung"),
      ),
      h(Text, { dimColor: true }, divider),
      h(Box, { flexDirection: "column", marginTop: 1 },
        ...EDU_FIELDS.map((f) =>
          h(
            Box,
            { key: f.key, flexDirection: "row", gap: 1, marginBottom: 0 },
            h(Text, { dimColor: true }, `${f.label}:`),
            h(Text, {}, ` ${values[f.key] || "(leer)"}`),
          )
        ),
      ),
      h(Text, { dimColor: true }, ""),
      h(Text, { dimColor: true }, divider),
      h(Text, { dimColor: true }, "  [Enter / y] Start    [Esc / n] Neustart"),
    );
  }

  const fieldIdx = EDU_FIELDS.findIndex((f) => f.key === activeField);

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, `Edu-Init — Feld ${fieldIdx + 1} / ${EDU_FIELDS.length}`),
    ),
    h(Text, { dimColor: true }, divider),
    projectContext && projectContext.files.length > 0
      ? h(Box, { flexDirection: "column", marginTop: 1 },
          h(Text, { dimColor: true }, `  ${projectContext.files.length} Projektdatei(en) gefunden`),
          projectContext.loading
            ? h(Text, { dimColor: true }, "  ⏳ Zusammenfassung wird erstellt…")
            : projectContext.summary
            ? h(Text, { dimColor: true }, `  ${projectContext.summary}`)
            : h(Text, { dimColor: true }, "  (Zusammenfassung nicht verfügbar)"),
        )
      : null,
    h(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(
        Text,
        { bold: true, color: "yellow" },
        currentFieldDef?.label ?? "",
      ),
      currentFieldDef
        ? h(Text, { dimColor: true }, `  ${currentFieldDef.placeholder}`)
        : null,
      h(
        Box,
        { flexDirection: "row", marginTop: 0 },
        h(Text, { color: "yellow" }, "▶ "),
        h(Text, {}, (values[activeField as EduFieldKey] ?? "") + "█"),
      ),
      error
        ? h(Text, { color: "red" }, `  ⚠  ${error}`)
        : null,
    ),
    // Completed fields above
    fieldIdx > 0
      ? h(Box, { flexDirection: "column", marginTop: 1 },
          h(Text, { dimColor: true }, "Bisherige Eingaben:"),
          ...EDU_FIELDS.slice(0, fieldIdx).map((f) =>
            h(
              Box,
              { key: f.key, flexDirection: "row", gap: 1 },
              h(Text, { dimColor: true }, `  ${f.label}:`),
              h(Text, {}, ` ${values[f.key] || "(leer)"}`),
            )
          ),
        )
      : null,
    h(Text, { dimColor: true }, ""),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true },
      "[Enter] Weiter    [Tab] Feld überspringen    [Esc] Zusammenfassung & Start    [Backspace] Löschen",
    ),
  );
}
