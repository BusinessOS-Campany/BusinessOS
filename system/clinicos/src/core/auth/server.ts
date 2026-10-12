import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "co_session_token";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 5,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      roleId: {
        type: "string",
        required: true,
        defaultValue: "",
      },
      nameAr: {
        type: "string",
        required: false,
      },
      nameEn: {
        type: "string",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      clinicId: {
        type: "string",
        required: false,
      },
      currentClinicId: {
        type: "string",
        required: false,
      },
    },
  },
  advanced: {
    cookies: {
      session_token: { name: "co_session_token" },
    },
  },
  plugins: [
    username({
      displayUsername: false,
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
  ],
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});