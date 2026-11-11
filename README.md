# Herdr mods

Personal mods for [Herdr](https://herdr.dev).

## Agent picker

[`mods/agent-picker/`](mods/agent-picker/) is a native keyboard agent picker with
status and text filters, live subagent support, and persistent most-recently-used
ordering.

### Install

Copy `mods/agent-picker/` into your Herdr app home's `mods/` directory. Do not
replace unrelated settings or shipped mods. The default app home on macOS/Linux
is `~/.config/herdr-app`; on Windows use the home selected by your installation.
`HERDR_APP_HOME`, when set, overrides the app home.

Merge a shortcut into the `global` section of your `keys.json`, choosing an
unused key (ask before replacing an existing binding):

```json
"cmd-shift-a": "mod.open:agent-picker"
```

That example is the Mac binding. Choose a suitable shortcut on Windows/Linux.
Do not copy another machine's complete key configuration.

For focus tracking while the picker is closed, add the zero-height tracker
block described in the [mod README](mods/agent-picker/README.md) to a personal
layout. Clone shipped layouts before changing their structure. Without the
tracker, the picker can only record visits it observes when opened.

The implementation uses Herdr APIs, not OS-specific programs. It has been
checked on macOS; Windows/Linux compatibility has not been tested. Node.js is
needed for the standalone tests only, not to run the mod.

### Verify

```sh
node mods/agent-picker/test.cjs
herdr-app check /path/to/herdr-app-home/mods/agent-picker
herdr-app status
```

Inspect a screenshot with `herdr-app shot` after installation. Generated API
files and private MRU history are not included in this repository.
