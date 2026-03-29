let selectedSides = null;
let count = 1;

const rollBtn      = document.getElementById('rollBtn');
const countDisplay = document.getElementById('countDisplay');
const total        = document.getElementById('total');
const rolls        = document.getElementById('rolls');

// Die selection
document.querySelectorAll('.die-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.die-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSides = parseInt(btn.dataset.sides);
    rollBtn.disabled = false;
  });
});

// Stepper
document.getElementById('incBtn').addEventListener('click', () => {
  if (count < 20) { count++; countDisplay.textContent = count; }
});
document.getElementById('decBtn').addEventListener('click', () => {
  if (count > 1) { count--; countDisplay.textContent = count; }
});

// Roll
rollBtn.addEventListener('click', roll);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !rollBtn.disabled) roll(); });

function roll() {
  const results = Array.from({ length: count }, () => Math.floor(Math.random() * selectedSides) + 1);
  const sum = results.reduce((a, b) => a + b, 0);

  // Animate total
  total.classList.remove('pop');
  void total.offsetWidth; // reflow
  total.classList.add('pop');
  total.textContent = sum;
  setTimeout(() => total.classList.remove('pop'), 150);

  // Individual rolls (only show if more than 1 die)
  rolls.innerHTML = '';
  if (count > 1) {
    const maxVal = Math.max(...results);
    const minVal = Math.min(...results);
    results.forEach(r => {
      const pill = document.createElement('span');
      pill.className = 'roll-pill';
      if (r === maxVal && maxVal !== minVal) pill.classList.add('max');
      if (r === minVal && maxVal !== minVal) pill.classList.add('min');
      pill.textContent = r;
      rolls.appendChild(pill);
    });
  }
}
