/**
 * Minimal type shim for `@jscad/stl-serializer`, which ships as CommonJS
 * without a `.d.ts`. Only the surface this project touches is declared — if
 * more of the serializer is needed later, expand this shim rather than
 * reaching for `any`.
 */
declare module "@jscad/stl-serializer" {
  import type { Geom3 } from "@jscad/modeling/src/geometries/types";

  export interface StlSerializeOptions {
    /** Default `true`. When `true`, the return value is an array of
     * `ArrayBuffer`s suitable for `new Blob(...)`; when `false`, the return
     * value is an array with a single ASCII-STL string. */
    binary?: boolean;
    statusCallback?: ((progress: { progress: number }) => void) | null;
  }

  export const mimeType: string;

  export function serialize(
    options: StlSerializeOptions & { binary: false },
    ...objects: Geom3[]
  ): string[];
  export function serialize(options: StlSerializeOptions, ...objects: Geom3[]): ArrayBuffer[];

  const defaultExport: {
    mimeType: string;
    serialize: typeof serialize;
  };
  export default defaultExport;
}
