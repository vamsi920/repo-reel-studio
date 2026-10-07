(function () {
  const C = window.CASE;
  if (!C) return;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT_LABEL = { correct: "Correct", partial: "Partly right", wrong: "Wrong", not_covered: "Not in the docs" };
  const VERDICT_VAR = (v) => `var(--v-${v})`;

  document.querySelectorAll("[data-bind]").forEach((el) => {
    const v = C[el.dataset.bind];
    if (v != null) el.textContent = v;
  });

  // ---- Ledger ----
  let mode = "wiki";
  let pressed = null;

  function pct(list, who) {
    // Mean of both graders' points, the same number the scorecard uses.
    const pts = list.reduce((a, q) => a + q[who].score, 0);
    return Math.round((100 * pts) / list.length);
  }

  function renderLedger() {
    const grid = $("#ledger-grid");
    const data = C.ledger[mode];
    $("[data-bind-mode=note]").textContent = C.modeNotes[mode];
    grid.innerHTML = "";
    C.repos.forEach((repo) => {
      const qs = data[repo.id];
      if (!qs) return;
      const block = document.createElement("div");
      block.className = "repo-block";
      block.innerHTML = `<div class="repo-name">${esc(repo.name)}<small>${esc(repo.commit.slice(0, 8))}</small></div>`;
      [["neo", "neodevex", C.labels.neodevex], ["devin", "devin", C.labels.devin]].forEach(([cls, key, label]) => {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", `${label} on ${repo.name}`);
        row.innerHTML = `<span class="who ${cls}">${esc(label)}</span>`;
        qs.forEach((q, i) => {
          const g = q[key];
          const b = document.createElement("button");
          b.type = "button";
          b.className = "cell" + (g.hallucination ? " h" : "");
          b.style.background = VERDICT_VAR(g.verdict);
          b.setAttribute("aria-pressed", "false");
          b.setAttribute("aria-label", `${repo.name} question ${i + 1}, ${label}: ${VERDICT_LABEL[g.verdict]}${g.hallucination ? ", states something false" : ""}`);
          b.addEventListener("click", () => select(b, repo, q));
          row.appendChild(b);
        });
        const p = document.createElement("span");
        p.className = "pct";
        p.textContent = pct(qs, key) + "%";
        row.appendChild(p);
        block.appendChild(row);
      });
      grid.appendChild(block);
    });
  }

  function side(cls, label, g) {
    return `<div class="side ${cls}"><h4>${esc(label)}<span class="badge" style="background:${VERDICT_VAR(g.verdict)}">${VERDICT_LABEL[g.verdict]}</span>${g.hallucination ? '<span class="badge" style="background:var(--ink);color:var(--paper)">False claim</span>' : ""}</h4><p>${esc(g.note)}</p></div>`;
  }

  function select(btn, repo, q) {
    if (pressed) pressed.setAttribute("aria-pressed", "false");
    pressed = btn;
    btn.setAttribute("aria-pressed", "true");
    $("#ledger-detail").innerHTML =
      `<p class="meta">${esc(repo.name)} · ${esc(q.id)} · ${esc(q.category.replace("_", " "))}</p>` +
      `<p class="q">${esc(q.question)}</p>` +
      `<div class="pair">${side("neo", C.labels.neodevex, q.neodevex)}${side("devin", C.labels.devin, q.devin)}</div>` +
      `<p class="ref"><strong>Verified answer:</strong> ${esc(q.reference)}</p>`;
  }

  document.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      $("#ledger-detail").innerHTML = '<p class="detail-empty">Pick any square to see the question, both answers\' verdicts and the grader\'s reason.</p>';
      renderLedger();
    })
  );
  renderLedger();

  // ---- Scorecard ----
  const sc = $("#scorecard-table");
  sc.innerHTML =
    `<div class="sc-row head" role="row"><span class="sc-metric" role="columnheader">Metric</span><span role="columnheader">NeoDevEx baseline</span><span role="columnheader">NeoDevEx after fixes</span><span role="columnheader">Devin</span><span role="columnheader">Result</span></div>` +
    C.metrics
      .map((m) => {
        const fmt = (v) => (v == null ? "—" : m.fmt ? m.fmt.replace("{}", v) : v);
        const max = Math.max(...[m.base, m.ours, m.devin].filter((v) => typeof v === "number"), 0) || 1;
        const bar = (v) => (typeof v === "number" && m.bars ? `<span class="bar" style="width:${Math.max(4, (100 * v) / max)}%"></span>` : "");
        return `<div class="sc-row" role="row"><span class="sc-metric" role="cell">${esc(m.label)}<small>${esc(m.help)}</small></span>` +
          `<span class="sc-val base" role="cell">${esc(fmt(m.base))}${bar(m.base)}</span>` +
          `<span class="sc-val neo" role="cell">${esc(fmt(m.ours))}${bar(m.ours)}</span>` +
          `<span class="sc-val devin" role="cell">${esc(fmt(m.devin))}${bar(m.devin)}</span>` +
          `<span class="sc-call ${m.call}" role="cell">${esc(m.callText)}</span></div>`;
      })
      .join("");

  // ---- Gaps ----
  $("#gaps-list").innerHTML = C.gaps
    .map(
      (g) =>
        `<li><h3>${esc(g.title)}</h3><div><span class="lbl">What we found</span><p>${esc(g.finding)}</p></div><div><span class="lbl">What we changed</span><p>${esc(g.fix)}</p></div><div class="effect"><span class="lbl">Measured effect</span><p>${esc(g.effect)}</p></div></li>`
    )
    .join("");

  // ---- Method ----
  $("#repos-table tbody").innerHTML = C.repos
    .map((r) => `<tr><td>${esc(r.name)}</td><td><code>${esc(r.commit.slice(0, 10))}</code>${r.commitExact ? "" : " *"}</td><td>${esc(r.files)}</td><td>${esc(r.loc.toLocaleString("en-US"))}</td></tr>`)
    .join("");
  $("#method-list").innerHTML = C.method.map((m) => `<li>${esc(m)}</li>`).join("");
  $("#caveats").innerHTML = C.caveats.map((m) => `<li>${esc(m)}</li>`).join("");
  $("#downloads").innerHTML = C.downloads.map((d) => `<li><a href="${esc(d.href)}" download>${esc(d.label)}<small>${esc(d.help)}</small></a></li>`).join("");
})();
