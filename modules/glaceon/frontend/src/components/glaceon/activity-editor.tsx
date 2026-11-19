"use client";

import dynamic from "next/dynamic";

// ponytail: trimmed down from front/'s MonacoCodeEditor — that one carries a
// multi-file workspace runtime, paste/drag action-guard and a custom
// CSS-var-driven theme engine, none of which apply here (GLACEON edits one
// file, has no anti-cheat requirement documented for the module yet). Ceiling:
// no paste-block, no custom syntax colors — upgrade path is porting
// front/src/lib/monaco/theme.ts if visual parity with the native editor ever
// matters.
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const EDITOR_LANGUAGE_BY_VARIANT: Record<string, string> = {
  terraform: "plaintext", // no HCL grammar in Monaco by default
  ansible: "yaml",
};

interface ActivityEditorProps {
  variant: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function ActivityEditor({ variant, value, onChange, readOnly }: ActivityEditorProps) {
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={EDITOR_LANGUAGE_BY_VARIANT[variant] ?? "plaintext"}
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        tabSize: 2,
        lineHeight: 22,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly,
      }}
    />
  );
}
