// ========== Мини-фильтр консоли (чтобы не засоряли сообщения локализации Desmos) ==========
(function filterDesmosConsole() {
  const origWarn = console.warn.bind(console);
  console.warn = function (...args) {
    const joined = args.join(" ");
    // Отфильтровать сообщения локализации/форматирования Desmos (частые и неважные)
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

// Утилита: безопасно очищает предыдущие выражения по id-шникам
function clearDesmosIds(ids) {
  ids.forEach((id) => {
    try {
      calculator.removeExpression({ id });
    } catch (e) {}
  });
}

let funcInput = document.getElementById("function").value.trim();

// Если пользователь ввёл "что-то = что-то"
if (funcInput.includes("=")) {
  const parts = funcInput.split("=");
  if (parts.length === 2) {
    funcInput = `(${parts[0]}) - (${parts[1]})`;
  } else {
    throw new Error('Некорректное уравнение. Используйте только одно "=".');
  }
}

// ========== Обработка формы ==========
const form = document.getElementById("newtonForm");
const resultBox = document.getElementById("result");
const resetBtn = document.getElementById("resetBtn");

form.addEventListener("submit", function (e) {
  e.preventDefault();
  resultBox.innerHTML = "";

  let funcInput = document.getElementById("function").value.trim();
  const x0 = parseFloat(document.getElementById("x0").value);
  const epsilon = parseFloat(document.getElementById("epsilon").value);

  if (funcInput.includes("=")) {
    const parts = funcInput.split("=");
    if (parts.length === 2) {
      funcInput = `(${parts[0]}) - (${parts[1]})`;
    } else {
      throw new Error("Некорректное уравнение. Используйте только одно '='.");
    }
  }
  funcInput = funcInput
    .replace(/^y\s*=\s*/i, "")
    .replace(/^f\s*\(x\)\s*=\s*/i, "");

  if (!funcInput) {
    resultBox.innerHTML = `<p style="color:#ff6b6b">Введите функцию.</p>`;
    return;
  }

  if (!funcInput) {
    resultBox.innerHTML = `<p style="color:${"#ff6b6b"}">Введите функцию.</p>`;
    return;
  }
  if (isNaN(x0) || isNaN(epsilon) || epsilon <= 0) {
    resultBox.innerHTML = `<p style="color:${"#ff6b6b"}">Некорректные x₀ или ε.</p>`;
    return;
  }

  try {
    // Парсим функцию и её производную через math.js
    const nodeF = math.parse(funcInput);
    const f = nodeF.compile();
    const nodeFp = math.derivative(nodeF, "x");
    const fPrime = nodeFp.compile();

    // Метод Ньютона
    let xn = x0;
    const maxIter = 100;
    const iterPoints = [xn];
    let xn1 = xn;
    let iter = 0;

    for (; iter < maxIter; iter++) {
      const fx = f.evaluate({ x: xn });
      const fpx = fPrime.evaluate({ x: xn });

      if (!isFinite(fx) || !isFinite(fpx)) {
        throw new Error(
          "Значение функции или производной стало нечисловым (Infinity/NaN)."
        );
      }
      if (Math.abs(fpx) < 1e-14) {
        throw new Error(
          "Производная слишком близка к нулю — метод не применим в этой точке."
        );
      }

      xn1 = xn - fx / fpx;
      iterPoints.push(xn1);

      if (Math.abs(xn1 - xn) < epsilon) {
        iter++; // считаем текущую итерацию как выполненную
        break;
      }
      xn = xn1;
    }

    // Вывод результатов
    const fxAtRoot = f.evaluate({ x: xn1 });
    resultBox.innerHTML = `
      <p><b>f(x):</b> ${escapeHtml(funcInput)}</p>
      <p><b>x₀:</b> ${x0}</p>
      <p><b>Найденный корень:</b> x ≈ ${Number(xn1).toFixed(10)}</p>
      <p><b>f(x) в корне:</b> ${Number(fxAtRoot).toExponential(3)}</p>
      <p><b>Итераций:</b> ${iter}</p>
    `;

    // ========== Построение графика в Desmos ==========
    // Удаляем старые выражения
    const knownIds = [
      "func",
      "axis",
      "root",
      "iterLine",
      "iterPoint",
      "iterPoint0",
    ];
    // также удалим все предыдущие iterPointN
    for (let i = 0; i < 200; i++) knownIds.push("iterP" + i);
    clearDesmosIds(knownIds);

    // Функция
    // Прямо подставим текст функции в y=...; math-style — Desmos понимает многие записи, но аккуратно
    calculator.setExpression({ id: "func", latex: `y=${funcInput}` });

    // Ось x
    calculator.setExpression({
      id: "axis",
      latex: "y=0",
      color: Desmos.Colors.GRAY,
    });

    // Точка корня
    calculator.setExpression({
      id: "root",
      latex: `(${xn1},0)`,
      color: Desmos.Colors.RED,
    });

    // Итерации: точки (x_n, f(x_n)) и линии, соединяющие их с проекцией на ось (для визуала касательных)
    // Добавим линии между итерациями (x_n, f(x_n)) -> (x_{n+1}, 0) визуально
    // И отдельно нарисуем точки на графике
    const iterCoords = iterPoints.map((xi) => {
      const yi = f.evaluate({ x: xi });
      return { x: xi, y: yi };
    });

    // Точки итераций
    iterCoords.forEach((pt, idx) => {
      calculator.setExpression({
        id: "iterP" + idx,
        latex: `(${pt.x}, ${pt.y})`,
        color: Desmos.Colors.ORANGE,
      });
    });

    // Линии между точкой и её проекцией на ось (горизонтальная затем вертикальная — для наглядности)
    // Здесь рисуем вертикальную линию от (x_n, f(x_n)) до (x_n, 0), а затем точку следующего x
    iterCoords.forEach((pt, idx) => {
      // вертикальная линия
      calculator.setExpression({
        id: `iterV${idx}`,
        latex: `{(x, y) : x = ${pt.x} and y <= ${pt.y} and y >= 0}`,
        color: Desmos.Colors.BLACK, // тонкая/невидимая, можно убрать
      });
    });

    // Также для визуала соединим точки итераций линией-путём
    const xsLine = iterCoords.map((p) => p.x);
    const ysLine = iterCoords.map((p) => p.y);
    // Desmos принимает список точек как [(x1,y1),(x2,y2),...]
    const pairsLatex =
      "[" + iterCoords.map((p) => `(${p.x},${p.y})`).join(",") + "]";
    calculator.setExpression({
      id: "iterLine",
      latex: pairsLatex,
      color: Desmos.Colors.ORANGE,
    });

    // Подстраиваем вид: центрируем граф по найденному корню
    calculator.setMathBounds({
      left: xn1 - 6,
      right: xn1 + 6,
      bottom: -6,
      top: 6,
    });
  } catch (err) {
    resultBox.innerHTML = `<p style="color:${"#ff6b6b"}"><b>Ошибка:</b> ${escapeHtml(
      err.message
    )}</p>`;
  }
});

// Сброс: удалить выражения и очистить результат
resetBtn.addEventListener("click", function () {
  const idsToClear = ["func", "axis", "root", "iterLine"];
  for (let i = 0; i < 200; i++) idsToClear.push("iterP" + i);
  clearDesmosIds(idsToClear);
  resultBox.innerHTML = "";
  document.getElementById("function").value = "";
  document.getElementById("x0").value = "";
  document.getElementById("epsilon").value = "";
});

// Небольшая утилита — экранирование HTML для вывода ошибок/функций
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
