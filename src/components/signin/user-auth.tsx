"use client";

import Link from "next/link";
import { useSession } from "@/core/auth/client";

/** Google-style initial avatar palette (name-hashed so each user is stable). */
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-600",
  "bg-green-600",
  "bg-teal-600",
  "bg-cyan-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-violet-600",
  "bg-purple-600",
  "bg-pink-600",
];

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialFor(name: string, email: string): string {
  for (const src of [name, email]) {
    const text = src.trim();
    if (!text) continue;
    const first = [...text][0];
    if (first) return first.toUpperCase();
  }
  return "؟";
}

export default function UserAuth({
  children,
  size = "sm",
  href = "/my-apps",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  const { data: session, isPending } = useSession();

  // While the session is loading, hide the auth controls entirely so the
  // signed-in swap (avatar in, sign-in/sign-up out) never flickers.
  if (isPending) return null;

  const user = session?.user;
  if (!user) return <>{children}</>;

  const sizeCls = size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-8 w-8";
  const textCls = size === "lg" ? "text-lg" : size === "md" ? "text-base" : "text-sm";

  return (
    <Link
      href={href}
      title={user.name || "حسابي"}
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${sizeCls} ring-2 ring-white/25 transition-all duration-300 hover:scale-105 hover:ring-primary/80`}
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- user avatar is an uploaded URL of unknown dimensions
        <img src={user.image} alt={user.name || ""} className="h-full w-full object-cover" />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-bold text-white ${textCls} ${
            AVATAR_COLORS[hashString(user.name ?? user.email ?? "؟") % AVATAR_COLORS.length]
          }`}
        >
          {initialFor(user.name ?? "", user.email ?? "")}
        </span>
      )}
    </Link>
  );
}