"use client";

import { useRef, useState } from "react";

import type { FilterGroup } from "@/types/commerce";
import { FilterIcon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { FilterPanel } from "./filter-panel";

/**
 * The filters on a small screen, where there is no room for a sidebar.
 *
 * The same `FilterPanel` the desktop uses, moved into a drawer. Selecting a
 * filter navigates immediately and the results behind update, so there is no
 * apply step to forget: the button at the bottom only dismisses the panel.
 */
export function FilterDrawer({
  groups,
  activeCount,
}: {
  groups: readonly FilterGroup[];
  /** Shown on the trigger so the count is visible with the drawer shut. */
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FilterIcon className="size-4" />
        Filters
        {activeCount > 0 ? (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-on-brand">
            <span className="sr-only">, </span>
            {activeCount}
            <span className="sr-only"> applied</span>
          </span>
        ) : null}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        side="left"
        returnFocusRef={triggerRef}
        footer={
          <Button className="w-full" onClick={() => setOpen(false)}>
            Show results
          </Button>
        }
      >
        <FilterPanel groups={groups} className="px-5 py-6" />
      </Drawer>
    </>
  );
}
