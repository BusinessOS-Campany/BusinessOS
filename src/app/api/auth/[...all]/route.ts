import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/core/auth/server";

// NOTE: intentionally NOT wrapped in withRoute — Better Auth manages its own
// response contract (cookies, redirects, its own error JSON).
export const { GET, POST } = toNextJsHandler(auth);
