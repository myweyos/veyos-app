"use strict";
/**
 * Weyos shared contract — TypeScript view.
 *
 * The JSON Schema files in ../schemas are the SOURCE OF TRUTH. These types are the
 * TypeScript projection of them and must be regenerated, not hand-edited, when the
 * schema changes:
 *
 *   npm run generate   # json-schema-to-typescript ../schemas/*.json -> ./src/generated.ts
 *
 * The hand-written types below exist so the repo compiles before the generator is wired.
 * Delete them the moment generation is in place (tracked: VEY-SCHEMA-GEN).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = void 0;
exports.SCHEMA_VERSION = 1;
