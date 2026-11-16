/**
 * Migration adapter for code written against intro.js v7/v8 — close to, but
 * not a 100% drop-in replacement (see docs for the supported surface).
 * Maps the intro.js option names, callbacks, data attributes and 1-based
 * indices onto the TourKit API. Intended as a migration aid, not as a
 * long-term API: new code should use `createTour` / `createHints` directly.
 */
import { resolveStorage } from "../core/storage";
import type { Placement, StepInput, TourOptionsInput } from "../core/types";
import { createHints, fromHintAttributes, type Hints, type MarkerAnchor } from "../hints";
import { createTour, type Tour } from "../tour/tour";
import { isElementHidden } from "../ui/dom";

/* ------------------------------- mappers ---------------------------------- */

const POSITION_MAP: Record<string, Placement> = {
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  floating: "center",
  "top-left-aligned": "top-start",
  "top-middle-aligned": "top",
  "top-right-aligned": "top-end",
  "bottom-left-aligned": "bottom-start",
  "bottom-middle-aligned": "bottom",
  "bottom-right-aligned": "bottom-end",
};

export function mapIntroPosition(position?: string | null): Placement | undefined {
  if (!position) return undefined;
  return POSITION_MAP[position] ?? (position as Placement);
}

/**
 * intro.js hint anchors (`top-middle`, `middle-right`, ...) → MarkerAnchor.
 * Already-normalized TourKit anchors pass through unchanged, so the mapper is
 * safe to apply to values the native scanner has canonicalized.
 */
export function mapIntroHintPosition(position?: string | null): MarkerAnchor | undefined {
  if (!position) return undefined;
  const [v, hRaw] = position.split("-");
  const horizontal =
    hRaw === "left" || hRaw === "start"
      ? "start"
      : hRaw === "right" || hRaw === "end"
        ? "end"
        : "center";
  const vertical = v === "top" || v === "bottom" ? v : "middle";
  return `${vertical}-${horizontal}` as MarkerAnchor;
}

interface IntroStep {
  element?: string | Element | null;
  intro?: string;
  title?: string;
  position?: string;
  tooltipClass?: string;
  disableInteraction?: boolean;
  /** Explicit intro.js step number (`data-step` equivalent), 1-based. */
  step?: number;
}

function mapIntroStep(step: IntroStep): StepInput {
  return {
    target: step.element ?? undefined,
    title: step.title,
    content: step.intro ?? "",
    placement: mapIntroPosition(step.position),
    disableInteraction: step.disableInteraction,
    classes: step.tooltipClass ? { tooltip: step.tooltipClass } : undefined,
  };
}

interface ScannedIntroStep {
  input: StepInput;
  /** The intro.js step number: explicit `data-step` or the filled slot, 1-based. */
  number: number;
  element: HTMLElement;
}

/**
 * Scans `data-intro` elements preserving intro.js slot semantics: explicit
 * `data-step` values claim their slots, unnumbered elements fill the gaps
 * and receive the slot number they landed in.
 */
function scanIntroSteps(root: ParentNode, group?: string): ScannedIntroStep[] {
  const numbered = new Map<number, ScannedIntroStep>();
  const unnumbered: ScannedIntroStep[] = [];

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-intro]"))) {
    if (group && el.getAttribute("data-intro-group") !== group) continue;
    if (isElementHidden(el)) continue;

    const input: StepInput = {
      target: el,
      content: el.getAttribute("data-intro") ?? "",
      title: el.getAttribute("data-title") ?? undefined,
      placement: mapIntroPosition(el.getAttribute("data-position")),
      disableInteraction: el.hasAttribute("data-disable-interaction") ? true : undefined,
    };

    const slot = parseInt(el.getAttribute("data-step") ?? "", 10);
    if (Number.isFinite(slot) && slot > 0) {
      numbered.set(slot - 1, { input, number: slot, element: el });
    } else {
      unnumbered.push({ input, number: 0, element: el });
    }
  }

  const result: ScannedIntroStep[] = [];
  const maxSlot = numbered.size ? Math.max(...numbered.keys()) + 1 : 0;
  for (let i = 0; i < Math.max(maxSlot, numbered.size + unnumbered.length); i++) {
    const explicit = numbered.get(i);
    if (explicit) {
      numbered.delete(i);
      result.push(explicit);
    } else if (unnumbered.length) {
      const item = unnumbered.shift()!;
      item.number = i + 1;
      result.push(item);
    }
  }
  result.push(...[...numbered.entries()].sort(([a], [b]) => a - b).map(([, s]) => s));
  return result;
}

