"use client";
import { Button } from "@/components/ui/button";
import { isStaleDeploy, useStaleDeployReload } from "@/lib/stale-deploy";
import { useT } from "@/i18n/client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useStaleDeployReload(error);
  const t = useT();
  const stale = isStaleDeploy(error);
  return (
    <div className="container-page py-16 text-center" role="alert">
      <h1 className="text-2xl font-bold">{stale ? t("err.stale_title") : t("err.title")}</h1>
      <p className="mt-2 text-muted-foreground">{stale ? t("err.stale_text") : t("err.text")}</p>
      <Button className="mt-6" onClick={() => (stale ? window.location.reload() : reset())}>{stale ? t("err.reload") : t("state.retry")}</Button>
    </div>
  );
}
