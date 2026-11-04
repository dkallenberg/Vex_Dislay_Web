# VEX Event Display: web version (GitHub Pages)

A static website version of the scoring display. It needs no server and no login: every setting is stored in the display link.

| File | What it is |
|---|---|
| `index.html` | Admin page: enter the event, get a display link, copy it, share it or scan its QR code  |
| `display.html` | The scoring display (rankings, matches, lunch break, bracket), same look as the Pi version |
| `vexdata.js` | Reads events.vex.com directly from the browser; includes the demo event |

## Publish on GitHub Pages
1. Create a repository on github.com (e.g. `vex-display`) and upload these three files to the top level.
2. In the repository, go to **Settings > Pages**. Under *Build and deployment*, set *Source* to **Deploy from a branch**, choose **main** and **/(root)**, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/vex-display/`. That address opens the admin page.

## Use
1. Open the admin page, enter the event SKU (or tick demo), fields, lunch break and your events.vex.com API token.
2. Click **Test HS** to check the connection from your browser.
3. **Open display**, **Copy link**, or scan the **QR code** on any TV, laptop or phone. Each device shows the same display.
4. To change settings, tap the gear (top-right) on any display. It opens the admin page with that display's settings filled in;
   make a new link from there. Links that were already shared keep their old settings.

The link looks like `display.html?view=double&hs=RE-V5RC-26-1234&hsf=3&hslunch=30&hslmin=45#t=<token>`.
Only settings that differ from the defaults are included.

## The API token
* The token goes after the `#` in the link. Browsers never send that part to GitHub, but **anyone who has the link can see the token**.
  Share token links only with your own devices and volunteers. For a public link, untick *Include the API token*:
  that link only works for demo mode, or for people who already have a token.
* Don't put the token in the repository files. A public repository is visible to everyone.
* Each device calls events.vex.com itself (2 requests per tournament per refresh). For links shared with many
  phones, set the refresh to 30–60 s so events.vex.com doesn't rate-limit your token.

## What's not in the web version
These need a shared server, so they're only in the Raspberry Pi version (`vrc_event`):
* Queuing tablets, check-ins, **Sent to Field** (ON FIELD NOW here moves forward on scores, as before)
* PA announcements
* Display controls from the admin page (refresh, reload, restart demo) and the startup IP-address screen

Each device remembers its own lunch-break and end-of-quals timers in its browser.
