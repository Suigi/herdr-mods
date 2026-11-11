# Agent picker

Native keyboard picker for agents and live subagents. The installed hotkey is
**Cmd-Shift-A** (`mod.open:agent-picker` in Herdr's `keys.json`).

- Type names, space/tab context or terminal addresses.
- Status filters: `working`, `blocked`, `done`, `idle`, or `status:working`.
  Single-letter `w `, `b `, `d `, `i ` become filters after the space.
- Tab / Shift-Tab cycles status; Up / Down selects; Enter visits; Escape closes.
- Pane-less subagents open in a terminal peek. Their statuses follow Herdr's
  sidebar: `error` is blocked and child `done` is idle.
- Seven fixed-height result slots keep the search field stationary.

## Most-recently-used order

Actual terminal-focus changes move agents to the front. Highlighting a picker
row or changing an agent's status does not count as a visit. Filtered results
retain this order. The agent you were viewing when opening the picker goes last,
but stays searchable, so the most recently visited *other* agent comes first.
Each picker opening snapshots the order; new agents append
and live status changes do not shuffle the current list.

Up to 256 visits persist in Herdr shared state at `agent-picker.mru.v1`.
History stores terminal addresses and creation times, not transcripts. Creation
times prevent a reused core terminal address from inheriting an old visit.
Unvisited agents follow in Herdr's normal model order. Tracking starts at
installation, not retroactively.

### Always-loaded tracker

The overlay itself cannot observe focus while closed. A second, non-interactive
copy of this same mod must remain loaded in the layout with `props.tracker` set.
It has no input, timers, polling, network access or program launches.

The installation uses the personal layout
`~/.config/herdr-app/layouts/agent-picker-mru.json`, cloned from `main` so shipped
files remain untouched. Its `work` column contains this zero-height block:

```json
{
  "id": "agent-picker-mru-tracker",
  "type": "block",
  "size": { "px": 0 },
  "min": 0,
  "max": 0,
  "content": { "mod": "agent-picker", "props": { "tracker": true } }
}
```

Tracking works while this layout (or another personal layout with this block)
is active, even when the picker is closed. Switching to an unmodified layout
pauses background tracking; the picker still records the focused agent when
opened and uses the saved history. The shipped `main` layout remains available.

The tracker uses Herdr's current focused-terminal data; if an overlay does not
expose a terminal as focused, that visit cannot be observed by the tracker.

## Verify

```sh
node test.cjs
herdr-app check ~/.config/herdr-app/mods/agent-picker
herdr-app status
herdr-app shot /tmp/agent-picker.png
```

The Node tests use a mocked Herdr API and never change the running window.
The generated editor files `gpui-kit.d.ts` and `jsconfig.json` are not tracked.
