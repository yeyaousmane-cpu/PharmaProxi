import { ProGuard } from "@/components/security/pro-guard";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container-page pt-4"><ProGuard path="/medecin" /></div>
      {children}
    </>
  );
}
