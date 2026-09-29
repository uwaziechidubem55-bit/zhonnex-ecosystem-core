import { spawnSync } from "node:child_process";

/** Office-side caller. The calculation stays in the Resolve Rust program. */
export const RESOLVE_SOFTWARE = "Resolve";

export type ResolveMode = "sea" | "road" | "rail" | "air" | "orbit";

export interface ResolveInput {
  mode: ResolveMode;
  contractNominal: boolean;
  positionKnown: boolean;
  xM: number;
  yM: number;
  zM: number;
  speedMps: number;
  headingDeg: number;
  destXM: number;
  destYM: number;
  destZM: number;
  maxSpeedMps: number;
  lengthM: number;
  depthM: number;
  draftM: number;
  windFromDeg: number;
  windMps: number;
  currentMps: number;
  stopA: number;
  stopB: number;
  stopC: number;
  mu: number;
  eta: number;
  reactionS: number;
  permittedSpeedMps: number;
  authorityM: number;
  altitudeM: number;
  airspeedMps: number;
  angleOfAttackDeg: number;
  stallAngleDeg: number;
  propellantKg: number;
  dpRequested: boolean;
  dpEngaged: boolean;
  dpXM: number;
  dpYM: number;
  dpHeadingDeg: number;
  dpRadiusM: number;
  yawRateDps: number;
  rudderIntegral: number;
  dtS: number;
  contacts: Array<{ bearingDeg: number; rangeM: number; closingMps: number; confidence: number }>;
  autopilotAccepts: boolean;
  rudderAnswers: boolean;
  emergencySteeringAnswers: boolean;
  governorAccepts: boolean;
  propellersAnswering: number;
  thrusterAnswers: boolean;
  dpAccepts: boolean;
  brakeAnswers: boolean;
  emergencyBrakeAnswers: boolean;
  roadSteeringAnswers: boolean;
  sidePathClear: boolean;
  flightAccepts: boolean;
  reactionWheelsAnswer: boolean;
  anchorAvailable: boolean;
  depthAllowsAnchor: boolean;
}

export interface ResolveDecision {
  software: string;
  kind: string;
  ladderStep: number;
  headingDeg: number;
  speedMps: number;
  rudderDeg: number;
  propellerFraction: number;
  pitchFraction: number;
  portFraction: number;
  starboardFraction: number;
  altitudeM: number;
  deltaVMps: number;
  dpErrorM: number;
  headingErrorDeg: number;
  onStation: boolean;
  rudderIntegral: number;
  reason: string;
}

export function encodeInput(input: ResolveInput): string {
  const lines = [
    `mode ${input.mode}`,
    `contract_nominal ${input.contractNominal}`,
    `position_known ${input.positionKnown}`,
    `x ${input.xM}`,
    `y ${input.yM}`,
    `z ${input.zM}`,
    `speed ${input.speedMps}`,
    `heading ${input.headingDeg}`,
    `dest_x ${input.destXM}`,
    `dest_y ${input.destYM}`,
    `dest_z ${input.destZM}`,
    `max_speed ${input.maxSpeedMps}`,
    `length ${input.lengthM}`,
    `depth ${input.depthM}`,
    `draft ${input.draftM}`,
    `wind_from ${input.windFromDeg}`,
    `wind ${input.windMps}`,
    `current ${input.currentMps}`,
    `stop_a ${input.stopA}`,
    `stop_b ${input.stopB}`,
    `stop_c ${input.stopC}`,
    `mu ${input.mu}`,
    `eta ${input.eta}`,
    `reaction_s ${input.reactionS}`,
    `permitted_speed ${input.permittedSpeedMps}`,
    `authority_m ${input.authorityM}`,
    `altitude ${input.altitudeM}`,
    `airspeed ${input.airspeedMps}`,
    `aoa ${input.angleOfAttackDeg}`,
    `stall_angle ${input.stallAngleDeg}`,
    `propellant ${input.propellantKg}`,
    `dp_requested ${input.dpRequested}`,
    `dp_engaged ${input.dpEngaged}`,
    `dp_x ${input.dpXM}`,
    `dp_y ${input.dpYM}`,
    `dp_heading ${input.dpHeadingDeg}`,
    `dp_radius ${input.dpRadiusM}`,
    `yaw_rate ${input.yawRateDps}`,
    `integral ${input.rudderIntegral}`,
    `dt ${input.dtS}`,
    `autopilot ${input.autopilotAccepts}`,
    `rudder ${input.rudderAnswers}`,
    `emergency_steering ${input.emergencySteeringAnswers}`,
    `governor ${input.governorAccepts}`,
    `propellers ${input.propellersAnswering}`,
    `thruster ${input.thrusterAnswers}`,
    `dp_accepts ${input.dpAccepts}`,
    `brake ${input.brakeAnswers}`,
    `emergency_brake ${input.emergencyBrakeAnswers}`,
    `road_steering ${input.roadSteeringAnswers}`,
    `side_clear ${input.sidePathClear}`,
    `flight ${input.flightAccepts}`,
    `wheels ${input.reactionWheelsAnswer}`,
    `anchor ${input.anchorAvailable}`,
    `anchor_depth ${input.depthAllowsAnchor}`,
  ];
  for (const contact of input.contacts) {
    lines.push(
      `contact ${contact.bearingDeg} ${contact.rangeM} ${contact.closingMps} ${contact.confidence}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function parseDecision(text: string): ResolveDecision {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const space = trimmed.indexOf(" ");
    if (space <= 0) {
      continue;
    }
    values.set(trimmed.slice(0, space), trimmed.slice(space + 1));
  }
  const num = (key: string): number => Number(values.get(key) ?? "0");
  return {
    software: values.get("software") ?? "",
    kind: values.get("kind") ?? "",
    ladderStep: num("ladder_step"),
    headingDeg: num("heading"),
    speedMps: num("speed"),
    rudderDeg: num("rudder"),
    propellerFraction: num("propeller"),
    pitchFraction: num("pitch"),
    portFraction: num("port"),
    starboardFraction: num("starboard"),
    altitudeM: num("altitude"),
    deltaVMps: num("delta_v"),
    dpErrorM: num("dp_error"),
    headingErrorDeg: num("heading_error"),
    onStation: values.get("on_station") === "true",
    rudderIntegral: num("integral"),
    reason: values.get("reason") ?? "",
  };
}

/** Runs the compiled Resolve binary. Does not recalculate in TypeScript. */
export function runResolve(binaryPath: string, input: ResolveInput): ResolveDecision {
  const result = spawnSync(binaryPath, { input: encodeInput(input), encoding: "utf8" });
  if (result.error) {
    throw new Error(`RESOLVE_BINARY_MISSING: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`RESOLVE_BINARY_FAILED: ${result.stderr}`);
  }
  return parseDecision(result.stdout);
}