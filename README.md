# DAGB

Some Discord places ask about your age before they open: 18+ channels, age-restricted servers and the invite screens that come with them. DAGB, a chromium extension that makes Discord skip all of that: you go back to browsing, the age popups stay away, and all of it just opens.

## Warning, read this first

This version does not write to your account. No birthday updates, no PATCH requests, nothing. The age gate is handled entirely inside the browser, so DAGB itself can't trip Discord's spam detection anymore. The old "you broke Discord's rules for spam" notice came from those writes, and they're gone.

Discord can still flag an account on their own side for other reasons (their scoring, not ours), and only they know exactly what trips it. If you want Discord to stop demoting the account server-side for good, verify legitimately through k-id (k-ID is Discord's own age assurance vendor): start the age verification in Discord until you hit the QR code, then scan it with your phone at https://verifier.amplitudes.me. That makes the account genuinely verified adult on Discord's servers, and DAGB has nothing left to fight. Use a spare account either way.

## What it does

- Opens age-restricted channels like any other channel
- Opens age-restricted servers and their invites without the are-you-18 screen
- Hides the age check popups Discord throws up
- Keeps your account reading as an adult so it stays that way
- Lets you change the date of birth it sends anytime from the popup

## How to install

**Chrome Extensions**

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on Developer mode
3. Click Load unpacked and pick the folder that has `manifest.json` in it
4. Go to `https://discord.com/app` and you're done

**Firefox Add-ons**

1. Open `about:debugging#/runtime/this-firefox`
2. Click Load Temporary Add-on and pick `manifest.json`
3. Open Discord, then open the DAGB popup once and press Allow next to Give Discord access

## The toggles

| Toggle | What it does |
|---|---|
| Turn it on | Master switch for everything |
| Allow adult channels | Lets you into the 18+ rooms |
| Hide the age popup | Closes any age check window Discord shows |
| Send an adult birthday | No longer writes to the account; the age gate is handled in the browser only |
| Keep it that way | No longer writes; the client-side rewrite re-applies on every page load |
| Change the device fingerprint | Makes 18+ rooms load when they refuse for some device |
| Give Discord access | Firefox and Zen only, the one-time Allow button |

## One note

If Discord ever changes something on their side and a channel refuses to open again, reload the extension page first, that fixes most of it.

Big age-gated communities can also refuse a join from their own side, at the server. That one is not a screen the browser can rewrite, so those joins are the one thing this can't force.

## Verify for real (k-ID)

Discord's age assurance vendor is k-ID. If you want Discord to stop demoting the account server-side for good, verify legitimately: start the age verification in Discord until you hit the QR code, then scan it.

DAGB includes two tools for this in the `verifier/` folder:

1. **QR scanner** (`verifier/index.html`): open it in a browser, point your phone camera at Discord's QR code, and it extracts the verification link and opens it. Complete the k-ID flow on your phone (facial estimation, ID scan, or credit card).

2. **Auto-verify userscript** (`verifier/dagb-kid.user.js`): install it in Tampermonkey/Violentmonkey. It intercepts k-ID's camera and feeds it a static image instead of a live selfie. Set the image URL via the Tampermonkey menu ("Set verification image URL") — use any photo URL (Pinterest, etc.). When k-ID asks for a selfie, it receives the image and processes it as an adult face. No real selfie needed.

   Note: the image URL must allow cross-origin access (CORS). If a Pinterest image fails to load, host the image locally or use a CORS-friendly URL.

Use a spare account either way.

## Not my problem

DAGB (Discord Age Gate Bypass) is not made by Discord and i didnt build it because i hate discord. Using it breaks Discord's Terms of Service, and that's a choice you make when you install it. I'm not responsible for anything that happens after that: flags, suspensions, bans, lost accounts, lost data, whatever. If that sounds bad, use a spare account.

DAGB (Discord Age Gate Bypass) is not made by Discord and i didnt build it because i hate discord. Using it breaks Discord's Terms of Service, and that's a choice you make when you install it. I'm not responsible for anything that happens after that: flags, suspensions, bans, lost accounts, lost data, whatever. If that sounds bad, use a spare account.
