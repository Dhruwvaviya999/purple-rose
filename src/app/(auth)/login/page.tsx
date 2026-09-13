import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  defaultDestinationForRole,
  safeRedirectPath,
} from "@/lib/auth/redirect";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Purple Rose with your phone number and a one-time code.",
  robots: { index: false, follow: false },
};

/**
 * Sign-in page. A Server Component: it decides whether the visitor needs to
 * sign in at all, then hands the interactive part to a client component.
 *
 * Someone already signed in is sent on rather than shown the form again.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const requested = Array.isArray(next) ? next[0] : next;

  // Checked here and again inside the action. This one only decides where an
  // already-authenticated visitor lands; it is not the security boundary.
  const destination = safeRedirectPath(requested);

  const user = await getCurrentUser();

  if (user) {
    redirect((destination ?? defaultDestinationForRole(user.role)) as Route);
  }

  return (
    <Card variant="raised" padding="lg" className="w-full max-w-md">
      <LoginForm next={destination ?? undefined} />
    </Card>
  );
}
