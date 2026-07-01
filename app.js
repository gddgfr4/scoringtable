var EVENTS = [
  { id: "100m", label: "100m", distance: 100, placeholder: "10.88" },
  { id: "200m", label: "200m", distance: 200, placeholder: "22.10" },
  { id: "400m", label: "400m", distance: 400, placeholder: "49.80" },
  { id: "800m", label: "800m", distance: 800, placeholder: "1:58.40" },
  { id: "1500m", label: "1500m", distance: 1500, placeholder: "4:05.20" },
  { id: "3000m", label: "3000m", distance: 3000, placeholder: "8:55.00" },
  { id: "5000m", label: "5000m", distance: 5000, placeholder: "15:30.00" },
  { id: "10000m", label: "10000m", distance: 10000, placeholder: "32:40.00" }
];

var STORAGE_KEY = "wa-scoring-profile-v1";
var data = window.WA_SCORING_DATA;
var models = buildModels(data);

var inputRoot = document.querySelector("#eventInputs");
var genderSelect = document.querySelector("#genderSelect");
var logAxisToggle = document.querySelector("#logAxisToggle");
var sampleButton = document.querySelector("#sampleButton");
var clearButton = document.querySelector("#clearButton");
var chart = document.querySelector("#scoreChart");
var chartEmpty = document.querySelector("#chartEmpty");
var chartSummary = document.querySelector("#chartSummary");
var matrixWrap = document.querySelector("#matrixWrap");

var state = loadState();

buildInputs();
syncControls();
render();

genderSelect.addEventListener("change", function () {
  state.gender = genderSelect.value;
  saveState();
  render();
});

logAxisToggle.addEventListener("change", function () {
  state.logAxis = logAxisToggle.checked;
  saveState();
  renderChart(getSummaries());
});

sampleButton.addEventListener("click", function () {
  state.records = {
    "100m": "11.20",
    "200m": "22.75",
    "400m": "51.50",
    "800m": "1:59.80",
    "1500m": "4:08.00",
    "3000m": "8:58.00",
    "5000m": "15:40.00",
    "10000m": "32:55.00"
  };
  syncInputs();
  saveState();
  render();
});

clearButton.addEventListener("click", function () {
  state.records = {};
  syncInputs();
  saveState();
  render();
});

window.addEventListener("resize", function () {
  renderChart(getSummaries());
});

function buildInputs() {
  inputRoot.innerHTML = EVENTS.map(function (event) {
    return '<div class="event-card" data-event="' + event.id + '">' +
      '<label for="input-' + event.id + '">' +
      '<span>' + event.label + '</span>' +
      '<small>' + event.distance.toLocaleString() + 'm</small>' +
      '</label>' +
      '<input id="input-' + event.id + '" inputmode="decimal" autocomplete="off" placeholder="' + event.placeholder + '" />' +
      '<span class="score-pill" data-score-for="' + event.id + '">未入力</span>' +
      '</div>';
  }).join("");

  EVENTS.forEach(function (event) {
    var input = document.querySelector("#input-" + event.id);
    input.addEventListener("input", function () {
      state.records[event.id] = input.value;
      saveState();
      render();
    });
  });
}

function syncControls() {
  genderSelect.value = state.gender;
  logAxisToggle.checked = state.logAxis;
  syncInputs();
}

function syncInputs() {
  EVENTS.forEach(function (event) {
    var input = document.querySelector("#input-" + event.id);
    input.value = state.records[event.id] || "";
  });
}

function render() {
  var summaries = getSummaries();
  renderInputScores(summaries);
  renderChart(summaries);
  renderMatrix(summaries);
}

function getSummaries() {
  return EVENTS.map(function (event) {
    var raw = (state.records[event.id] || "").trim();
    var seconds = parseTime(raw);
    var model = models[state.gender][event.id];
    var score = seconds == null ? null : scoreForTime(model, seconds);
    return { event: event, raw: raw, seconds: seconds, score: score };
  });
}

function renderInputScores(summaries) {
  summaries.forEach(function (item) {
    var pill = document.querySelector('[data-score-for="' + item.event.id + '"]');
    pill.classList.remove("invalid");

    if (!item.raw) {
      pill.textContent = "未入力";
    } else if (item.seconds == null) {
      pill.textContent = "形式確認";
      pill.classList.add("invalid");
    } else if (item.score == null) {
      pill.textContent = "範囲外";
      pill.classList.add("invalid");
    } else {
      pill.textContent = item.score + " pt";
    }
  });
}

