import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

export const SESSION_COOKIE = "ph_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const secretKey = process.env.AUTH_SECRET ?? "insecure-dev-secret-change-me";
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function decrypt(
  session: string | undefined = ""
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}