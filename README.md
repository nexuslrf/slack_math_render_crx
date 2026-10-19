# Slack Math Viewer

A Chrome Manifest V3 extension that renders LaTeX equations in Slack Web messages. Includes a bundled copy of KaTeX and its fonts: no account, API key, CDN, or runtime network requests.

## Install in Chrome

Download the extension ZIP from [GitHub Releases](https://github.com/nexuslrf/slack_math_render_crx/releases) when a release is available, and extract it. If using a repository checkout, the ready-to-use extension is in `dist/slack-math-viewer`.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the `dist/slack-math-viewer` folder (the folder containing `manifest.json`).
4. Refresh your Slack Web tab.

Equations appear automatically in channel messages, threads, and message search results using the supported Slack message containers. Pin **Slack Math Viewer** from Chrome's Extensions menu for easy access to its on/off switch.

If using `dist/slack-math-viewer.zip`, unzip it first, then select the extracted `slack-math-viewer` folder in step 3. Keep the unpacked folder in place: Chrome loads the extension from that location.

## Supported notation

| Form | Example |
| --- | --- |
| Inline dollars | `$\mathbf{d}_i \in \mathbb{R}^3$` |
| Display dollars | `$$L(\mathbf{d}) = \begin{bmatrix} I_3 & \beta \mathbf{d} \\ \mathbf{0}^\top & 1 \end{bmatrix}$$` |
| Inline parentheses | `\(x^2 + y^2\)` |
| Display brackets | `\[\sum_{i=1}^{n} i\]` |

Use one backslash for LaTeX commands in your actual Slack messages, such as `\mathbf` or `\(`; use two for matrix row separators (`\\`). Formulas can span Slack's inline formatting elements. Display formulas can also span line breaks and paragraphs within one message. Long equations scroll horizontally.

The extension watches for new messages, edits, and Slack navigation. Use **Show original** below a rendered message to view or copy its untouched source, or disable rendering from the extension popup. Hover over an equation to see its LaTeX. Code blocks, inline code, links, and message composers are excluded. Common currency such as `$5 and $10` is left alone; dollar delimiters are inherently ambiguous, so escape literal dollar signs as `\$` when necessary.

## Behavior and limitations

- This changes only your local display. It does not edit or send Slack messages, and other people need their own renderer to see math.
- Slack's source DOM is retained; rendering uses a separate copy. Source mode restores Slack's original message, including its original event handlers. Ordinary clicks on copied links and mentions are forwarded to the originals; for other interactions use **Show original**.
- Invalid or unsupported LaTeX stays as source text. This is KaTeX, not a complete TeX engine. Missing underscores or backslashes in a pasted message cannot be reliably reconstructed; for example, `\mathbf{d}i` and `\mathbf{d}_i` render differently.
- Slack's DOM is not a public API. If Slack changes its message classes, the `MESSAGE` selectors in `extension/content.js` may need updating. This extension is for Slack in Chrome, not Slack's native desktop app.
- Rendering is capped at 300 formulas per message, 12,000 characters per formula, and 200,000 characters per message. Very large messages remain available in source form.
- It requests only extension storage plus content-script access on Slack pages. Only the enabled/disabled preference is stored locally. No messages are stored or transmitted.

## Develop and verify

Requires Node.js 22+ and npm; packaging uses Python 3's standard library.

```sh
npm ci
npm run build
npx playwright install chromium
npm test
npm run package
```

Set `CHROMIUM_PATH` to an existing Chromium executable to run tests without downloading another browser. Browser tests load the actual unpacked extension against locally supplied Slack-shaped HTML at an intercepted Slack URL. They do not log into or send anything to Slack. A live authenticated Slack session is still useful for checking compatibility with your workspace's current UI.

After editing source files, run `npm run build`, click **Reload** on the extension card at `chrome://extensions`, and refresh Slack. The generated `dist/slack-math-viewer` contains everything needed for installation; `node_modules` is not needed to use it.

Implementation references: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [KaTeX rendering options](https://katex.org/docs/options). KaTeX's MIT license is bundled in `vendor/KATEX-LICENSE.txt`.

## Prepare a release

Keep the versions in `package.json` and `extension/manifest.json` in sync, add `docs/releases/vX.Y.Z.md`, and run `npm run build` to update the committed installable folder. Commit and push the changes, then push an annotated `vX.Y.Z` tag.

The release workflow checks versions and generated files, runs all tests, and creates a **draft** GitHub release with a versioned extension ZIP and SHA-256 checksum. Review the draft on GitHub and click **Publish release** when ready. The ZIP uses fixed metadata for reproducible packaging. Rerunning the workflow can refresh an existing draft; it refuses to modify a published release.
