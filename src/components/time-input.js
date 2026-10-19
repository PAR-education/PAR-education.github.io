// Native time controls follow the operating-system locale (including AM/PM).
// Keep the original input and its listeners, but render an explicit HH:mm control.
export function setupTimeInputs() {
  const convert = (root) => {
    const inputs = [...(root.querySelectorAll?.('input[type="time"]') || [])];
    if (root.matches?.('input[type="time"]')) inputs.push(root);
    for (const input of inputs) {
      input.type = "text";
      input.inputMode = "text";
      input.pattern = "([01][0-9]|2[0-3]):[0-5][0-9]";
      input.placeholder = "15:45";
      input.maxLength = 5;
      input.title = "24-satni format HH:mm, npr. 15:45";
      input.autocomplete = "off";
      const wrapper = document.createElement("span");
      wrapper.className = "time-input-24";
      input.before(wrapper);
      wrapper.append(input);
      const suffix = document.createElement("span");
      suffix.textContent = "h";
      suffix.setAttribute("aria-hidden", "true");
      wrapper.append(suffix);
    }
  };
  convert(document.body);
  new MutationObserver((changes) => {
    for (const change of changes)
      for (const node of change.addedNodes) convert(node);
  }).observe(document.body, { childList: true, subtree: true });
}
