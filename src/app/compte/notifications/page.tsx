import Link from "next/link";
import { BellOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markAllNotificationsRead } from "@/app/actions/account";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const s = await requireUser("/compte/notifications");
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }).limit(100);
  return (
    <div className="container-page max-w-3xl py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {s.unread > 0 && <form action={markAllNotificationsRead}><button className="text-sm font-semibold text-primary underline">Tout marquer comme lu</button></form>}
      </div>
      {!data?.length ? (
        <div className="mt-6 rounded-xl border border-dashed bg-white p-8 text-center"><BellOff className="mx-auto size-8 text-muted-foreground" aria-hidden /><p className="mt-2">Aucune notification.</p></div>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border bg-white">
          {data.map((n) => (
            <li key={n.id} className={cn("p-4", !n.read_at && "bg-accent/50")}>
              <p className="font-semibold">{!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-mali-red" aria-label="Non lue" />}{n.title}</p>
              {n.body && <p className="text-sm">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}{n.link ? <> · <Link prefetch={false} href={n.link} className="text-primary underline">Ouvrir</Link></> : null}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
