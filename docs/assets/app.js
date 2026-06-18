const DATA_URL = "data/dashboard-data.json";
const REFRESH_MS = 30000;

let dashboardData = null;
let selectedPair = "ALL";
let selectedSignalId = null;

const els = {
  freshness: document.getElementById("dataFreshness"),
  metricSymbols: document.getElementById("metricSymbols"),
  metricOrders: document.getElementById("metricOrders"),
  metricDirection: document.getElementById("metricDirection"),
  metricActive: document.getElementById("metricActive"),
  metricConfidence: document.getElementById("metricConfidence"),
  metricLifecycle: document.getElementById("metricLifecycle"),
  symbolGrid: document.getElementById("symbolGrid"),
  symbolTabs: document.getElementById("symbolTabs"),
  selectedSignalLabel: document.getElementById("selectedSignalLabel"),
  signalFocus: document.getElementById("signalFocus"),
  strategyBars: document.getElementById("strategyBars"),
  engineAbout: document.getElementById("engineAbout"),
  symbolFilter: document.getElementById("symbolFilter"),
  directionFilter: document.getElementById("directionFilter"),
  statusFilter: document.getElementById("statusFilter"),
  ordersBody: document.getElementById("ordersBody"),
  timeline: document.getElementById("timeline"),
  reloadButton: document.getElementById("reloadButton"),
  exportButton: document.getElementById("exportButton"),
};

function fmtDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtFullDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function cssClass(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function badgeClass(orderOrState) {
  const value = cssClass(orderOrState);
  if (value.includes("buy")) return "buy";
  if (value.includes("sell") || value.includes("risk")) return "sell";
  if (value.includes("active") || value.includes("online")) return "active online";
  if (value.includes("cooldown") || value.includes("expired") || value.includes("stale")) return "cooldown stale";
  if (value.includes("tp")) return "tp";
  return value || "missing";
}

function strategyName(item) {
  return String(item || "").split(":").pop();
}

function getFilteredOrders() {
  if (!dashboardData) return [];
  const symbol = els.symbolFilter.value;
  const direction = els.directionFilter.value;
  const status = els.statusFilter.value;
  return dashboardData.orders.filter((order) => {
    const symbolMatch = symbol === "ALL" || order.pair === symbol;
    const directionMatch = direction === "ALL" || order.direction === direction;
    const statusMatch = status === "ALL" || order.status === status;
    return symbolMatch && directionMatch && statusMatch;
  });
}

function selectedOrder() {
  if (!dashboardData) return null;
  if (selectedSignalId) {
    const direct = dashboardData.orders.find((order) => order.signal_id === selectedSignalId);
    if (direct) return direct;
  }
  if (selectedPair !== "ALL") {
    const latestForPair = dashboardData.orders.find((order) => order.pair === selectedPair);
    if (latestForPair) return latestForPair;
  }
  return dashboardData.orders[0] || null;
}

function renderSummary() {
  const summary = dashboardData.summary;
  els.metricSymbols.textContent = summary.symbols;
  els.metricOrders.textContent = summary.orders;
  els.metricDirection.textContent = `${summary.buy_orders} buy / ${summary.sell_orders} sell`;
  els.metricActive.textContent = summary.active_orders;
  els.metricConfidence.textContent = `${summary.average_confidence}%`;
  els.metricLifecycle.textContent = summary.target_events + summary.breakeven_events + summary.risk_events + summary.timeout_events;
  els.freshness.textContent = `Snapshot generated ${fmtFullDate(dashboardData.generated_at)} and auto-refreshing every ${REFRESH_MS / 1000}s`;
}

function renderSymbols() {
  els.symbolGrid.innerHTML = dashboardData.symbols.map((symbol) => {
    const latest = symbol.latest_signal || {};
    const votesTotal = (latest.bull_votes || 0) + (latest.bear_votes || 0);
    const bullPct = votesTotal ? Math.round((latest.bull_votes / votesTotal) * 100) : 50;
    const engine = symbol.engine || {};
    const cycle = engine.last_cycle || {};
    const heartbeat = engine.last_heartbeat || {};
    return `
      <article class="symbol-card" data-pair="${symbol.pair}">
        <header>
          <div>
            <h2>${symbol.pair}</h2>
            <small>${symbol.symbol}</small>
          </div>
          <span class="badge ${badgeClass(engine.health)}">${engine.health || "missing"}</span>
        </header>
        <div class="symbol-main">
          <div class="pair-line">
            <strong>${latest.direction || "--"}</strong>
            <span class="badge ${badgeClass(latest.direction)}">${latest.confidence || "--"}%</span>
          </div>
          <div class="vote-track" style="--bull:${bullPct}%"><span></span><span></span></div>
          <div class="meta-row">
            <span>${engine.handling_state || "Waiting"}</span>
            <span>ETA ${cycle.eta_next_signal || heartbeat.eta_next_signal || "unknown"}</span>
            <span>${latest.status || "No signal"}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".symbol-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedPair = card.dataset.pair;
      selectedSignalId = null;
      els.symbolFilter.value = selectedPair;
      renderAll();
    });
  });
}

function renderTabs() {
  const pairs = ["ALL", ...dashboardData.symbols.map((item) => item.pair)];
  els.symbolTabs.innerHTML = pairs.map((pair) => `
    <button type="button" class="${selectedPair === pair ? "active" : ""}" data-pair="${pair}">
      ${pair === "ALL" ? "All" : pair}
    </button>
  `).join("");

  els.symbolTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPair = button.dataset.pair;
      selectedSignalId = null;
      els.symbolFilter.value = selectedPair;
      renderAll();
    });
  });
}

function renderSignalFocus() {
  const order = selectedOrder();
  if (!order) {
    els.signalFocus.innerHTML = `<div class="empty-state">No signal orders found.</div>`;
    els.selectedSignalLabel.textContent = "No order selected";
    return;
  }

  els.selectedSignalLabel.textContent = `${order.pair} ${order.direction} #${order.signal_id || "--"}`;
  const strategies = order.strategies.map((item) => `<span class="tag">${strategyName(item)}</span>`).join("");
  const reasons = order.reasoning.map((item) => `<div class="reason-item">${item}</div>`).join("");
  const lifecycle = order.lifecycle.length
    ? order.lifecycle.map((item) => {
        const target = item.target_number ? ` TP${item.target_number}` : "";
        return `<div class="lifecycle-item"><strong>${item.event}${target}</strong><small> ${fmtDate(item.timestamp)}</small><p>${item.message}</p></div>`;
      }).join("")
    : `<div class="lifecycle-item"><strong>Posted</strong><p>${order.status_detail}</p></div>`;

  els.signalFocus.innerHTML = `
    <div class="order-topline">
      <div>
        <h3>${order.pair} ${order.direction}</h3>
        <p>${fmtFullDate(order.created_at)} / ${order.session || "session unknown"}</p>
      </div>
      <span class="badge ${badgeClass(order.status)}">${order.status}</span>
    </div>
    <div class="focus-grid">
      <div class="focus-item"><span>Entry Zone</span><strong>${fmtNumber(order.entry.low)} - ${fmtNumber(order.entry.high)}</strong></div>
      <div class="focus-item"><span>Stop Loss</span><strong>${fmtNumber(order.stop_loss)}</strong></div>
      <div class="focus-item"><span>TP1 / TP4</span><strong>${fmtNumber(order.targets[0])} / ${fmtNumber(order.targets[3])}</strong></div>
      <div class="focus-item"><span>RR to TP4</span><strong>${order.risk_reward_to_tp4 || "--"}</strong></div>
      <div class="focus-item"><span>SMC Votes</span><strong>${order.bull_votes} bull / ${order.bear_votes} bear</strong></div>
      <div class="focus-item"><span>Confirmed</span><strong>${order.strategies_confirmed}/${order.total_strategies}</strong></div>
      <div class="focus-item"><span>MTF</span><strong>${order.mtf || "--"}</strong></div>
      <div class="focus-item"><span>Sentiment</span><strong>${order.sentiment_label || "--"} ${order.sentiment_score || ""}</strong></div>
    </div>
    <div class="strategy-tags">${strategies || `<span class="tag">No strategy tags</span>`}</div>
    <div class="reason-list">${reasons || `<div class="reason-item">No reasoning captured.</div>`}</div>
    <div class="lifecycle-list">${lifecycle}</div>
  `;
}

function renderStrategies() {
  const rows = dashboardData.strategy_breakdown.slice(0, 12);
  const max = Math.max(...rows.map((row) => row.count), 1);
  els.strategyBars.innerHTML = rows.map((row) => {
    const pct = Math.round((row.count / max) * 100);
    return `
      <div class="strategy-row">
        <header><span>${row.strategy}</span><strong>${row.count}</strong></header>
        <div class="bar-track"><span style="--value:${pct}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderEngineAbout() {
  els.engineAbout.innerHTML = dashboardData.symbols.map((symbol) => {
    const engine = symbol.engine || {};
    const cycle = engine.last_cycle || {};
    const heartbeat = engine.last_heartbeat || {};
    return `
      <article class="about-item">
        <header>
          <strong>${symbol.pair}</strong>
          <span class="badge ${badgeClass(engine.health)}">${engine.health || "missing"}</span>
        </header>
        <dl>
          <div><dt>Handling</dt><dd>${engine.handling_state || "--"}</dd></div>
          <div><dt>Last Seen</dt><dd>${engine.minutes_since_seen ?? "--"} min ago</dd></div>
          <div><dt>Cycle</dt><dd>${cycle.cycle || "--"}</dd></div>
          <div><dt>ETA</dt><dd>${cycle.eta_next_signal || heartbeat.eta_next_signal || "unknown"}</dd></div>
          <div><dt>Waiting</dt><dd>${cycle.waiting || "none"}</dd></div>
          <div><dt>Last Signal</dt><dd>${heartbeat.last_signal || "--"}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function renderFilters() {
  const currentSymbol = els.symbolFilter.value;
  const currentStatus = els.statusFilter.value;
  const pairs = [...new Set(dashboardData.orders.map((order) => order.pair))];
  const statuses = [...new Set(dashboardData.orders.map((order) => order.status))];

  els.symbolFilter.innerHTML = `<option value="ALL">All</option>${pairs.map((pair) => `<option value="${pair}">${pair}</option>`).join("")}`;
  els.statusFilter.innerHTML = `<option value="ALL">All</option>${statuses.map((status) => `<option value="${status}">${status}</option>`).join("")}`;

  els.symbolFilter.value = pairs.includes(currentSymbol) || currentSymbol === "ALL" ? currentSymbol : "ALL";
  els.statusFilter.value = statuses.includes(currentStatus) || currentStatus === "ALL" ? currentStatus : "ALL";
}

function renderOrders() {
  const rows = getFilteredOrders();
  if (!rows.length) {
    els.ordersBody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No orders match the selected filters.</div></td></tr>`;
    return;
  }

  els.ordersBody.innerHTML = rows.map((order) => {
    const selected = selectedSignalId === order.signal_id ? "selected" : "";
    return `
      <tr class="${selected}" data-signal-id="${order.signal_id}">
        <td>${fmtDate(order.created_at)}<br><small class="mono">#${order.signal_id || "--"}</small></td>
        <td><strong>${order.pair}</strong><br><small>${order.session || "--"}</small></td>
        <td><span class="badge ${badgeClass(order.direction)}">${order.direction}</span></td>
        <td>${order.confidence}%<br><small>${order.ai_status || "--"}</small></td>
        <td>${fmtNumber(order.entry.low)} - ${fmtNumber(order.entry.high)}</td>
        <td>${fmtNumber(order.stop_loss)}</td>
        <td>${fmtNumber(order.targets[0])} / ${fmtNumber(order.targets[3])}</td>
        <td>${order.bull_votes} / ${order.bear_votes}<br><small>${order.strategies_confirmed}/${order.total_strategies} confirmed</small></td>
        <td><span class="badge ${badgeClass(order.status)}">${order.status}</span></td>
      </tr>
    `;
  }).join("");

  els.ordersBody.querySelectorAll("tr[data-signal-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedSignalId = row.dataset.signalId;
      const order = dashboardData.orders.find((item) => item.signal_id === selectedSignalId);
      selectedPair = order ? order.pair : selectedPair;
      renderAll();
      document.getElementById("signalFocus").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

function renderTimeline() {
  const filtered = dashboardData.timeline
    .filter((item) => selectedPair === "ALL" || item.pair === selectedPair)
    .slice(0, 60);
  els.timeline.innerHTML = filtered.map((item) => `
    <article class="timeline-item">
      <time>${fmtDate(item.timestamp)}</time>
      <span>${item.pair}</span>
      <div><strong>${item.event} ${item.status}</strong><p>${item.message}</p></div>
    </article>
  `).join("") || `<div class="empty-state">No timeline events found.</div>`;
}

function renderAll() {
  if (!dashboardData) return;
  renderSummary();
  renderSymbols();
  renderTabs();
  renderSignalFocus();
  renderStrategies();
  renderEngineAbout();
  renderFilters();
  renderOrders();
  renderTimeline();
  if (window.lucide) window.lucide.createIcons();
}

async function loadData() {
  els.freshness.textContent = "Loading live snapshot...";
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Data load failed: ${response.status}`);
  dashboardData = await response.json();
  if (!selectedSignalId && dashboardData.orders.length) selectedSignalId = dashboardData.orders[0].signal_id;
  renderAll();
}

function exportCsv() {
  if (!dashboardData) return;
  const rows = getFilteredOrders();
  const header = ["created_at", "pair", "symbol", "direction", "confidence", "entry_low", "entry_high", "stop_loss", "tp1", "tp2", "tp3", "tp4", "status", "strategies"];
  const csv = [
    header.join(","),
    ...rows.map((order) => [
      order.created_at,
      order.pair,
      order.symbol,
      order.direction,
      order.confidence,
      order.entry.low,
      order.entry.high,
      order.stop_loss,
      order.targets[0],
      order.targets[1],
      order.targets[2],
      order.targets[3],
      order.status,
      `"${order.strategies.map(strategyName).join("; ")}"`,
    ].join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "discord-smc-orders.csv";
  link.click();
  URL.revokeObjectURL(url);
}

els.reloadButton.addEventListener("click", () => loadData().catch(showError));
els.exportButton.addEventListener("click", exportCsv);
els.symbolFilter.addEventListener("change", () => {
  selectedPair = els.symbolFilter.value;
  selectedSignalId = null;
  renderAll();
});
els.directionFilter.addEventListener("change", renderOrders);
els.statusFilter.addEventListener("change", renderOrders);

function showError(error) {
  els.freshness.textContent = error.message;
  els.signalFocus.innerHTML = `<div class="empty-state">${error.message}</div>`;
}

loadData().catch(showError);
setInterval(() => loadData().catch(showError), REFRESH_MS);