/** Scans intro.js-style `data-intro` / `data-step` / ... attributes. */
export function fromIntroDataAttributes(root: ParentNode = document, group?: string): StepInput[] {
  return scanIntroSteps(root, group).map((s) => s.input);
}

type IntroOptions = Record<string, unknown> & { steps?: IntroStep[] };

/** Maps the intro.js options object onto TourOptionsInput. */
export function mapIntroOptions(raw: IntroOptions): TourOptionsInput {
  const out: TourOptionsInput = {};
  const labels: Record<string, string> = {};
  const buttons: Record<string, boolean> = {};
  const overlay: Record<string, unknown> = {};
  const scroll: Record<string, unknown> = {};

  if (raw.steps) out.steps = raw.steps.map(mapIntroStep);

  if (typeof raw["nextLabel"] === "string") labels["next"] = raw["nextLabel"];
  if (typeof raw["prevLabel"] === "string") labels["back"] = raw["prevLabel"];
  if (typeof raw["doneLabel"] === "string") labels["done"] = raw["doneLabel"];
  if (typeof raw["skipLabel"] === "string") labels["skip"] = raw["skipLabel"];
  if (typeof raw["stepNumbersOfLabel"] === "string")
    labels["stepOf"] = `{step} ${raw["stepNumbersOfLabel"]} {total}`;
  if (typeof raw["dontShowAgainLabel"] === "string")
    labels["dontShowAgain"] = raw["dontShowAgainLabel"];

  if (typeof raw["nextToDone"] === "boolean") buttons["doneOnLast"] = raw["nextToDone"];
  // intro.js boundary semantics: hidePrev hides Back on the first step only,
  // hideNext hides Next (and Done) on the last step only.
  if (raw["hidePrev"] === true) buttons["hideBackOnFirst"] = true;
  if (raw["hideNext"] === true) {
    buttons["hideNextOnLast"] = true;
    buttons["doneOnLast"] = false;
  }
  if (raw["showButtons"] === false) {
    buttons["next"] = false;
    buttons["back"] = false;
  }

  if (typeof raw["exitOnOverlayClick"] === "boolean")
    overlay["clickToExit"] = raw["exitOnOverlayClick"];
  if (typeof raw["overlayOpacity"] === "number") overlay["opacity"] = raw["overlayOpacity"];
  if (typeof raw["helperElementPadding"] === "number")
    overlay["padding"] = raw["helperElementPadding"];

  if (raw["scrollToElement"] === false || raw["scrollTo"] === "off") scroll["block"] = "off";
  if (typeof raw["scrollPadding"] === "number") scroll["padding"] = raw["scrollPadding"];

  if (typeof raw["tooltipPosition"] === "string")
    out.placement = mapIntroPosition(raw["tooltipPosition"]);
  if (Array.isArray(raw["positionPrecedence"]))
    out.placementPrecedence = raw["positionPrecedence"] as TourOptionsInput["placementPrecedence"];

  if (typeof raw["showBullets"] === "boolean") out.bullets = raw["showBullets"];
  if (typeof raw["showProgress"] === "boolean") out.progress = raw["showProgress"];
  if (typeof raw["showStepNumbers"] === "boolean") out.stepNumbers = raw["showStepNumbers"];
  if (typeof raw["keyboardNavigation"] === "boolean") out.keyboard = raw["keyboardNavigation"];
  if (typeof raw["exitOnEsc"] === "boolean") out.exitOnEsc = raw["exitOnEsc"];
  if (typeof raw["disableInteraction"] === "boolean")
    out.disableInteraction = raw["disableInteraction"];
  // intro.js renders step content as HTML by default; keep that contract here.
  // Native TourKit stays XSS-safe by default (allowHTML: false).
  out.allowHTML =
    typeof raw["tooltipRenderAsHtml"] === "boolean" ? raw["tooltipRenderAsHtml"] : true;
  // Not an intro.js option: an escape hatch for migrating code that must keep
  // HTML content but wants it sanitized (DOMPurify and friends).
  if (typeof raw["sanitize"] === "function") {
    out.sanitize = raw["sanitize"] as (html: string) => string;
  }

  const classes: Record<string, string> = {};
  if (typeof raw["tooltipClass"] === "string") classes["tooltip"] = raw["tooltipClass"];
  if (typeof raw["buttonClass"] === "string") classes["button"] = raw["buttonClass"];
  if (typeof raw["highlightClass"] === "string") classes["overlay"] = raw["highlightClass"];

  if (raw["dontShowAgain"] === true) {
    out.showOnce = {
      key:
        typeof raw["dontShowAgainCookie"] === "string"
          ? raw["dontShowAgainCookie"]
          : "tk-dont-show-again",
      checkbox: true,
    };
  }

  if (Object.keys(labels).length) out.labels = labels as TourOptionsInput["labels"];
  if (Object.keys(buttons).length) out.buttons = buttons as TourOptionsInput["buttons"];
  if (Object.keys(overlay).length) out.overlay = overlay as TourOptionsInput["overlay"];
  if (Object.keys(scroll).length) out.scroll = scroll as TourOptionsInput["scroll"];
  if (Object.keys(classes).length) out.classes = classes as TourOptionsInput["classes"];

  return out;
}

