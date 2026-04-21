import { requireApiKey } from "@/lib/auth/api-key";
import { deleteApiKey } from "@/lib/db/api-keys";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const auth = await requireApiKey();
  if (!auth.ok) return auth.response;

  const { keyId } = await params;
  const deleted = await deleteApiKey(keyId, auth.userId);

  if (!deleted) {
    return Response.json({ error: "Key not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
