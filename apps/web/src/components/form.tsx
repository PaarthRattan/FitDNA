import type { ReactNode } from "react";
import { INPUT, LABEL } from "./ui";

/*
 * Form fields in the Dell '96 style: square inputs, Helvetica labels, Times hints.
 * Each field wires its hint and error to the input with aria-describedby, so screen
 * readers announce them, and marks the input invalid when there's an error.
 */

const HINT = "font-body text-xs text-[#333] leading-[1.35]";
const ERROR = "font-body text-xs text-primary font-bold";

function describedBy(id: string, hint?: ReactNode, error?: string) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function Notes({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className={HINT}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={ERROR}>
          {error}
        </p>
      )}
    </>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** Measurements: a text input with a decimal keypad, so "96,5" is allowed. */
  numeric?: boolean;
  suffix?: ReactNode;
}

export function TextField({ id, label, hint, error, defaultValue, required, maxLength, placeholder, numeric, suffix }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={id}
          type="text"
          inputMode={numeric ? "decimal" : undefined}
          autoComplete="off"
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={`${INPUT} ${numeric ? "w-28" : "w-full"}`}
        />
        {suffix}
      </div>
      <Notes id={id} hint={hint} error={error} />
    </div>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  defaultValue?: string;
  maxLength?: number;
  placeholder?: string;
}

export function TextAreaField({ id, label, hint, error, defaultValue, maxLength, placeholder }: TextAreaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={2}
        defaultValue={defaultValue}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${INPUT} w-full`}
      />
      <Notes id={id} hint={hint} error={error} />
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  placeholder?: string;
}

export function SelectField({ id, label, options, defaultValue, hint, error, required, placeholder }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${INPUT} w-full max-w-xs`}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Notes id={id} hint={hint} error={error} />
    </div>
  );
}

interface ChoiceGroupProps {
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string; hint?: string; swatch?: string }>;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}

/** A radio group: a fieldset with one bordered option per choice. */
export function ChoiceGroup({ name, legend, options, defaultValue, error, required }: ChoiceGroupProps) {
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className={`${LABEL} mb-1`}>
        {legend}
        {required && <span aria-hidden="true"> *</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex items-start gap-2 border border-ink bg-canvas px-2.5 py-1.5 cursor-pointer has-[:checked]:bg-sticker w-full sm:w-auto sm:max-w-[260px]"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={defaultValue === o.value}
              required={required}
              className="mt-0.5 accent-ink"
            />
            {o.swatch && <span aria-hidden="true" className={`w-3.5 h-3.5 border border-ink mt-0.5 shrink-0 ${o.swatch}`} />}
            <span className="flex flex-col">
              <span className="font-ui font-bold text-xs">{o.label}</span>
              {o.hint && <span className="font-body text-xs text-[#333] leading-tight">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className={ERROR}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** A message about the whole form, e.g. a save that failed. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border border-ink bg-tint-salmon px-3 py-2 font-body text-sm">
      {message}
    </p>
  );
}

const UNITS = [
  { value: "cm", label: "Centimetres" },
  { value: "in", label: "Inches" },
] as const;

/** Every measurement form has one unit choice; values are stored in cm. */
export function UnitChoice({ defaultValue = "cm", error }: { defaultValue?: string; error?: string }) {
  return <ChoiceGroup name="unit" legend="Units" options={UNITS} defaultValue={defaultValue} error={error} />;
}
