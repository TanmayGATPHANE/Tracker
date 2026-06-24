// Client version. The version number comes from package.json (read at
// build time by vite.config.js). The build SHA comes from VITE_GIT_SHA,
// which Vercel sets to ^VERCEL_GIT_COMMIT_SHA in the project env.

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0"
export const BUILD_SHA   = import.meta.env.VITE_GIT_SHA    || "dev"
