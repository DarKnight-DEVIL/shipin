/**
 * Async-only entry point for the landing-page auth check.
 *
 * `LandingShell` and `StickyMobileCTA` only need to know whether a visitor is
 * signed in, and most visitors there are anonymous, so the auth SDK is loaded
 * after the page is interactive instead of with it.
 *
 * They import this module with a single dynamic `import()` rather than
 * importing `firebase/auth` and `@/lib/firebase` separately: those two modules
 * are also imported statically by the signed-in routes, and two dynamic edges
 * into modules the static graph already owns made the bundler hoist the shared
 * Firebase auth chunk into the initial JavaScript of every route.
 */
export { onAuthStateChanged } from "firebase/auth";
export { auth } from "@/lib/firebase";
