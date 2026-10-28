import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type PlatformSettings = {
  delivery_enabled: boolean; orders_enabled: boolean; default_delivery_fee_xof: number; confirmation_ttl_minutes: number;
  reservation_ttl_minutes: number; stock_fresh_hours: number; stock_stale_hours: number; max_items_per_order: number; max_quantity_per_item: number;
  directory_fresh_days: number; directory_stale_days: number; emergency_numbers: string;
};

const DEFAULTS: PlatformSettings = {
  delivery_enabled: false, orders_enabled: true, default_delivery_fee_xof: 1000, confirmation_ttl_minutes: 60,
  reservation_ttl_minutes: 240, stock_fresh_hours: 24, stock_stale_hours: 72, max_items_per_order: 10, max_quantity_per_item: 20,
  directory_fresh_days: 90, directory_stale_days: 180, emergency_numbers: "",
};

export const getSettings = cache(async (): Promise<PlatformSettings> => {
  if (!isSupabaseConfigured()) return DEFAULTS;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const s = { ...DEFAULTS } as Record<string, unknown>;
  for (const row of data ?? []) s[row.key] = row.value;
  return s as PlatformSettings;
});
