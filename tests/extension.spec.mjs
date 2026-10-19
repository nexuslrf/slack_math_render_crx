import { test, expect, chromium } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import "../extension/math-parser.js";

const root = process.cwd();
const extensionPath = path.join(root, "dist/slack-math-viewer");
const sample = await readFile(path.join(root, "tests/fixtures/lirope.txt"), "utf8");
const expectedMath = SlackMathParser.findMath(sample).length;
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
let context;
let profile;
let popup;
let page;
let errors;

test.beforeAll(async () => {
  profile = await mkdtemp(path.join(tmpdir(), "slack-math-test-"));
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1180, height: 900 },
  });
  const manager = await context.newPage();
  await manager.goto("chrome://extensions");
  const installed = await manager.evaluate(() => new Promise(resolve => {
    chrome.developerPrivate.getExtensionsInfo({}, resolve);
  }));
  const extension = installed.find(item => item.name === "Slack Math Viewer");
  expect(extension, "Unpacked extension must load without manifest errors").toBeTruthy();
  expect(extension.manifestErrors).toHaveLength(0);
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extension.id}/popup.html`);
  await manager.close();
});

test.beforeEach(async () => {
  await popup.evaluate(() => chrome.storage.local.set({ enabled: true }));
  page = await context.newPage();
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
});

test.afterEach(async () => {
  expect(errors).toEqual([]);
  await page.close();
});

test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

async function mount(html, url = "https://app.slack.com/client/test") {
  await page.route("https://**/*", route => {
    if (route.request().isNavigationRequest()) return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.7 system-ui,sans-serif;color:#e9edf2;background:#17191e;padding:40px;}main{max-width:920px;margin:auto}.c-message_kit__text{white-space:pre-wrap}p{margin:0}article{padding:24px;border:1px solid #454951;border-radius:12px;background:#22252b}h1{font-size:22px}a{color:#76c9f5}</style></head><body><main>${html}</main></body></html>`,
    });
    return route.abort();
  });
  await page.goto(url);
}

test("renders the full supplied example and retains the exact original DOM", async () => {
  const content = sample.split("\n").map(line => `<p>${escape(line) || "<br>"}</p>`).join("");
  await mount(`<article><div id="source" class="c-message_kit__text"><div class="p-rich_text_block">${content}</div></div></article>`);
  await expect(page.locator(".smv-equation")).toHaveCount(expectedMath);
  await expect(page.locator(".smv-display")).toHaveCount(4);
  await expect(page.locator(".smv-view")).toHaveCount(1);
  expect(await page.locator("#source .p-rich_text_block").innerHTML()).toBe(content);
  await expect(page.locator("#source")).toBeHidden();
  await page.getByRole("button", { name: "Show original text for this message" }).click();
  await expect(page.locator("#source")).toBeVisible();
  await expect(page.locator(".smv-body")).toBeHidden();
  await page.getByRole("button", { name: "Show rendered math for this message" }).click();
  await expect(page.locator("#source")).toBeHidden();
});

test("renders formulas across inline markup and line breaks; keeps links functional", async () => {
  await mount(String.raw`<h1>LiRoPE · rendered in Slack</h1><article><div id="source" class="c-message_kit__text">光源方向：$<strong>\mathbf{d}_i</strong> \in \mathbb{R}^3$<br>$$<br>L(\mathbf{d}) = \begin{bmatrix} I_3 &amp; \beta \mathbf{d} \\<br>\mathbf{0}^\top &amp; 1 \end{bmatrix}<br>$$<br>其中 $\beta = 0.5$。<a href="#reference" id="link">Reference</a></div></article>`);
  await page.locator("#link").evaluate(node => node.addEventListener("click", event => { event.preventDefault(); document.body.dataset.linkClicked = "yes"; }));
  await expect(page.locator(".smv-equation")).toHaveCount(3);
  await expect(page.locator(".smv-display .mtable")).toHaveCount(1);
  await page.locator(".smv-view a").click();
  await expect(page.locator("body")).toHaveAttribute("data-link-clicked", "yes");
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(font => ({ family: font.family, status: font.status }));
  });
  await page.screenshot({ path: path.join(root, "test-results/preview.png"), fullPage: true });
  expect(fonts.filter(font => font.family.includes("KaTeX") && font.status === "loaded"), JSON.stringify(fonts)).not.toHaveLength(0);
});

