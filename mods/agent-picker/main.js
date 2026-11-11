import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { agents, terminals, focused, shared, setShared, theme, props, closeOverlay, run } from "herdr";

const STATUSES = ["working", "blocked", "done", "idle"];
const FILTERS = ["all", ...STATUSES];
const PAGE = 7;
const MRU_KEY = "agent-picker.mru.v1";
const MRU_LIMIT = 256;

// Bare status words and status:<value> are filters. Space commits w/b/d/i
// shorthand; an unfinished single letter remains a text search.
export function parseQuery(query) {
  const statuses = [];
  const words = [];
  for (const match of query.toLowerCase().matchAll(/\S+/g)) {
    const word = match[0];
    const shorthand = { w: "working", b: "blocked", d: "done", i: "idle" };
    const shortStatus = Object.hasOwn(shorthand, word) && /\s/.test(query[match.index + word.length] ?? "");
    const status = shortStatus ? shorthand[word] : word.startsWith("status:") ? word.slice(7) : word;
    if (STATUSES.includes(status)) statuses.push(status);
    else words.push(word);
  }
  return { statuses, words };
}

// agents() only contains agents with panes. Add live descendants from the core,
// resolving ancestry rather than relying on terminal order (including remote IDs).
export function collectAgents(listed, allTerminals) {
  const result = new Map(listed.map(a => [a.address, { ...a }]));
  const byAddress = new Map(allTerminals.map(t => [t.address, t]));
  const resolving = new Set();
  function resolve(address) {
    if (result.has(address)) return result.get(address);
    const terminal = byAddress.get(address);
    if (!terminal || terminal.state !== "live" || !terminal.parent || resolving.has(address)) return null;
    resolving.add(address);
    const parent = resolve(terminal.parent);
    resolving.delete(address);
    if (!parent) return null;
    // Match the sidebar: child completion belongs to its parent, not Done;
    // an error is a blocked child. Unknown status is not guessed from output.
    const rawStatus = terminal.status;
    const status = rawStatus === "error" ? "blocked" : rawStatus === "done" ? "idle" : rawStatus ?? "unknown";
    const agent = {
      address, pane: null, space: parent.space, space_name: parent.space_name,
      tab: parent.tab, tab_index: parent.tab_index, tab_name: parent.tab_name,
      title: terminal.name || terminal.template || terminal.title || terminal.program?.name || address,
      name: terminal.name, program: terminal.program, app: terminal.report?.app,
      status, parent_title: parent.title, subagent: true,
    };
    result.set(address, agent);
    return agent;
  }
  for (const terminal of allTerminals) resolve(terminal.address);
  return [...result.values()];
}

export function filterAgents(all, query) {
  const { statuses, words } = parseQuery(query);
  return all.filter(a => {
    const text = [a.title, a.name, a.parent_title, a.program?.name, a.app, a.space_name, a.tab_name, a.address].join(" ").toLowerCase();
    return (!statuses.length || statuses.includes(a.status)) && words.every(w => text.includes(w));
  });
}

// Persist addresses plus creation times so reused core IDs do not inherit old visits.
export function readVisits(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(v => {
    if (!v || typeof v.address !== "string" || seen.has(v.address)) return false;
    seen.add(v.address);
    return true;
  }).slice(0, MRU_LIMIT);
}

export function moveToFront(visits, address, created_ms) {
  return [{ address, created_ms: created_ms ?? null }, ...readVisits(visits).filter(v => v.address !== address)].slice(0, MRU_LIMIT);
}

export function sortByMru(all, visits, core) {
  const births = new Map(core.map(t => [t.address, t.created_ms]));
  const valid = readVisits(visits).filter(v => {
    const born = births.get(v.address);
    return born == null || v.created_ms == null || born === v.created_ms;
  });
  const ranks = new Map(valid.map((v, i) => [v.address, i]));
  // Stable sort leaves agents not yet visited in their original model order.
  return [...all].sort((a, b) => (ranks.get(a.address) ?? Infinity) - (ranks.get(b.address) ?? Infinity));
}

