import SignInPage, { type SocialProvider } from "./signin-form";
import { getEnv } from "@/core/config/env";

/**
 * Email/password sign-in, plus any social providers this deployment actually has
 * credentials for. `src/core/config/env.ts` marks all four social vars
 * `optional`, so the buttons are resolved on the server and only the working
 * ones are passed down — otherwise an unconfigured provider renders a button
 * that fails on click with no feedback.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const env = getEnv();

  const socialProviders: SocialProvider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) socialProviders.push("google");
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) socialProviders.push("facebook");

  // The deep link the user was trying to reach before being bounced here. It is
  // passed through untouched and validated on the server, which is the only side
  // that knows which orgs this user may be sent to.
  const sp = await searchParams;
  const nextPath = typeof sp.next === "string" ? sp.next : null;

  return <SignInPage socialProviders={socialProviders} nextPath={nextPath} />;
}
