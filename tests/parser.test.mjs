import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import katex from "katex";
import "../extension/math-parser.js";

const { findMath } = globalThis.SlackMathParser;

test("finds all four delimiter forms, preferring display dollars", () => {
  const text = String.raw`内联 $x_i$ and \(y^2\); $$a+b$$ then \[c+d\]`;
  assert.deepEqual(findMath(text).map(({ tex, display }) => [tex, display]), [
    ["x_i", false], ["y^2", false], ["a+b", true], ["c+d", true],
  ]);
  for (const match of findMath(text)) assert.ok(text.slice(match.start, match.end).includes(match.tex));
});

test("keeps escapes, currency, unmatched delimiters and multiline inline text as source", () => {
  for (const text of [String.raw`Pay \$5 and \$10`, "$5 and $10", "$5 or $10", "$$no closing marker", "$x\ny$", "$ x $", "$x", "$$", "$x\0y$"]) {
    assert.equal(findMath(text).length, 0, text);
  }
  assert.equal(findMath("$2$ and $4\\times$").length, 2);
});

test("does not end a formula at a dollar inside braces", () => {
  const [match] = findMath(String.raw`$\text{cost $5} + x$`);
  assert.equal(match.tex, String.raw`\text{cost $5} + x`);
});

test("renders multiline matrices and Chinese annotations", () => {
  const text = String.raw`$$
\underbrace{\begin{bmatrix} I_3 & \beta \mathbf{d} \\ \mathbf{0}^\top & 1 \end{bmatrix}}_{\text{相对变换矩阵}}
$$`;
  const [match] = findMath(text);
  assert.ok(match.display);
  assert.doesNotThrow(() => katex.renderToString(match.tex, { strict: "ignore", throwOnError: true, trust: false }));
});

test("every delimited equation in the supplied LiRoPE example parses and renders", () => {
  const sample = readFileSync(new URL("fixtures/lirope.txt", import.meta.url), "utf8");
  const matches = findMath(sample);
  assert.ok(matches.length > 80, `Expected the full example, found ${matches.length} formulas`);
  assert.equal(matches.filter(match => match.display).length, 4);
  for (const match of matches) {
    assert.doesNotThrow(() => katex.renderToString(match.tex, { strict: "ignore", trust: false, throwOnError: true }), match.tex);
  }
});
