import coefficients from "./stats-coefficients.json";

/**
 * Body measurements estimated from height alone (and weight, age and sex when given):
 * a per-sex linear regression fitted on the ANSUR II anthropometric survey. The scan
 * service uses the same model as its prior and as the baseline the scan must beat in
 * the validation study. If the scan fails that study, this is what ships instead, as a
 * pre-fill the user checks with a tape.
 *
 * TypeScript twin of services/scan/app/stats/prior.py, reading a copy of its
 * coefficients.json (a test checks the copy is identical and the two agree).
 * The ANSUR II source states no licence: confirm it before real users see these numbers.
 */

export interface StatsInput {
  heightCm: number;
  weightKg?: number | null;
  age?: number | null;
  sex?: "male" | "female" | null;
}

export interface StatsEstimate {
  valueCm: number;
  sdCm: number;
}

type Model = { intercept: number; coef: number[]; sd: number };
type Coefficients = {
  inputs: Record<string, string[]>;
  models: Record<string, Record<string, Record<string, Model>>>;
  shoulder_arc_from_biacromial?: { intercept: number; slope: number; sd: number };
};

const C = coefficients as unknown as Coefficients;

const round1 = (n: number) => Math.round(n * 10) / 10;

function inputSet(weight: number | null, age: number | null): string {
  if (weight !== null && age !== null) return "hwa";
  if (weight !== null) return "hw";
  if (age !== null) return "ha";
  return "h";
}

/** chest, shoulder (across the back), arm: the fields the fit engine uses. */
export function statsEstimate(input: StatsInput): Record<"chest" | "shoulder" | "arm", StatsEstimate> {
  const weight = input.weightKg ?? null;
  const age = input.age ?? null;
  const group = input.sex === "male" || input.sex === "female" ? input.sex : "any";
  const set = inputSet(weight, age);
  const values: Record<string, number | null> = { height: input.heightCm, weight, age };
  const x = C.inputs[set].map((name) => values[name] as number);
  const predict = (target: string): StatsEstimate => {
    const m = C.models[group][set][target];
    return { valueCm: m.intercept + m.coef.reduce((sum, b, i) => sum + b * x[i], 0), sdCm: m.sd };
  };

  const biacromial = predict("shoulder_biacromial");
  const arc = C.shoulder_arc_from_biacromial;
  if (!arc) throw new Error("stats-coefficients.json has no shoulder arc mapping");
  const shoulderSd = Math.hypot(arc.slope * biacromial.sdCm, arc.sd);
  const chest = predict("chest");
  const arm = predict("arm");
  return {
    chest: { valueCm: round1(chest.valueCm), sdCm: chest.sdCm },
    // The Python twin rounds the breadth before mapping it; so does this, to agree to 0.1 cm.
    shoulder: { valueCm: round1(arc.intercept + arc.slope * round1(biacromial.valueCm)), sdCm: Math.round(shoulderSd * 1000) / 1000 },
    arm: { valueCm: round1(arm.valueCm), sdCm: arm.sdCm },
  };
}
