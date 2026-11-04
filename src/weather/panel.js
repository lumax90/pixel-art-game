// The weather panel: a button in the top right corner, and a slider for each value in CONTROLS.
import { CONTROLS, weather } from "./weather.js";

const REFRESH_MS = 250;

const element = (tag, id, text) => {
  const node = document.createElement(tag);
  if (id) node.id = id;
  if (text) node.textContent = text;
  return node;
};

export function setupWeatherPanel() {
  const button = element("button", "weather-button", "Hava"), panel = element("div", "weather-panel"), autoLine = element("label"), auto = element("input");
  const shelterLine = element("label"), shelter = element("input"), now = element("p");
  panel.hidden = true;
  auto.type = shelter.type = "checkbox";
  autoLine.append(auto, " Otomatik hava");
  shelterLine.append(shelter, " Kapalı alan (hava yok)");
  panel.append(element("h2", "", "Hava durumu"), now, autoLine, shelterLine);
  shelter.onchange = () => (weather.sheltered = shelter.checked);

  const rows = CONTROLS.map((control) => {
    const label = element("label"), name = element("span", "", control.name), shown = element("b"), slider = element("input");
    slider.type = "range";
    slider.min = control.min;
    slider.max = control.max;
    slider.step = control.step;
    slider.oninput = () => weather.set(control.id, Number(slider.value));
    label.append(name, shown, slider);
    panel.append(label);
    return { control, shown, slider };
  });

  const show = () => {
    auto.checked = weather.auto;
    now.textContent = weather.sheltered ? "Kapalı alan" : weather.auto ? `Şu an: ${weather.spell.name}` : "Elle ayarlı";
    for (const { control, shown, slider } of rows) {
      const value = weather.values[control.id];
      shown.textContent = control.unit ? `${Math.round(value)}${control.unit}` : `%${Math.round(value * 100)}`;
      if (weather.auto) slider.value = value;
    }
  };
  auto.onchange = () => (weather.auto = auto.checked);
  button.onclick = () => (panel.hidden = !panel.hidden);
  document.body.append(button, panel);
  setInterval(show, REFRESH_MS);
  show();
}
