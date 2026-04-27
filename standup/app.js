(function () {
  const QUESTIONS = window.STANDUP_QUESTIONS;
  const categoryKeys = Object.keys(QUESTIONS);

  // Track which categories are active (all by default)
  const active = new Set(categoryKeys);

  // Avoid repeats: keep track of the last few asked
  const recentlyAsked = [];
  const HISTORY_SIZE = 15;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $question = document.getElementById("question");
  const $category = document.getElementById("category");
  const $card = document.querySelector(".card");
  const $rollBtn = document.getElementById("roll");
  const $chipGroup = document.getElementById("chip-group");
  const $count = document.getElementById("question-count");

  const $memberInput = document.getElementById("member-input");
  const $addMember = document.getElementById("add-member");
  const $memberList = document.getElementById("member-list");
  const $assignAll = document.getElementById("assign-all");
  const $assignments = document.getElementById("assignments");

  const members = [];

  // ── Build category chips ───────────────────────────────────────────────────
  categoryKeys.forEach((key) => {
    const chip = document.createElement("button");
    chip.className = "chip active";
    chip.textContent = QUESTIONS[key].label;
    chip.dataset.key = key;
    chip.addEventListener("click", () => toggleCategory(key, chip));
    $chipGroup.appendChild(chip);
  });

  function toggleCategory(key, chip) {
    if (active.has(key)) {
      if (active.size === 1) return; // don't allow zero categories
      active.delete(key);
      chip.classList.remove("active");
    } else {
      active.add(key);
      chip.classList.add("active");
    }
    updateCount();
  }

  function updateCount() {
    let total = 0;
    active.forEach((k) => {
      total += QUESTIONS[k].questions.length;
    });
    $count.textContent = total;
  }

  // ── Pick a random question ─────────────────────────────────────────────────
  function pickQuestion() {
    const pool = [];
    active.forEach((key) => {
      QUESTIONS[key].questions.forEach((q) => {
        pool.push({ q, key, label: QUESTIONS[key].label, color: QUESTIONS[key].color });
      });
    });

    const fresh = pool.filter((p) => !recentlyAsked.includes(p.q));
    const candidates = fresh.length > 0 ? fresh : pool;

    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    recentlyAsked.push(choice.q);
    if (recentlyAsked.length > HISTORY_SIZE) recentlyAsked.shift();

    return choice;
  }

  function showQuestion() {
    const choice = pickQuestion();
    $question.textContent = choice.q;
    $category.textContent = choice.label;
    $category.style.color = choice.color;
    $category.style.background = hexToRgba(choice.color, 0.12);

    $card.classList.remove("flash");
    void $card.offsetWidth;
    $card.classList.add("flash");
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  $rollBtn.addEventListener("click", showQuestion);

  // Allow spacebar / enter to roll
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      showQuestion();
    }
  });

  // ── Team mode ──────────────────────────────────────────────────────────────
  function addMember(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (members.includes(trimmed)) return;
    members.push(trimmed);
    renderMembers();
    $assignAll.disabled = members.length === 0;
  }

  function removeMember(name) {
    const idx = members.indexOf(name);
    if (idx >= 0) members.splice(idx, 1);
    renderMembers();
    $assignAll.disabled = members.length === 0;
  }

  function renderMembers() {
    $memberList.innerHTML = "";
    members.forEach((m) => {
      const pill = document.createElement("span");
      pill.className = "member-pill";
      pill.innerHTML = `<span>${escapeHtml(m)}</span><span class="remove" title="Remove">×</span>`;
      pill.querySelector(".remove").addEventListener("click", () => removeMember(m));
      $memberList.appendChild(pill);
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  $addMember.addEventListener("click", () => {
    addMember($memberInput.value);
    $memberInput.value = "";
    $memberInput.focus();
  });

  $memberInput.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      e.preventDefault();
      addMember($memberInput.value);
      $memberInput.value = "";
    }
  });

  $assignAll.addEventListener("click", () => {
    $assignments.innerHTML = "";
    members.forEach((m) => {
      const choice = pickQuestion();
      const row = document.createElement("div");
      row.className = "assignment";
      row.innerHTML = `
        <div class="assignment-name" style="color: ${choice.color}">${escapeHtml(m)} — ${escapeHtml(choice.label)}</div>
        <div class="assignment-question">${escapeHtml(choice.q)}</div>
      `;
      $assignments.appendChild(row);
    });
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  updateCount();
})();
