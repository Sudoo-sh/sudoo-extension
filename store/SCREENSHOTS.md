# Store images to make

The Chrome Web Store takes 1 to 5 screenshots of **1280 x 800** (or 640 x 400) pixels, PNG or JPEG without
transparency, a **small promo tile of 440 x 280** (required) and an optional **marquee of 1400 x 560**. The store
icon is `static/icons/icon-128.png`.

Use the mock panel's demo data, never a real panel's: `npm run preview`, then open the pages below in a 1280 x 800
window and place the popup (400 pixels wide) on a quiet background, or load the built extension unpacked with the
mock connected (`npm run mock`, address `http://localhost:8787`).

| # | Screenshot | Page | Shows |
| :--- | :--- | :--- | :--- |
| 1 | The popup, light theme | `/ext/popup/harness.html?tab=https://acme-retail-main.demo.sudoo.sh/odoo` | "This tab" card, the Acme Retail project with production, staging and development instances, the action icons |
| 2 | A job in progress | same page, click **Restart** on a development instance | The working dot, the progress bar and the "Restart started" message |
| 3 | The GitHub box | github.com page of a repository connected to the mock (load the unpacked extension) | The open box on a branch without an instance: **Create development instance** |
| 4 | Arabic, dark theme | `/ext/popup/harness.html?lang=ar` with the system in dark mode | The popup right to left with the panel's Arabic words |
| 5 | Settings | `/ext/options/harness.html` | Connect a panel, **Where tokens are kept** with the two choices, GitHub and notifications switches |

Promo tile (440 x 280): the Sudoo.sh mark on the plum accent (`#714B67`) or white, the words "Your panels, one click
away", and a small crop of the popup. Marquee (1400 x 560), optional: the same with screenshots 1 and 3 side by side.

Make the Arabic listing's screenshots with `?lang=ar` (1, 2, 5) and an Arabic browser for the GitHub box (3).
