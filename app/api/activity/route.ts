import { handle } from "@/lib/api";
import { getActivity, getAgentsAndRuns } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

/** Recent activity as plain sentences, or `events: null` when Paperclip has no activity log for us. */
export function GET() {
  return handle(async () => {
    const { agents } = await getAgentsAndRuns();
    const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    return { events: await getActivity(names, 15) };
  });
}
