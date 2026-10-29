"use client";
import { useEffect } from "react";
import { pushRecent, type RecentItem } from "./recent";

export function RecentTracker(props: Omit<RecentItem, "at">) {
  const { kind, id, name, phone, place, href } = props;
  useEffect(() => {
    pushRecent({ kind, id, name, phone, place, href });
  }, [kind, id, name, phone, place, href]);
  return null;
}