/* ----------------------------- compat tour --------------------------------- */

type AnyCallback = (...args: unknown[]) => unknown;

const DONT_SHOW_AGAIN_DEFAULT_KEY = "tk-dont-show-again";
const DONT_SHOW_AGAIN_VALUE = "1";

export class CompatTour {
  private _raw: IntroOptions = {};
  private _tour: Tour | null = null;
  private readonly _callbacks = new Map<string, AnyCallback>();
  private readonly _root: ParentNode;
  /** intro.js step numbers (1-based, may be sparse) parallel to tour steps. */
  private _stepNumbers: number[] = [];
  /** Steps in intro.js shape, as resolved by the last `start()`. */
  private _introSteps: IntroStep[] = [];
  /** Distinguishes programmatic `nextStep()` ("end") from a Done click ("done"). */
  private _programmaticNext = false;

  constructor(elementOrSelector?: string | Element) {
    this._root =
      typeof elementOrSelector === "string"
        ? (document.querySelector(elementOrSelector) ?? document)
        : (elementOrSelector ?? document);
  }

  setOptions(options: IntroOptions): this {
    this._raw = { ...this._raw, ...options };
    return this;
  }

  setOption(key: string, value: unknown): this {
    return this.setOptions({ [key]: value });
  }

  getOption(key: string): unknown {
    return this._raw[key];
  }

  getOptions(): IntroOptions {
    return { ...this._raw };
  }

  addStep(step: IntroStep): this {
    this._raw.steps = [...(this._raw.steps ?? []), step];
    return this;
  }

  addSteps(steps: IntroStep[]): this {
    steps.forEach((step) => this.addStep(step));
    return this;
  }

  setSteps(steps: IntroStep[]): this {
    this._raw.steps = steps;
    return this;
  }

  /** Steps in intro.js shape as resolved by the last `start()` (or the raw options). */
  getSteps(): IntroStep[] {
    return this._introSteps.length ? [...this._introSteps] : [...(this._raw.steps ?? [])];
  }

  getStep(index: number): IntroStep | undefined {
    return this.getSteps()[index];
  }

  /** New instance with the same options and callbacks (intro.js `clone()`). */
  clone(): CompatTour {
    const copy = new CompatTour();
    copy._raw = { ...this._raw, steps: this._raw.steps ? [...this._raw.steps] : undefined };
    this._callbacks.forEach((callback, name) => copy._callbacks.set(name, callback));
    return copy;
  }

  /** Persists/clears the "don't show again" flag (intro.js cookie equivalent). */
  setDontShowAgain(value: boolean): this {
    const key =
      typeof this._raw["dontShowAgainCookie"] === "string"
        ? this._raw["dontShowAgainCookie"]
        : DONT_SHOW_AGAIN_DEFAULT_KEY;
    const storage = resolveStorage("local");
    if (value) {
      storage.set(key, DONT_SHOW_AGAIN_VALUE);
    } else {
      storage.remove(key);
    }
    return this;
  }

