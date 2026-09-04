const state = {
  sessionId: null,
  rounds: new Map(), // taskId -> { el, listEl, titleEl }
};

const el = {
  sessionId: document.getElementById("session-id"),
  sessionStatus: document.getElementById("session-status"),
  spentUsd: document.getElementById("spent-usd"),
  capUsd: document.getElementById("cap-usd"),
  spendFill: document.getElementById("spend-fill"),
  resumeBtn: document.getElementById("resume-btn"),
  bidFeed: document.getElementById("bid-feed"),
  paymentFeed: document.getElementById("payment-feed"),
  memoView: document.getElementById("memo-view"),
  form: document.getElementById("task-form"),
  prompt: document.getElementById("prompt"),
  complexity: document.getElementById("complexity"),
  budget: document.getElementById("budget"),
};

function fmtUsd(n) {
  return Number(n).toFixed(6);
}

function renderSession(session) {
  el.sessionId.textContent = session.sessionId.slice(0, 8);
  el.sessionStatus.textContent = session.status;
  el.sessionStatus.className = "badge " + (session.status !== "active" ? session.status : "");
  el.spentUsd.textContent = fmtUsd(session.spentUsd);
  el.capUsd.textContent = Number(session.capUsd).toFixed(2);
  const pct = Math.min(100, (session.spentUsd / session.capUsd) * 100);
  el.spendFill.style.width = pct + "%";
  el.spendFill.className = "spend-fill " + (session.status !== "active" ? session.status : "");
  el.resumeBtn.hidden = session.status !== "paused";
}

async function ensureSession() {
  const res = await fetch("/session", { method: "POST" });
  const session = await res.json();
  state.sessionId = session.sessionId;
  renderSession(session);
}

function getOrCreateRound(taskId, prompt, budgetUsd) {
  if (state.rounds.has(taskId)) return state.rounds.get(taskId);

  if (el.bidFeed.querySelector(".empty")) el.bidFeed.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "bid-round";
  const title = document.createElement("div");
  title.className = "bid-round-title";
  title.textContent = `"${(prompt || "").slice(0, 70)}" — budget $${Number(budgetUsd || 0).toFixed(2)}`;
  const list = document.createElement("div");
  wrapper.append(title, list);
  el.bidFeed.prepend(wrapper);

  const round = { el: wrapper, listEl: list, titleEl: title };
  state.rounds.set(taskId, round);
  return round;
}

function addBidRow(taskId, text, className) {
  const round = state.rounds.get(taskId) ?? getOrCreateRound(taskId, "", "");
  const row = document.createElement("div");
  row.className = "bid-row" + (className ? " " + className : "");
  row.textContent = text;
  row.dataset.provider = "";
  round.listEl.appendChild(row);
  return row;
}

function addPaymentRow(settlement) {
  if (el.paymentFeed.querySelector(".empty")) el.paymentFeed.innerHTML = "";
  const row = document.createElement("div");
  row.className = "payment-row" + (settlement.mode === "payment" && settlement.fallbackReason ? " fallback" : "");
  row.innerHTML = `
    <strong>${settlement.providerId}</strong> via ${settlement.mode}${settlement.fallbackReason ? " (fallback)" : ""} —
    $${fmtUsd(settlement.amountUsd)} —
    <a href="${settlement.explorerUrl}" target="_blank" rel="noopener">${settlement.txHash.slice(0, 12)}…</a>
  `;
  el.paymentFeed.prepend(row);
  el.memoView.textContent = JSON.stringify(settlement.memo, null, 2);
}

function handleEvent(evt) {
  if (evt.sessionId !== state.sessionId) return;

  switch (evt.type) {
    case "bid.received": {
      const b = evt.bid;
      addBidRow(evt.taskId, `${b.providerId} (${b.modelId}) — $${fmtUsd(b.estimatedTotalCostUsd)} @ quality ${b.qualityScore.toFixed(2)}`)
        .dataset.provider = b.providerId;
      break;
    }
    case "bid.excluded": {
      addBidRow(evt.taskId, `${evt.excluded.providerId} excluded — ${evt.excluded.reason}`, "excluded");
      break;
    }
    case "decision.made": {
      const round = state.rounds.get(evt.taskId);
      if (!round) break;
      for (const row of round.listEl.children) {
        if (row.dataset.provider === evt.decision.winner.providerId) row.classList.add("winner");
        else if (evt.decision.rejectedForBudget.includes(row.dataset.provider)) row.classList.add("rejected");
      }
      round.titleEl.textContent += ` — winner: ${evt.decision.winner.providerId} (${evt.decision.reason})`;
      break;
    }
    case "settlement.confirmed": {
      addPaymentRow(evt.settlement);
      break;
    }
    case "settlement.fallback": {
      const round = state.rounds.get(evt.taskId);
      if (round) round.titleEl.textContent += ` — channel failed, falling back to Payment (${evt.reason})`;
      break;
    }
    case "session.warning":
    case "session.paused":
    case "session.resumed": {
      renderSession(evt.session);
      break;
    }
    case "task.rejected":
    case "task.failed": {
      const round = state.rounds.get(evt.taskId);
      if (round) round.titleEl.textContent += ` — ${evt.type}: ${evt.reason}`;
      break;
    }
  }
}

function connectEvents() {
  const source = new EventSource("/events");
  source.onmessage = (msg) => {
    try {
      handleEvent(JSON.parse(msg.data));
    } catch {
      // ignore keep-alive / malformed frames
    }
  };
  source.onerror = () => {
    source.close();
    setTimeout(connectEvents, 2000);
  };
}

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = el.prompt.value.trim();
  const complexityHint = el.complexity.value;
  const budgetUsd = Number(el.budget.value);
  if (!prompt || !state.sessionId) return;

  const res = await fetch(`/session/${state.sessionId}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, complexityHint, budgetUsd }),
  });
  const { taskId } = await res.json();
  getOrCreateRound(taskId, prompt, budgetUsd);
  el.prompt.value = "";
});

el.resumeBtn.addEventListener("click", async () => {
  const res = await fetch(`/session/${state.sessionId}/resume`, { method: "POST" });
  const session = await res.json();
  renderSession(session);
});

ensureSession().then(connectEvents);
