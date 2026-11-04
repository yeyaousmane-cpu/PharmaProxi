import "server-only";
import { cookies } from "next/headers";
export async function isSimpleMode() { return (await cookies()).get("pp_simple")?.value === "1"; }