export default class AgentPicker extends View {
  init(_props, cx) {
    this.tracker = Boolean(_props?.tracker);
    this.lastFocus = undefined;
    this.observeFocus();
    if (this.tracker) return;
    const core = terminals();
    this.order = sortByMru(collectAgents(agents(), core), shared(MRU_KEY), core).map(a => a.address);
    this.query = "";
    this.selected = null;
    this.index = 0;
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Filter: w / b / d / i + space, or working login…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.selected = null;
      this.index = 0;
      cx.notify();
    });
    this.input.on("submit", () => this.choose());
    this.input.focus();
  }

  observeFocus() {
    const focus = focused();
    // Use the actual terminal, not focused().agent: that can describe a stale
    // agent-block selection rather than the pane the person is looking at.
    const address = focus?.terminal ?? focus?.shown ?? null;
    if (address === this.lastFocus) return;
    this.lastFocus = address;
    if (!address) return;
    const core = terminals();
    if (!collectAgents(agents(), core).some(a => a.address === address)) return;
    const born = core.find(t => t.address === address)?.created_ms ?? null;
    const visits = readVisits(shared(MRU_KEY));
    if (visits[0]?.address === address && visits[0]?.created_ms === born) return;
    setShared(MRU_KEY, moveToFront(visits, address, born));
  }

  allAgents() {
    const all = collectAgents(agents(), terminals());
    // Freeze order for this opening. Newly discovered agents append, without
    // moving the selection when statuses, focus, or shared MRU state change.
    this.order ??= [];
    const known = new Set(this.order);
    for (const a of all) if (!known.has(a.address)) { this.order.push(a.address); known.add(a.address); }
    const ranks = new Map(this.order.map((address, i) => [address, i]));
    return all.sort((a, b) => ranks.get(a.address) - ranks.get(b.address));
  }

  rows() {
    return filterAgents(this.allAgents(), this.query);
  }

  reconcile(rows) {
    const at = rows.findIndex(a => a.address === this.selected);
    this.index = at >= 0 ? at : Math.max(0, Math.min(this.index, rows.length - 1));
    this.selected = rows[this.index]?.address ?? null;
  }

  dismiss() { closeOverlay(props().overlay); }

  choose() {
    const rows = this.rows();
    this.reconcile(rows);
    if (!this.selected) return;
    const agent = rows[this.index];
    this.dismiss();
    run(agent.subagent ? "terminal.peek" : "agent.focus", { terminal: agent.address });
  }

  setStatus(status, cx) {
    const { words } = parseQuery(this.query);
    this.query = status === "all" ? words.join(" ") : `${status} ${words.join(" ")}`;
    this.input.set_value(this.query);
    this.input.set_selected_range({ start: this.query.length, end: this.query.length });
    this.selected = null;
    this.index = 0;
    this.input.focus();
    cx.notify();
  }

  render() {
    if (this.tracker) {
      this.observeFocus();
      return div().size(0);
    }
    const t = theme();
    const all = this.allAgents();
    const rows = filterAgents(all, this.query);
    this.reconcile(rows);
    const { statuses } = parseQuery(this.query);
    const active = statuses.length === 1 ? statuses[0] : "all";
    const start = Math.max(0, Math.min(this.index - Math.floor(PAGE / 2), rows.length - PAGE));
    const shown = rows.slice(start, start + PAGE);
    return v_flex().id("agent-picker").track_focus(this.handle).w_full().p(18).gap(12)
      .bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { cx.stop_propagation(); this.dismiss(); return; }
        if (e.key === "tab") {
          cx.stop_propagation();
          const delta = e.modifiers.shift ? -1 : 1;
          this.setStatus(FILTERS[(FILTERS.indexOf(active) + delta + FILTERS.length) % FILTERS.length], cx);
          return;
        }
        if (e.key !== "down" && e.key !== "up") return;
        cx.stop_propagation();
        if (rows.length) {
          this.index = (this.index + (e.key === "down" ? 1 : -1) + rows.length) % rows.length;
          this.selected = rows[this.index].address;
        }
        cx.notify();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(17).font_semibold().child("Agents"))
        .child(div().text_size(11).text_color(t.dim).child(`${rows.length} of ${all.length} · Esc to close`)))
      .child(h_flex().h(38).flex_none().px(10).items_center().bg(t.background)
        .border_1().border_color(t.accent).rounded(8)
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .child(h_flex().gap(6).children(FILTERS.map(status => {
        const count = status === "all" ? all.length : all.filter(a => a.status === status).length;
        const on = status === "all" ? !statuses.length : statuses.includes(status);
        return h_flex().id(`status-${status}`).gap(5).px(9).py(5).rounded(6)
          .bg(on ? t.selected : t.surface).text_color(on ? t.foreground : t.muted)
          .cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((_e, cx) => this.setStatus(status, cx))
          .child(div().text_color(status === "all" ? t.muted : t[status]).child("●"))
          .child(status).child(div().text_color(t.dim).child(String(count)));
      })))
      .child(v_flex().h(PAGE * 54 + (PAGE - 1) * 4).flex_none().gap(4).children(shown.length ? shown.map(a => {
        const on = a.address === this.selected;
        return h_flex().id(`agent-${a.address}`).h(54).flex_none().px(10).gap(10).items_center().rounded(8)
          .bg(on ? t.selected : t.popover).cursor_pointer().hover(s => s.bg(t.hover))
          .on_click(() => { this.selected = a.address; this.choose(); })
          .child(div().w(10).text_color(t[a.status] ?? t.dim).child("●"))
          .child(v_flex().flex_1().min_w(0).gap(3)
            .child(div().truncate().font_semibold().child((a.subagent ? "↳ " : "") + (a.title || a.program?.name || a.app || "Agent")))
            .child(div().truncate().text_size(11).text_color(t.muted)
              .child([a.program?.name || a.app, a.space_name, a.tab_name || `Tab ${a.tab_index}`, a.address].filter(Boolean).join(" · "))))
          .child(div().text_size(11).text_color(t[a.status] ?? t.dim).child(a.status));
      }) : [v_flex().h_full().items_center().justify_center().gap(6)
        .child(div().text_color(t.muted).child(all.length ? "No matching agents" : "No agents reporting status"))
        .child(div().text_size(11).text_color(t.dim).child("Change the query or press Tab to switch status."))]))
      .child(h_flex().justify_between().text_size(11).text_color(t.dim)
        .child("MRU first · ↑ ↓ Select   Enter Focus   Tab / ⇧Tab Status")
        .child(rows.length ? `${start + 1}–${start + shown.length} / ${rows.length}` : ""));
  }
}
