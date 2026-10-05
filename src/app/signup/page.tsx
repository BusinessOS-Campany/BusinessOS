import SignupForm, { type SocialProvider } from "./signup-form";
import { getEnv } from "@/core/config/env";

interface PageProps {
  searchParams: Promise<{ template?: string }>;
}

/**
 * Public self-registration. The credential path is handled by
 * `POST /api/v1/public/signup`, which creates the user, the organization and the
 * owner member in one transaction.
 *
 * Social providers are read here on the server and only the ones with real
 * credentials are passed down, so the form never renders a button that is
 * guaranteed to fail. Facebook, for instance, is `optional` in the env schema,
 * so an unconfigured deployment used to show a button that 403'd on click.
 */
export default async function SignupPage({ searchParams }: PageProps) {
  const { template } = await searchParams;
  const env = getEnv();

  const socialProviders: SocialProvider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) socialProviders.push("google");
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) socialProviders.push("facebook");

  return <SignupForm template={template ?? ""} socialProviders={socialProviders} />;
}
