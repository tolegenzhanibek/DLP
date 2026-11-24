import type { Theme } from "./types";

const media = window.matchMedia("(prefers-color-scheme: dark)");
let current: Theme = (() => {
  try {
    return (localStorage.getItem("theme") as Theme) || "system";
  } catch {
    return "system";
  }
})();

function apply() {
  const dark = current === "dark" || (current === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1020" : "#f6f7fb");
}

media.addEventListener("change", apply);
apply();

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
  apply();
}

export const getTheme = () => current;
