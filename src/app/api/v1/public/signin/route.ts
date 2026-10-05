import { z } from "zod";
import { ApiError, checkSessionRateLimit, ok, withRoute } from "@/core/http/api";
import { auth } from "@/core/auth/server";
import { internalAuthEmail, resolveIdentifier } from "@/core/auth/identifier";

/**
 * Sign in with an email address OR a phone number.
 *
 * The browser form cannot simply hand the typed value to
 * `authClient.signIn.email`, because `better-auth` looks accounts up by email
 * and a phone-only account is stored under a deterministic internal address
 * (`p967…@phone.bos.local`). Resolving that here keeps the internal scheme on
 * the server: the client posts the same thing it would have posted before and
 * never learns the address exists.
 *
 * The session cookie is minted by `auth.api.signInEmail` and copied onto this
 * response, so a phone sign-in produces exactly the same session as an email
 * one and the rest of the app is unaware of the difference.
 */

const signinSchema = z.object({
  identifier: z.string().min(3).max(120),
  countryCode: z.string().max(2).nullish(),
  password: z.string().min(1).max(128),
  // Where the user asked to land before signing in. Untrusted: validated by
  // `safeNext` below, which accepts only an internal path inside an org the
  // user actually belongs to.
  next: z.string().max(512).nullish(),
});

/** Attempts allowed per IP inside the window. Deliberately tight: a login form
 *  is the one place where unlimited guessing is worth blocking. */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export const POST = withRoute("public.signin", async (request) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";

  const limit = checkSessionRateLimit(`signin:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "محاولات كثيرة. حاول مرة أخرى بعد قليل",
      "Too many sign-in attempts. Try again shortly.",
      { retryAfterMs: limit.resetMs },
    );
  }

  const body = signinSchema.parse(await request.json().catch(() => null));

  const resolved = resolveIdentifier(body.identifier, body.countryCode);
  if ("error" in resolved) {
    // Deliberately identical to a wrong password: the response must not reveal
    // whether the identifier exists.
    throw ApiError.unauthorized("Incorrect email/phone or password");
  }

  const authEmail =
    resolved.kind === "email" ? resolved.email! : internalAuthEmail(resolved.phone!, resolved.countryCode);

  const authResponse = await auth.api.signInEmail({
    body: { email: authEmail, password: body.password },
    asResponse: true,
  });

  if (!authResponse.ok) {
    throw ApiError.unauthorized("Incorrect email/phone or password");
  }

  // The destination is decided by /auth/landing, which can read the caller's
  // memberships. Returning a fixed path here would either re-introduce the
  // cookie round trip or hardcode a target the server cannot justify.
  const result = ok({ redirectTo: "/auth/landing" });
  for (const cookie of authResponse.headers.getSetCookie()) {
    result.headers.append("set-cookie", cookie);
  }
  return result;
});