  async start(): Promise<this> {
    if (this._raw["isActive"] === false) return this;

    // intro.js restarts on repeated start(); never run two tours in parallel.
    if (this._tour?.isActive) await this._tour.exit(true);

    const mapped = mapIntroOptions(this._raw);
    if (mapped.steps?.length) {
      const rawSteps = this._raw.steps ?? [];
      this._stepNumbers = rawSteps.map((step, i) => step.step ?? i + 1);
      this._introSteps = [...rawSteps];
    } else {
      const scanned = scanIntroSteps(
        this._root,
        typeof this._raw["group"] === "string" ? this._raw["group"] : undefined
      );
      mapped.steps = scanned.map((s) => s.input);
      this._stepNumbers = scanned.map((s) => s.number);
      this._introSteps = scanned.map((s) => ({
        element: s.element,
        intro: s.input.content,
        title: s.input.title,
        step: s.number,
      }));
    }

    const tour = createTour(mapped);
    this._tour = tour;
    this._wireCallbacks(tour);
    await tour.start();
    return this;
  }

  private _wireCallbacks(tour: Tour): void {
    const cb = (name: string) => this._callbacks.get(name);

    tour.on("beforeStepChange", async (e) => {
      const handler = cb("beforechange");
      if (!handler) return;
      const target = typeof e.step.target === "function" ? e.step.target() : e.step.target;
      const el = typeof target === "string" ? document.querySelector(target) : (target ?? null);
      const result = await handler.call(this, el, e.to, e.direction);
      // intro.js semantics: `false` blocks forward navigation only.
      if (result === false && e.direction === "forward") e.cancel();
    });

    tour.on("stepChange", (e) => {
      cb("change")?.call(this, e.target);
      cb("afterchange")?.call(this, e.target);
    });

    tour.on("complete", ({ reason }) => {
      const index = tour.index;
      const lastIndex = tour.steps.length - 1;

      if (reason === "skipped") {
        cb("skip")?.call(this, index);
        // intro.js fires oncomplete for a skip only on the last step;
        // closing mid-tour is just onskip + onexit.
        if (index === lastIndex) cb("complete")?.call(this, index, "skip");
        return;
      }

      // intro.js: Done button reports "done", programmatic nextStep() past
      // the last step reports "end".
      cb("complete")?.call(this, index, this._programmaticNext ? "end" : "done");
    });

    tour.on("beforeExit", async (e) => {
      const result = await cb("beforeexit")?.call(this);
      if (result === false) e.cancel();
    });

    tour.on("exit", () => void cb("exit")?.call(this));
    tour.on("start", () => void cb("start")?.call(this));
  }

  async exit(force?: boolean): Promise<this> {
    await this._tour?.exit(force);
    return this;
  }

  async nextStep(): Promise<this> {
    this._programmaticNext = true;
    try {
      await this._tour?.next();
    } finally {
      this._programmaticNext = false;
    }
    return this;
  }

  async previousStep(): Promise<this> {
    await this._tour?.back();
    return this;
  }

  /** intro.js numbering is 1-based. */
  async goToStep(step: number): Promise<this> {
    await this._tour?.goTo(step - 1);
    return this;
  }

  /** Jumps to the step with an explicit intro.js number (`data-step` / `step`). */
  async goToStepNumber(step: number): Promise<this> {
    const index = this._stepNumbers.indexOf(step);
    if (index >= 0) await this._tour?.goTo(index);
    return this;
  }

  getCurrentStep(): number | undefined {
    return this._tour?.index;
  }

  currentStep(): number | undefined {
    return this.getCurrentStep();
  }

  isActive(): boolean {
    return this._tour?.isActive ?? this._raw["isActive"] !== false;
  }

  hasStarted(): boolean {
    return this._tour?.isActive ?? false;
  }

  refresh(refreshSteps?: boolean): this {
    this._tour?.refresh(refreshSteps);
    return this;
  }

  private _registerCallback(name: string, callback: AnyCallback): this {
    if (typeof callback !== "function") {
      throw new Error(`Provided callback for on${name} was not a function`);
    }
    this._callbacks.set(name, callback);
    return this;
  }

