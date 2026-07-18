"use client";

import { useCallback, useEffect, useRef } from "react";

export function useUnsavedDraft<T>({
  storageKey,
  value,
  dirty,
  onRestore,
}: {
  storageKey: string;
  value: T;
  dirty: boolean;
  onRestore: (draft: T) => void;
}) {
  const restored = useRef(false);
  const restoreRef = useRef(onRestore);

  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) restoreRef.current(JSON.parse(saved) as T);
    } catch {
      window.sessionStorage.removeItem(storageKey);
    } finally {
      restored.current = true;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!restored.current) return;
    if (!dirty) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  }, [dirty, storageKey, value]);

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  const clearDraft = useCallback(() => window.sessionStorage.removeItem(storageKey), [storageKey]);
  const confirmDiscard = useCallback(() => {
    if (!dirty || window.confirm("มีรายการที่ยังไม่ได้บันทึก ต้องการละทิ้งข้อมูลที่กำลังทำอยู่จริงหรือไม่?")) {
      clearDraft();
      return true;
    }
    return false;
  }, [clearDraft, dirty]);

  return { clearDraft, confirmDiscard };
}
