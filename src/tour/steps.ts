import { resolveWaitForTarget } from "../core/options";
import type {
  AdvanceOn,
  Placement,
  Step,
  StepInput,
  TourOptions,
  WaitForTargetOptions,
} from "../core/types";
import { isPlacement } from "../geometry/placement";
import { isElementHidden } from "../ui/dom";

/** Reads a placement attribute, warning instead of silently centering. */
function readPlacement(el: Element, attr: string): Placement | undefined {
  const raw = el.getAttribute(attr);
  if (raw === null) return undefined;
  if (isPlacement(raw)) return raw;
  console.warn(`[tourkit] unknown ${attr}="${raw}"; falling back to the tour default.`);
  return undefined;
}

/** Applies tour-level defaults to raw step inputs. */
export function normalizeSteps(inputs: StepInput[], options: TourOptions): Step[] {
  return (
    inputs
      // A step needs either text content or a custom renderer (step- or tour-level).
      .filter((input) => Boolean(input.content) || Boolean(input.renderStep ?? options.renderStep))
      .map((input) => ({
        ...input,
        placement: input.placement ?? (input.target ? options.placement : "center"),
        disableInteraction: input.disableInteraction ?? options.disableInteraction,
        lockScroll: input.lockScroll ?? options.lockScroll,
        waitForTarget: resolveWaitForTarget(options.waitForTarget, input.waitForTarget),
      }))
  );
}

export interface FromDataAttributesOptions {
  /** Only include elements whose `<attribute>-group` equals this value. */
  group?: string;
  /**
   * Base attribute name, `data-tour` by default. Every modifier derives from
   * it (`data-tour-title`, `-step`, ...), so a page that already uses
   * `data-tour` for something else can scan `data-tk-step` instead.
   */
  attribute?: string;
}

export const DEFAULT_DATA_ATTRIBUTE = "data-tour";

/**
 * Validates a custom base attribute. A name without the `data-` prefix would
 * produce invalid markup and a selector that silently matches nothing.
 */
export function resolveDataAttribute(attribute?: string): string {
  if (attribute === undefined) return DEFAULT_DATA_ATTRIBUTE;
  if (/^data-[a-z0-9-]*[a-z0-9]$/.test(attribute)) return attribute;

  console.warn(
    `[tourkit] invalid data attribute "${attribute}"; expected a lowercase name starting with "data-". Using "${DEFAULT_DATA_ATTRIBUTE}".`
  );
  return DEFAULT_DATA_ATTRIBUTE;
}

/** The full attribute set derived from one base name. */
interface AttributeNames {
  content: string;
  title: string;
  step: string;
  group: string;
  placement: string;
  noInteraction: string;
  lockScroll: string;
  advanceOn: string;
  wait: string;
  highlight: string;
}

function attributeNames(base: string): AttributeNames {
  return {
    content: base,
    title: `${base}-title`,
    step: `${base}-step`,
    group: `${base}-group`,
    placement: `${base}-placement`,
    noInteraction: `${base}-no-interaction`,
    lockScroll: `${base}-lock-scroll`,
    advanceOn: `${base}-advance-on`,
    wait: `${base}-wait`,
    highlight: `${base}-highlight`,
  };
}

/**
 * `-advance-on` — empty or "click" for the default event, any other value is
 * used as the event name.
 */
function readAdvanceOn(el: Element, attr: string): AdvanceOn | undefined {
  const raw = el.getAttribute(attr);
  if (raw === null) return undefined;
  return raw === "" || raw === "click" ? true : { event: raw };
}

/** `-wait` — "false"/"off" disables waiting, a number sets the timeout. */
function readWait(el: Element, attr: string): Partial<WaitForTargetOptions> | false | undefined {
  const raw = el.getAttribute(attr);
  if (raw === null) return undefined;
  if (raw === "false" || raw === "off") return false;
  if (raw === "") return {};

  const timeoutMs = Number(raw);
  if (Number.isFinite(timeoutMs) && timeoutMs >= 0) return { timeoutMs };
  console.warn(`[tourkit] unknown ${attr}="${raw}"; using the tour default.`);
  return undefined;
}

/** `-highlight` — comma-separated selectors for extra cutouts. */
function readHighlight(el: Element, attr: string): string[] | undefined {
  const raw = el.getAttribute(attr);
  if (raw === null) return undefined;
  const selectors = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return selectors.length ? selectors : undefined;
}

/**
 * Collects steps declared in HTML via `data-tour*` attributes.
 *
 * Elements with an explicit `data-tour-step="N"` claim slot N (1-based);
 * elements without a number fill the remaining gaps in document order.
 * Hidden elements (`display: none`, `visibility: hidden`) are skipped.
 *
 * Supported attributes: `data-tour` (content), `-title`, `-step`, `-group`,
 * `-placement`, `-no-interaction`, `-lock-scroll`, `-highlight` (extra
 * cutouts), `-wait` (async target policy) and `-advance-on` (auto-next).
 * The base name is configurable via `options.attribute`.
 */
export function fromDataAttributes(
  root?: ParentNode,
  options: FromDataAttributesOptions = {}
): StepInput[] {
  if (root === undefined && typeof document === "undefined") {
    console.warn("[tourkit] fromDataAttributes() found no document; returning no steps.");
    return [];
  }

  const attr = attributeNames(resolveDataAttribute(options.attribute));
  const elements = Array.from(
    (root ?? document).querySelectorAll<HTMLElement>(`[${attr.content}]`)
  );

  const numbered = new Map<number, StepInput>();
  const unnumbered: StepInput[] = [];

  for (const el of elements) {
    if (options.group !== undefined && el.getAttribute(attr.group) !== options.group) continue;
    if (isElementHidden(el)) continue;

    const content = el.getAttribute(attr.content);
    if (!content) continue;

    const step: StepInput = {
      target: el,
      content,
      title: el.getAttribute(attr.title) ?? undefined,
      placement: readPlacement(el, attr.placement),
      disableInteraction: el.hasAttribute(attr.noInteraction) ? true : undefined,
      lockScroll: el.hasAttribute(attr.lockScroll) ? true : undefined,
      highlight: readHighlight(el, attr.highlight),
      waitForTarget: readWait(el, attr.wait),
      advanceOn: readAdvanceOn(el, attr.advanceOn),
    };

    const slot = parseInt(el.getAttribute(attr.step) ?? "", 10);
    if (Number.isFinite(slot) && slot > 0) {
      if (numbered.has(slot - 1)) {
        console.warn(`[tourkit] duplicate ${attr.step}="${slot}"; the later element wins.`);
      }
      numbered.set(slot - 1, step);
    } else {
      unnumbered.push(step);
    }
  }

  const totalSlots = numbered.size + unnumbered.length;
  const maxNumbered = numbered.size ? Math.max(...numbered.keys()) + 1 : 0;
  const result: StepInput[] = [];

  // Fill slots: explicit numbers stay put, the rest pour into the gaps.
  for (
    let i = 0;
    i < Math.max(totalSlots, maxNumbered) && (numbered.size || unnumbered.length);
    i++
  ) {
    const explicit = numbered.get(i);
    if (explicit) {
      numbered.delete(i);
      result.push(explicit);
    } else if (unnumbered.length) {
      result.push(unnumbered.shift()!);
    }
  }

  // Explicit numbers beyond the contiguous range keep their relative order.
  const leftovers = [...numbered.entries()].sort(([a], [b]) => a - b).map(([, step]) => step);
  result.push(...leftovers);

  return result;
}