  onbeforechange = (callback: AnyCallback) => this._registerCallback("beforechange", callback);
  onBeforeChange = this.onbeforechange;
  onchange = (callback: AnyCallback) => this._registerCallback("change", callback);
  onChange = this.onchange;
  onafterchange = (callback: AnyCallback) => this._registerCallback("afterchange", callback);
  onAfterChange = this.onafterchange;
  oncomplete = (callback: AnyCallback) => this._registerCallback("complete", callback);
  onComplete = this.oncomplete;
  onexit = (callback: AnyCallback) => this._registerCallback("exit", callback);
  onExit = this.onexit;
  onskip = (callback: AnyCallback) => this._registerCallback("skip", callback);
  onSkip = this.onskip;
  onbeforeexit = (callback: AnyCallback) => this._registerCallback("beforeexit", callback);
  onBeforeExit = this.onbeforeexit;
  onstart = (callback: AnyCallback) => this._registerCallback("start", callback);
  onStart = this.onstart;
}

/* ----------------------------- compat hints -------------------------------- */

export class CompatHints {
  private _hints: Hints | null = null;
  private readonly _root: ParentNode;
  private readonly _callbacks = new Map<string, AnyCallback>();

  constructor(elementOrSelector?: string | Element) {
    this._root =
      typeof elementOrSelector === "string"
        ? (document.querySelector(elementOrSelector) ?? document)
        : (elementOrSelector ?? document);
  }

  /** intro.js `addHints()`: renders hints from `data-hint` attributes. */
  addHints(): this {
    if (this._hints) return this;

    const inputs = fromHintAttributes(this._root).map((input) => ({
      ...input,
      markerPosition: mapIntroHintPosition(input.markerPosition as string | undefined),
    }));

    this._hints = createHints({ hints: inputs });
    // intro.js payloads: hintclick(element, hint, index), hintclose(index).
    this._hints.on(
      "open",
      (e) => void this._callbacks.get("hintclick")?.call(this, e.hint.target, e.hint, e.index)
    );
    this._hints.on("dismiss", (e) => void this._callbacks.get("hintclose")?.call(this, e.index));
    this._hints.render();
    this._callbacks.get("hintsadded")?.call(this);
    return this;
  }

  render = () => this.addHints();

  showHint(index: number): this {
    this._hints?.show(index);
    return this;
  }

  showHints(): this {
    if (this._hints) {
      this._hints.hints.forEach((_, i) => this._hints!.show(i));
    } else {
      this.addHints();
    }
    return this;
  }

  hideHint(index: number): this {
    this._hints?.hide(index);
    // intro.js reports a hidden hint through onhintclose.
    this._callbacks.get("hintclose")?.call(this, index);
    return this;
  }

  hideHints(): this {
    this._hints?.hints.forEach((_, i) => this.hideHint(i));
    return this;
  }

  showHintDialog(index: number): this {
    this._hints?.open(index);
    return this;
  }

  /** Permanently hides a single hint (marker removed from the cycle). */
  removeHint(index: number): this {
    this._hints?.hide(index);
    return this;
  }

  removeHints(): this {
    this._hints?.destroy();
    this._hints = null;
    return this;
  }

  destroy = () => this.removeHints();

  onhintclick(callback: AnyCallback): this {
    this._callbacks.set("hintclick", callback);
    return this;
  }
  onHintClick = this.onhintclick;

  onhintclose(callback: AnyCallback): this {
    this._callbacks.set("hintclose", callback);
    return this;
  }
  onHintClose = this.onhintclose;

  onhintsadded(callback: AnyCallback): this {
    this._callbacks.set("hintsadded", callback);
    return this;
  }
  onHintsAdded = this.onhintsadded;
}

/* ------------------------------ entry point -------------------------------- */

let warned = false;

function warnOnce(): void {
  if (!warned) {
    warned = true;
    console.warn(
      "[tourkit/compat-introjs] Compatibility mode: consider migrating to createTour()/createHints()."
    );
  }
}

/** intro.js-style entry point: `introJs()`, `introJs.tour()`, `introJs.hint()`. */
export function introJs(elementOrSelector?: string | Element): CompatTour {
  warnOnce();
  return new CompatTour(elementOrSelector);
}

introJs.tour = (elementOrSelector?: string | Element): CompatTour => {
  warnOnce();
  return new CompatTour(elementOrSelector);
};

introJs.hint = (elementOrSelector?: string | Element): CompatHints => {
  warnOnce();
  return new CompatHints(elementOrSelector);
};

export default introJs;