function renderChart(summaries) {
  var points = summaries.filter(function (item) { return Number.isInteger(item.score); });
  if (points.length) {
    var maxScore = Math.max.apply(null, points.map(function (point) { return point.score; }));
    chartSummary.textContent = points.length + "種目入力済み。最高得点は" + maxScore + " ptです。";
  } else {
    chartSummary.textContent = "入力された種目の得点を距離順につなぎます。";
  }

  chartEmpty.classList.toggle("hidden", points.length >= 2);

  var rect = chart.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  var width = Math.max(720, Math.floor(rect.width));
  var height = Math.max(320, Math.floor(rect.height || 380));
  chart.width = width * dpr;
  chart.height = height * dpr;

  var ctx = chart.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  var margin = { top: 24, right: 28, bottom: 72, left: 56 };
  var plotW = width - margin.left - margin.right;
  var plotH = height - margin.top - margin.bottom;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  var xValue = function (distance) {
    return state.logAxis ? Math.log10(distance) : distance;
  };
  var xMin = xValue(100);
  var xMax = xValue(10000);
  var toX = function (distance) {
    return margin.left + ((xValue(distance) - xMin) / (xMax - xMin)) * plotW;
  };
  var toY = function (score) {
    return margin.top + (1 - score / 1400) * plotH;
  };

  drawAxes(ctx, width, height, margin, plotW, plotH, toX);

  if (!points.length) return;

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0f9f8f";
  ctx.beginPath();
  points.forEach(function (point, index) {
    var x = toX(point.event.distance);
    var y = toY(point.score);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  points.forEach(function (point) {
    var x = toX(point.event.distance);
    var y = toY(point.score);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#087f73";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#171717";
    ctx.font = "700 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(point.score), x, Math.max(16, y - 11));
  });
}

function drawAxes(ctx, width, height, margin, plotW, plotH, toX) {
  ctx.strokeStyle = "#dde2e7";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#666d73";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (var score = 0; score <= 1400; score += 200) {
    var y = margin.top + (1 - score / 1400) * plotH;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
    ctx.fillText(String(score), margin.left - 10, y);
  }

  ctx.strokeStyle = "#98a1a9";
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(width - margin.right, margin.top + plotH);
  ctx.stroke();

  ctx.fillStyle = "#171717";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  EVENTS.forEach(function (event, index) {
    var x = toX(event.distance);
    var baseY = margin.top + plotH + 12 + (state.logAxis ? 0 : (index % 3) * 16);
    ctx.strokeStyle = "#cbd3d9";
    ctx.beginPath();
    ctx.moveTo(x, margin.top + plotH);
    ctx.lineTo(x, margin.top + plotH + 6);
    ctx.stroke();
    ctx.fillText(event.label, x, baseY);
  });

  ctx.save();
  ctx.translate(16, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#666d73";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("WA score", 0, 0);
  ctx.restore();
}

function renderMatrix(summaries) {
  var head = '<thead><tr><th>得点元</th>' + EVENTS.map(function (event) {
    return '<th>' + event.label + '</th>';
  }).join("") + '</tr></thead>';

  var rows = summaries.map(function (rowItem) {
    var rowLabel = rowItem.score == null
      ? '<strong>' + rowItem.event.label + '</strong><span>入力待ち</span>'
      : '<strong>' + rowItem.event.label + '</strong><span>' + rowItem.score + ' pt</span>';

    var cells = EVENTS.map(function (columnEvent) {
      if (rowItem.score == null) return '<td class="missing">-</td>';

      var isPersonal = columnEvent.id === rowItem.event.id;
      if (isPersonal && rowItem.raw) {
        return '<td class="personal-cell">' + escapeHtml(rowItem.raw) + '<span class="cell-note">' + rowItem.score + ' pt</span></td>';
      }

      var model = models[state.gender][columnEvent.id];
      var mark = timeForScore(model, rowItem.score);
      if (!mark) return '<td class="missing">-</td>';

      return '<td>' + (mark.approx ? '≈' : '') + formatTime(mark.seconds) + '<span class="cell-note">' + rowItem.score + ' pt</span></td>';
    }).join("");

    return '<tr><th><span class="row-event">' + rowLabel + '</span></th>' + cells + '</tr>';
  }).join("");

  matrixWrap.innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
}

function buildModels(source) {
  var result = { men: {}, women: {} };
  ["men", "women"].forEach(function (gender) {
    EVENTS.forEach(function (event) {
      var packed = source.genders[gender][event.id];
      var centiseconds = decodeCentiseconds(packed.values);
      var officialScores = decodeOfficialScores(packed.official);
      var pairs = centiseconds.map(function (centis, index) {
        var score = index + 1;
        return { score: score, seconds: centis / 100, official: officialScores.has(score) };
      });

      result[gender][event.id] = {
        byScore: new Map(pairs.map(function (item) { return [item.score, item.seconds]; })),
        officialScores: officialScores,
        byScoreAsc: pairs.slice().sort(function (a, b) { return a.score - b.score; }),
        bySecondsAsc: pairs.slice().sort(function (a, b) {
          if (a.seconds !== b.seconds) return a.seconds - b.seconds;
          if (a.official !== b.official) return a.official ? -1 : 1;
          return b.score - a.score;
        })
      };
    });
  });
  return result;
}

function decodeCentiseconds(encoded) {
  var parts = encoded.split("|");
  var values = [parseInt(parts[0], 36)];
  var tokens = parts[1] ? parts[1].split(".") : [];

  tokens.forEach(function (token) {
    var run = token.split("~");
    var delta = parseInt(run[0], 36);
    var count = run[1] ? parseInt(run[1], 36) : 1;
    for (var i = 0; i < count; i += 1) {
      values.push(values[values.length - 1] - delta);
    }
  });

  return values;
}

function decodeOfficialScores(encoded) {
  var binary = atob(encoded);
  var official = new Set();
  for (var byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
    var byte = binary.charCodeAt(byteIndex);
    for (var bit = 0; bit < 8; bit += 1) {
      if (byte & (1 << bit)) {
        var score = byteIndex * 8 + bit + 1;
        if (score <= 1400) official.add(score);
      }
    }
  }
  return official;
}

function timeForScore(model, score) {
  if (!Number.isInteger(score)) return null;
  if (model.byScore.has(score)) {
    return { seconds: model.byScore.get(score), approx: !model.officialScores.has(score) };
  }

  var pairs = model.byScoreAsc;
  var lower = null;
  var upper = null;
  for (var i = 0; i < pairs.length; i += 1) {
    var pair = pairs[i];
    if (pair.score < score) lower = pair;
    if (pair.score > score) {
      upper = pair;
      break;
    }
  }

  if (!lower && !upper) return null;
  if (!lower) return { seconds: upper.seconds, approx: true };
  if (!upper) return { seconds: lower.seconds, approx: true };

  var ratio = (score - lower.score) / (upper.score - lower.score);
  var seconds = lower.seconds + ratio * (upper.seconds - lower.seconds);
  return { seconds: roundSeconds(seconds), approx: true };
}

function scoreForTime(model, seconds) {
  if (!Number.isFinite(seconds)) return null;
  var pairs = model.bySecondsAsc;
  if (!pairs.length) return null;

  if (seconds <= pairs[0].seconds) return pairs[0].score;
  if (seconds >= pairs[pairs.length - 1].seconds) return pairs[pairs.length - 1].score;

  for (var i = 0; i < pairs.length - 1; i += 1) {
    var fast = pairs[i];
    var slow = pairs[i + 1];
    if (seconds >= fast.seconds && seconds <= slow.seconds) {
      if (slow.seconds === fast.seconds) return fast.score;
      var ratio = (seconds - fast.seconds) / (slow.seconds - fast.seconds);
      var score = fast.score + ratio * (slow.score - fast.score);
      return Math.max(1, Math.min(1400, Math.round(score)));
    }
  }

  return null;
}

function parseTime(value) {
  if (!value) return null;
  var normalized = value.replace(/[：]/g, ":").replace(/[．]/g, ".").replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?(:\d{1,2}(\.\d+)?){0,2}$/.test(normalized)) return null;

  var parts = normalized.split(":").map(Number);
  if (parts.some(function (part) { return !Number.isFinite(part); })) return null;
  if (parts.length > 1 && parts.slice(1).some(function (part) { return part >= 60; })) return null;

  var seconds = 0;
  parts.forEach(function (part) {
    seconds = seconds * 60 + part;
  });
  return seconds > 0 ? roundSeconds(seconds) : null;
}

function formatTime(seconds) {
  var rounded = roundSeconds(seconds);
  var hours = Math.floor(rounded / 3600);
  var minutes = Math.floor((rounded % 3600) / 60);
  var secs = rounded - hours * 3600 - minutes * 60;
  var secText = secs.toFixed(2).padStart(5, "0");

  if (hours > 0) return hours + ":" + String(minutes).padStart(2, "0") + ":" + secText;
  if (minutes > 0) return minutes + ":" + secText;
  return secs.toFixed(2);
}

function roundSeconds(seconds) {
  return Math.round(seconds * 100) / 100;
}

function loadState() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      gender: saved.gender === "women" ? "women" : "men",
      logAxis: Boolean(saved.logAxis),
      records: saved.records && typeof saved.records === "object" ? saved.records : {}
    };
  } catch (error) {
    return { gender: "men", logAxis: false, records: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}
