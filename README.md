# DAGB

Some Discord places ask about your age before they open: 18+ channels, age-restricted servers and the invite screens that come with them. DAGB makes Discord skip all of that: you go back to browsing, the age popups stay away, and all of it just opens.

It works on Chrome, Edge, Helium, Brave and Zen or Firefox. Nothing to sign up for, nothing to install extra, it all happens inside the browser.

## Warning, read this first

Discord watches for account writes that look automated, and DAGB's birthday update can read as one. That can flag the account for spam: you'll see a "you broke Discord's rules for spam" notice, some features are limited for about 2 days, and the record sits on the account for 2 years. Resetting your password clears the violation right away.

So: use a spare account for this. Not your main one. This version was built after that exact thing happened, and the birthday update is now rarely sent: at most one every 6 hours, and only when Discord reports something different from what the page sees. When an official age screen demands it, the rule is once per day. The account flag is still Discord's side of the fence, and only they know exactly what trips it.

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
| Send an adult birthday | Writes the birthday only when Discord reports something different, at most one per 6 hours |
| Keep it that way | Watches what Discord answers and re-sends only if it drifted, nothing runs on a timer |
| Change the device fingerprint | Makes 18+ rooms load when they refuse for some device |
| Give Discord access | Firefox and Zen only, the one-time Allow button |

## One note

If Discord ever changes something on their side and a channel refuses to open again, reload the extension page first, that fixes most of it.

Big age-gated communities can also refuse a join from their own side, at the server. That one is not a screen the browser can rewrite, so those joins are the one thing this can't force.
