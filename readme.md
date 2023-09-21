# MCTC
**MCTC (short for magi's custom twitch chat) is a webpage which shows the last chat message from a twitch chat.**

## Examples
See some examples below:
![Example 1](https://s.magiaus.de/githubpics/mctc1.png)
![Example 2](https://s.magiaus.de/githubpics/mctc2.png)
![Example 3](https://s.magiaus.de/githubpics/mctc3.png)

## How to use it
### Preparation
You will need an APP_ID and APP_SECRET from twitch - You get these if you create/manage an app: https://dev.twitch.tv/console/apps/.

### via GitHub pages
If you don't want to do any style changes and always use the most up-to-date version, you can just this link:
`https://magiausde.github.io/mctc/mctc.html?channel=magiausde&appid=abcde&appsecret=fghijkl`

Remember to update `channel=...`, `appid=...` and `appsecret=...`.

### local/cloned
Clone this repository (or download the zip/tar-file).

You can either
- set the values directly inside the `mctc.js`
- specify them as parameters in the URL, like `.../mctc.html?channel=magiausde&appid=abcde&appsecret=fghijkl`

Inside the `mctc.js`-file, you can also set users so ignore (e.g. your bots).

## Styling
You can change various style-aspects, just edit the `mctc.css`-file.

# Bug or Feature request?
Just add it as an issue. Please keep in mind that this project is a spare time project.