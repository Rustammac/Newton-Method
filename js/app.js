// ------------------------
// script.js — Newton + Desmos
// ------------------------

// ========== Мини-фильтр консоли Desmos ==========
(function filterDesmosConsole() {
  const origWarn = console.warn.bind(console);
  console.warn = function (...args) {
    const joined = args.join(" ");
    if (
      typeof joined === "string" &&
      (joined.includes("Couldn't find message for key graphing-calculator") ||
        joined.includes("Could not format string graphing-calculator"))
    ) {
      return;
    }
    origWarn(...args);
  };
})();

// ========== Инициализация Desmos ==========
const calcRoot = document.getElementById("calculator");
const calculator = Desmos.GraphingCalculator(calcRoot, {
  expressions: true,
  settingsMenu: false,
  keypad: false,
  zoomButtons: true,
});

// ========== Утилита для очистки ==========
function clearDesmosIds(ids) {
  ids.forEach((id) => {
    try {
      calculator.removeExpression({ id });
    } catch (e) {}
  });
}

// ========== Функция проверки сходимости ==========
function checkConvergenceCondition(funcString, x0) {
  try {
    const nodeF = math.parse(funcString);
    const f = nodeF.compile();
    const fPrime = math.derivative(nodeF, "x").compile();
    const fDoublePrime = math
      .derivative(math.derivative(nodeF, "x"), "x")
      .compile();

    const fx = f.evaluate({ x: x0 });
    const fpx = fPrime.evaluate({ x: x0 });
    const fppx = fDoublePrime.evaluate({ x: x0 });

    const condition = Math.abs(fx * fppx) < Math.pow(fpx, 2);

    return { condition, fx, fpx, fppx };
  } catch (err) {
    console.error("Ошибка при проверке сходимости:", err.message);
    return null;
  }
}

// ========== Обработка формы ==========
const form = document.getElementById("newtonForm");
const resultBox = document.getElementById("result");
const resetBtn = document.getElementById("resetBtn");