test("handles message additions, edits, recycled rows and SPA navigation", async () => {
  await mount('<section id="messages"><div id="source" class="c-message_kit__text">$x$</div></section>');
  await expect(page.locator(".smv-equation")).toHaveCount(1);
  await page.locator("#source").evaluate(node => { node.firstChild.data = "$y^2$"; });
  await expect(page.locator(".smv-equation")).toHaveAttribute("title", "$y^2$");
  await page.locator("#messages").evaluate(node => {
    const added = document.createElement("div");
    added.className = "c-message__body";
    added.textContent = "$$z=3$$";
    node.append(added);
  });
  await expect(page.locator(".smv-equation")).toHaveCount(2);
  await page.locator("#source").evaluate(node => { node.textContent = "No math in the edited message."; });
  await expect(page.locator("#source")).toBeVisible();
  await expect(page.locator(".smv-equation")).toHaveCount(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/client/other-channel");
    document.querySelector("#messages").innerHTML = '<div data-qa="message-text">New channel $w$</div>';
  });
  await expect(page.locator(".smv-equation")).toHaveAttribute("title", "$w$");
  await expect(page.locator(".smv-view")).toHaveCount(1);
  await page.locator(".smv-view").evaluate(node => node.remove());
  await expect(page.locator(".smv-view")).toHaveCount(1);
});

test("excludes editors, inline code, code blocks, links, and common currency", async () => {
  await mount('<div class="c-message_kit__text"><code>$code$</code><pre>$$code$$</pre><a href="#">$link$</a> Price $5 and $10; equation $x$</div><div contenteditable="true"><div class="p-rich_text_block">$draft$</div></div><div role="textbox" class="c-message_kit__text">$draft$</div>');
  await expect(page.locator(".smv-equation")).toHaveCount(1);
  await expect(page.locator(".smv-view code")).toHaveText("$code$");
  await expect(page.locator(".smv-view pre")).toHaveText("$$code$$");
  await expect(page.locator('[contenteditable="true"]')).toHaveText("$draft$");
  await expect(page.locator('[role="textbox"]')).toHaveText("$draft$");
});

test("popup toggle restores original messages and persists across reloads", async () => {
  await mount('<div id="source" class="p-rich_text_block">$x^2$</div>');
  await expect(page.locator(".smv-equation")).toHaveCount(1);
  await popup.locator("#enabled").uncheck();
  await expect(page.locator(".smv-view")).toHaveCount(0);
  await expect(page.locator("#source")).toBeVisible();
  await page.reload();
  await expect(page.locator("#source")).toBeVisible();
  await popup.reload();
  await expect(popup.locator("#enabled")).not.toBeChecked();
  await popup.locator("#enabled").check();
  await expect(page.locator(".smv-equation")).toHaveCount(1);
});

test("invalid formulas stay readable and unsafe TeX cannot inject HTML", async () => {
  await mount(String.raw`<div class="c-message_kit__text">$\notARealCommand{x}$ and $y$ and $\href{javascript:alert(1)}{click}$ and $\htmlClass{owned}{x}$</div>`);
  await expect(page.locator(".smv-view")).toHaveCount(1);
  await expect(page.locator(".smv-body")).toContainText(String.raw`$\notARealCommand{x}$`);
  await expect(page.locator('.smv-view a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator(".smv-view .owned")).toHaveCount(0);
});

test("does not inject on non-Slack websites", async () => {
  await mount('<div class="c-message_kit__text">$x$</div>', "https://example.test/");
  await expect(page.locator(".c-message_kit__text")).toHaveText("$x$");
  await expect(page.locator(".smv-view")).toHaveCount(0);
});
