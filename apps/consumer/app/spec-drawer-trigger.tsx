"use client";

import { SpecDrawerTrigger } from "@autoverse/ui";
import { createContext, useContext } from "react";

// The card's "Technical data ›" row (spec §5.7, §5.8). The card is a server component, so this
// client component sits in its slot and asks the showroom shell (ShowroomExperience) to open the
// drawer for its trim. Only the trim id and the label cross the server/client boundary.

export const SpecDrawerContext = createContext<{
  open: (trimId: string, trigger: HTMLElement | null) => void;
} | null>(null);

export function TechnicalDataButton({
  trimId,
  label,
  dir,
}: {
  trimId: string;
  label: string;
  dir: "ltr" | "rtl";
}) {
  const drawer = useContext(SpecDrawerContext);
  return (
    <SpecDrawerTrigger
      label={label}
      dir={dir}
      disabled={!drawer}
      onClick={(trigger) => drawer?.open(trimId, trigger)}
    />
  );
}
