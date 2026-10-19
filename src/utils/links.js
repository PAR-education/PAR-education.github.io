import { escapeHTML as e } from "./helpers.js";
export function textWithLinks(value = "") {
  const text = String(value);
  let output = "", cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = match[0].replace(/[.,;!?]+$/, "");
    output += e(text.slice(cursor,match.index));
    output += `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(url)}</a>`;
    cursor = match.index + url.length;
  }
  return output + e(text.slice(cursor));
}