form.addEventListener("submit", function (e) {
  e.preventDefault();
  resultBox.innerHTML = "";

  // === Получение данных от пользователя ===
  let funcInput = document.getElementById("function").value.trim();
  const x0 = parseFloat(document.getElementById("x0").value);
  const epsilon = parseFloat(document.getElementById("epsilon").value);

  if (!funcInput) {
    resultBox.innerHTML = `<p style="color:#ff6b6b">Введите функцию.</p>`;
    return;
  }
  if (isNaN(x0) || isNaN(epsilon) || epsilon <= 0) {
    resultBox.innerHTML = `<p style="color:#ff6b6b">Некорректные x₀ или ε.</p>`;
    return;
  }

  // === Обработка уравнения вида f(x)=0 ===
  if (funcInput.includes("=")) {
    const parts = funcInput.split("=");
    if (parts.length === 2) {
      funcInput = `(${parts[0]}) - (${parts[1]})`;
    } else {
      resultBox.innerHTML = `<p style="color:#ff6b6b">Используйте только одно "=".</p>`;
      return;
    }
  }

  funcInput = funcInput
    .replace(/^y\s*=\s*/i, "")
    .replace(/^f\s*\(x\)\s*=\s*/i, "");

  // === Проверка условия сходимости ===
  const conv = checkConvergenceCondition(funcInput, x0);
  if (conv) {
    if (conv.condition) {
      resultBox.innerHTML += `
        <p style="color:green"><b>✅ Условие сходимости выполняется:</b></p>
        <p>|f(x₀)·f''(x₀)| < [f'(x₀)]²</p>
        <p>f(x₀) = ${conv.fx.toExponential(
          3
        )}, f'(x₀) = ${conv.fpx.toExponential(
        3
      )}, f''(x₀) = ${conv.fppx.toExponential(3)}</p>
      `;
    } else {
      resultBox.innerHTML += `
        <p style="color:#ff6b6b"><b>⚠️ Условие сходимости не выполняется при x₀ = ${x0}.</b></p>
        <p>Метод Ньютона может не сойтись.</p>
        <p>f(x₀) = ${conv.fx.toExponential(
          3
        )}, f'(x₀) = ${conv.fpx.toExponential(
        3
      )}, f''(x₀) = ${conv.fppx.toExponential(3)}</p>
      `;
    }
  }

  try {
    // === Парсинг функции и производной ===
    const nodeF = math.parse(funcInput);
    const f = nodeF.compile();
    const fPrime = math.derivative(nodeF, "x").compile();

    // === Метод Ньютона ===
    let xn = x0;
    const maxIter = 100;
    const iterPoints = [xn];
    let xn1 = xn;
    let iter = 0;

    for (; iter < maxIter; iter++) {
      const fx = f.evaluate({ x: xn });
      const fpx = fPrime.evaluate({ x: xn });

      if (!isFinite(fx) || !isFinite(fpx))
        throw new Error("Infinity/NaN в функции или производной.");
      if (Math.abs(fpx) < 1e-14)
        throw new Error("Производная слишком близка к нулю.");

      xn1 = xn - fx / fpx;
      iterPoints.push(xn1);

      if (Math.abs(xn1 - xn) < epsilon) {
        iter++;
        break;
      }
      xn = xn1;
    }

    // === Вывод результатов ===
    const fxAtRoot = f.evaluate({ x: xn1 });
    resultBox.innerHTML += `
      <p><b>f(x):</b> ${escapeHtml(funcInput)}</p>
      <p><b>x₀:</b> ${x0}</p>
      <p><b>Найденный корень:</b> x ≈ ${Number(xn1).toFixed(10)}</p>
      <p><b>f(x) в корне:</b> ${Number(fxAtRoot).toExponential(3)}</p>
      <p><b>Итераций:</b> ${iter}</p>
    `;

    // === Построение графика Desmos ===
    const knownIds = ["func", "axis", "root", "iterLine"];
    for (let i = 0; i < 200; i++) knownIds.push("iterP" + i);
    clearDesmosIds(knownIds);

    calculator.setExpression({ id: "func", latex: `y=${funcInput}` });
    calculator.setExpression({
      id: "axis",
      latex: "y=0",
      color: Desmos.Colors.GRAY,
    });
    calculator.setExpression({
      id: "root",
      latex: `(${xn1},0)`,
      color: Desmos.Colors.RED,
    });

    const iterCoords = iterPoints.map((xi) => ({
      x: xi,
      y: f.evaluate({ x: xi }),
    }));
    iterCoords.forEach((pt, idx) => {
      calculator.setExpression({
        id: "iterP" + idx,
        latex: `(${pt.x}, ${pt.y})`,
        color: Desmos.Colors.ORANGE,
      });
    });

    const pairsLatex =
      "[" + iterCoords.map((p) => `(${p.x},${p.y})`).join(",") + "]";
    calculator.setExpression({
      id: "iterLine",
      latex: pairsLatex,
      color: Desmos.Colors.ORANGE,
    });

    calculator.setMathBounds({
      left: xn1 - 6,
      right: xn1 + 6,
      bottom: -6,
      top: 6,
    });
  } catch (err) {
    resultBox.innerHTML += `<p style="color:#ff6b6b"><b>Ошибка:</b> ${escapeHtml(
      err.message
    )}</p>`;
  }
});

// === Сброс формы ===
resetBtn.addEventListener("click", function () {
  const idsToClear = ["func", "axis", "root", "iterLine"];
  for (let i = 0; i < 200; i++) idsToClear.push("iterP" + i);
  clearDesmosIds(idsToClear);
  resultBox.innerHTML = "";
  document.getElementById("function").value = "";
  document.getElementById("x0").value = "";
  document.getElementById("epsilon").value = "";
});

// === Утилита экранирования HTML ===
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
