/**
 * Weyos shared contract — TypeScript view.
 *
 * JSON Schemas in ../schemas/ are the SOURCE OF TRUTH. Types here are generated
 * from them; never edit this file by hand.
 *
 * To regenerate:
 *   npm run generate -w @weyos/shared-schema
 */

export const SCHEMA_VERSION = 1 as const;

export type {
  SignalSnapshot,
  Decision,
  DecisionEnvelope,
  LabValue,
} from "./generated";
