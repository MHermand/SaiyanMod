# usage-limits

A Claude Code mod: a slim band above the prompt with your Claude plan's usage limits, the 5-hour session and the week. It shows how much of each is used, how long until it resets, and whether your pace will reach the limit before then, with a toast when it gets tight.

## Screenshots

| | Dark | Light |
| --- | --- | --- |
| **On track** | ![Collapsed band, dark: 5 h at 33%, resets in 51m; week at 11%, resets in 5d 4h](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/on-track-dark.png) | ![Collapsed band, light, on track](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/on-track-light.png) |
| **Ahead of pace** | ![Collapsed band, dark: 5 h at 78% with only half the window gone, limit by 2:25 AM](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/ahead-of-pace-dark.png) | ![Collapsed band, light, ahead of pace](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/ahead-of-pace-light.png) |
| **Unfolded** | ![Unfolded band, dark: each window with its reset, its pace and a chip](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/unfolded-dark.png) | ![Unfolded band, light](https://raw.githubusercontent.com/MHermand/SaiyanMod/main/usage-limits/docs/screenshots/unfolded-light.png) |

The thin mark on each bar is where a steady use of the window would stand now: while the bar stays before it, you are on track.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-limits --marketplace MHermand/SaiyanMod
```

From a shell:

```
claude plugin install usage-limits --marketplace MHermand/SaiyanMod
```

Answer `y` to add the marketplace, then pick a scope (the user scope comes first). In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MHermand/SaiyanMod`, then Add plugin. A mod installed at the user scope from a terminal also loads in the desktop app's local sessions.

The limits come with Claude's replies on a Claude subscription (Pro, Max, Team); with an API key or a cloud provider there are none to show.

## What it does

- **Band**: `5 h` and `Week`, each with its bar, the percent used and the time left until it resets (`↻ 51m`, `↻ 5d 4h`). The dot and the bars are green on track, amber when the pace comes close to the limit, red when it would reach it before the reset; the time left then gives way to when the limit comes (`limit by 2:25 AM`).
- **Pace**: the share of the window gone, against the share used. The mark on the bar is that share; the projection is the percent you would reach at the reset if the pace so far holds. Early in a window (its first 8%) the pace is not told yet.
- **Unfolded**: the ▶ arrow (or `/limits`) folds out one row per window: `5h session` and `Week`, when each resets, `At this pace: ~40% at reset`, and a chip (On track, Tight, Ahead of pace). The head says how old the figures are; the flag beside ▼ cycles 🇺🇸 English, 🇫🇷 French and 🇪🇸 Spanish, and its pick is remembered across sessions.
- **Alerts**: a toast once per window at 75% and 90% used, and when the pace will reach the limit before the reset (from 20% used). An alert shown in one session is not shown again in another. An alert brings a band hidden with ✕ back.
- **`/limits`**: shows the band unfolded, even after ✕, and prints the limits in the conversation.
- **Other mods' bands**: it draws above them, never over them; with [agents-progress](https://github.com/MHermand/SaiyanMod#readme) running, both bands stack.

The figures are those of the last reply in the session: what you use elsewhere (claude.ai, other sessions) counts, and shows with the next reply here. A new session shows the last reading until its first reply. Per-model weekly limits and extra usage are not reported to mods.

## Settings

In `/config`, or in `~/.claude/settings.json`:

- `language`: the language before any flag is picked, `auto` (Claude Code's own language setting: French or Spanish when it is, else English), `en`, `fr` or `es`.
- `alerts`: `on` (default) or `off`.

```json
{ "pluginConfigs": { "usage-limits": { "options": { "language": "fr", "alerts": "on" } } } }
```

## License

MIT. See [LICENSE](https://github.com/MHermand/SaiyanMod/blob/main/LICENSE).
