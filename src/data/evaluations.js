let templates;
export function loadEvaluationTemplates() {
  templates ??= fetch(
    new URL("./evaluation-templates.json", import.meta.url),
  ).then(async (response) => {
    if (!response.ok) throw new Error("Predlošci evaluacije nisu dostupni.");
    return response.json();
  });
  return templates;
}
