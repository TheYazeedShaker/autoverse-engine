"use client";

import { CompareToggle } from "@autoverse/ui";
import { createContext, useContext } from "react";

// The card's Compare checkbox (spec §5.7, §5.9). The card is a server component, so this client
// component sits in its compare slot and reads the shared selection from the showroom shell
// (ShowroomExperience). Only the trim id and the strings cross the server/client boundary.

export interface CompareApi {
  selected: readonly string[];
  toggle: (trimId: string, on: boolean) => void;
  atLimit: boolean;
}

export const CompareContext = createContext<CompareApi | null>(null);

export function CompareCheckbox({
  trimId,
  label,
  limitNote,
}: {
  trimId: string;
  label: string;
  limitNote: string;
}) {
  const compare = useContext(CompareContext);
  return (
    <CompareToggle
      label={label}
      checked={compare?.selected.includes(trimId) ?? false}
      atLimit={compare ? compare.atLimit : true}
      limitNote={limitNote}
      value={trimId}
      onCheckedChange={(on) => compare?.toggle(trimId, on)}
    />
  );
}
