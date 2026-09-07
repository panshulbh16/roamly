import { z } from "zod";
import {
  body,
  db,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
  ApiError,
} from "@/lib/server/context";
import {
  historyPage,
  findSearch,
  deleteSearch,
} from "@/lib/history/repository";
export async function GET(r: Request) {
  try {
    const u = await identity();
    const params = new URL(r.url).searchParams;
    const id = params.get("id");
    if (id) {
      if (!z.string().uuid().safeParse(id).success)
        throw new ApiError(400, "This history link is invalid.");
      const entry = await findSearch(db(), u.id, id);
      if (!entry)
        throw new ApiError(404, "This search was not found in your history.");
      return Response.json({ entry }, { headers: privateHeaders });
    }
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      throw new ApiError(400, "Invalid history page.");
    return Response.json(await historyPage(db(), u.id, offset), {
      headers: privateHeaders,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    const parsed = z.object({ id: z.string().uuid() }).safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400, "Choose a search to delete.");
    await deleteSearch(db(), u.id, parsed.data.id);
    return Response.json({ deleted: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
