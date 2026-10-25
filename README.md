# DAGB

Some Discord places ask about your age before they open: 18+ channels, age-restricted servers and the invite screens that come with them. DAGB makes Discord skip all of that: you go back to browsing, the age popups stay away, and all of it just opens.

It works on Chrome, Edge, Helium, Brave and Zen or Firefox. Nothing to sign up for, nothing to install extra, it all happens inside the browser.

## Warning, read this first

This version does not write to your account. No birthday updates, no PATCH requests, nothing. The age gate is handled entirely inside the browser, so DAGB itself can't trip Discord's spam detection anymore. The old "you broke Discord's rules for spam" notice came from those writes, and they're gone.

Discord can still flag an account on their own side for other reasons (their scoring, not ours), and only they know exactly what trips it. If you want Discord to stop demoting the account server-side for good, verify legitimately through k-id: start the age verification in Discord until you hit the QR code, then scan it with your phone at https://verifier.amplitudes.me. That makes the account genuinely verified adult on Discord's servers, and DAGB has nothing left to fight. Use a spare account either way.

## What it does

- Opens age-restricted channels like any other channel
- Opens age-restricted servers and their invites without the are-you-18 screen
- Hides the age check popups Discord throws up
- Keeps your account reading as an adult so it stays that way
- Lets you change the date of birth it sends anytime from the popup

## How to install

**Chrome, Edge, Helium, Brave**

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on Developer mode
3. Click Load unpacked and pick the folder that has `manifest.json` in it
4. Go to `https://discord.com/app` and you're done

**Zen or Firefox**

1. Open `about:debugging#/runtime/this-firefox`
2. Click Load Temporary Add-on and pick `manifest.json`
3. Open Discord, then open the DAGB popup once and press Allow next to Give Discord access

Firefox asks for that one Allow because it treats site access as optional. Chrome browsers don't need it.

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

## Not my problem

DAGB (Discord Age Gate Bypass) is not made by Discord, and I didn't build it because I hate Discord. I built it because I don't want to upload my face or my ID to a third party just to prove my age, and Discord itself has been breached multiple times, so I'm not handing that data to anyone else either.

The rest is short: this breaks Discord's Terms of Service, and installing it is your choice. I'm not responsible for flags, suspensions, bans, or anything that happens to your account after that. If that sounds bad, skip it, and use a spare account.
