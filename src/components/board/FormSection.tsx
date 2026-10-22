import type { ReactNode } from "react";
import "./form-section.css";

/**
 * FormSection — one group of the board form, headed the way the board labels
 * its own blocks ("01 — FOUNDATION" then a hairline). Each numbered section
 * holds the inputs that fill that board page, so the form reads in the same
 * order as the kit.
 *
 * `onSelect` makes the heading a button that brings that page into the
 * preview; omit it for a section with no page (Brand) or a page that doesn't
 * exist yet. `active` marks the section whose page is on screen.
 */
export default function FormSection({
  index,
  title,
  active = false,
  onSelect,
  hint,
  children,
}: {
  /** The board page number ("01"); omit for the whole-kit section. */
  index?: string;
  title: string;
  active?: boolean;
  onSelect?: () => void;
  /** One quiet line under the heading (e.g. how the page gets created). */
  hint?: string;
  children?: ReactNode;
}) {
  const label = (
    <>
      {index && <span className="bb-form-section__index">{index} —</span>}
      <span>{title}</span>
    </>
  );

  return (
    <section className={`bb-form-section${active ? " is-active" : ""}`}>
      <div className="bb-form-section__head">
        {onSelect ? (
          <button
            type="button"
            className="bb-form-section__label bb-form-section__label--button"
            onClick={onSelect}
            aria-current={active ? "page" : undefined}
            title={active ? undefined : `Show ${title} in the preview`}
          >
            {label}
          </button>
        ) : (
          <span className="bb-form-section__label">{label}</span>
        )}
        <span className="bb-form-section__rule" aria-hidden="true" />
      </div>
      {hint && <p className="bb-form-section__hint">{hint}</p>}
      {children && <div className="bb-form-section__body">{children}</div>}
    </section>
  );
}
