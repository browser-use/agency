export type CardShortcut = "skip" | "improve" | "previous" | "next" | "focus";

type CardShortcutInput = {
  key: string;
  editable: boolean;
  repeat?: boolean;
  composing?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export function cardShortcut(input: CardShortcutInput): CardShortcut | null {
  if (input.editable || input.repeat || input.composing || input.metaKey || input.ctrlKey || input.altKey) return null;
  const key = input.key.toLowerCase();
  if (key === "s") return "skip";
  if (key === "i") return "improve";
  if (key === "arrowleft") return "previous";
  if (key === "arrowright") return "next";
  if (key === "enter") return "focus";
  return null;
}
