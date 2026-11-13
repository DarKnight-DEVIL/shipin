// Static-asset module declarations for `next/image` imports.
//
// Next generates `next-env.d.ts` with a reference to
// `next/image-types/global`, but that file is gitignored and only exists after
// a local `next dev`/`next build`. CI runs `tsc --noEmit` on a fresh checkout,
// so without this reference `import texture from './earth-texture.webp'`
// fails with TS2307 ("Cannot find module"). Committing the reference keeps the
// typecheck independent of build artifacts.
/// <reference types="next/image-types/global" />
