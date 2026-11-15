// Keep source links, numbers and units while removing model-generated Markdown decoration.
export function plainAdvisorText(value: string): string {
  return value
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>+[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[*•●▪◦]|[-+](?![ \t]+\d))[ \t]+/gm, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/(\d)[ \t]*\*[ \t]*(?=\d)/g, "$1 × ")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/(?<!\w)_{1,3}([^_\n]+)_{1,3}(?!\w)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
