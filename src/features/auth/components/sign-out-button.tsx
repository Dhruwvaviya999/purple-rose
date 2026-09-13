import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Sign out control.
 *
 * A plain form posting to a Server Action, so it is a Server Component with no
 * client JavaScript, and it still works if scripting is unavailable. Next.js
 * applies its Origin check to the action, so the button cannot be triggered
 * from another site.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}
