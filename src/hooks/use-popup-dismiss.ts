"use client";

import { useEffect } from "react";

export function usePopupDismiss(isOpen: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [isOpen, onDismiss]);
}
