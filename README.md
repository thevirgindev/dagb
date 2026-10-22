<img width="691" height="276" alt="image" src="https://github.com/user-attachments/assets/954e6cc7-bac7-4e10-9025-1a5a7b9fa161" /># DAGB

Some Discord places ask about your age before they open: 18+ channels, age-restricted servers and the invite screens that come with them. DAGB, a chromium extension that makes Discord skip all of that: you go back to browsing, the age popups stay away, and all of it just opens.

It.

## Warning, read this first

Discord watches for account writes that look automated, and DAGB's birthday update can read as one. That can flag the account for spam: you'll see a "you broke Discord's rules for spam" notice, some features are limited for about 2 days, and the record sits on the account for 2 years. Resetting your password clears the violation right away.

So: use a spare account for this. Not your **main one**.

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
| Send an adult birthday | Writes the birthday only when Discord reports something different, at most one per 6 hours |
| Keep it that way | Watches what Discord answers and re-sends only if it drifted, nothing runs on a timer |
| Change the device fingerprint | Makes 18+ rooms load when they refuse for some device |
| Give Discord access | Firefox and Zen only, the one-time Allow button |

## One note

If Discord ever changes something on their side and a channel refuses to open again, reload the extension page first, that fixes most of it.

## Not my problem

DAGB (Discord Age Gate Bypass) is not made by Discord and i didnt build it because i hate discord. Using it breaks Discord's Terms of Service, and that's a choice you make when you install it. I'm not responsible for anything that happens after that: flags, suspensions, bans, lost accounts, lost data, whatever. If that sounds bad, use a spare account.
