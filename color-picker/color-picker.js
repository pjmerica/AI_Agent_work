const colorInput = document.getElementById("colorInput");
const swatch = document.getElementById("swatch");
const hexVal = document.getElementById("hexVal");
const rgbVal = document.getElementById("rgbVal");
const hslVal = document.getElementById("hslVal");

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function updateDisplay(hex) {
  swatch.style.background = hex;
  hexVal.textContent = hex.toUpperCase();

  const { r, g, b } = hexToRgb(hex);
  rgbVal.textContent = `rgb(${r}, ${g}, ${b})`;

  const { h, s, l } = rgbToHsl(r, g, b);
  hslVal.textContent = `hsl(${h}, ${s}%, ${l}%)`;
}

colorInput.addEventListener("input", (e) => updateDisplay(e.target.value));

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.target;
    const text = document.getElementById(targetId).textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1500);
    });
  });
});

updateDisplay(colorInput.value);
