import {
  MAX_RETRIAGE_CAS_ATTEMPTS,
  normalizeRetriageReasons,
  type RetriageReason,
} from "./mutate";

async function casWriteRetriageFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ideaId: string,
  pending: boolean,
  reasons: RetriageReason[],
  expected: RetriageReason[],
): Promise<boolean> {
  const payload = {
    retriage_pending: pending,
    retriage_reasons: reasons,
  };

  if (expected.length === 0) {
    const nullWrite = await supabase
      .from("ideas")
      .update(payload)
      .eq("id", ideaId)
      .is("retriage_reasons", null)
      .select("id");
    if (nullWrite.error) throw new Error(nullWrite.error.message);
    if (nullWrite.data && nullWrite.data.length > 0) return true;

    const emptyWrite = await supabase
      .from("ideas")
      .update(payload)
      .eq("id", ideaId)
      .eq("retriage_reasons", [])
      .select("id");
    if (emptyWrite.error) throw new Error(emptyWrite.error.message);
    return !!(emptyWrite.data && emptyWrite.data.length > 0);
  }

  const write = await supabase
    .from("ideas")
    .update(payload)
    .eq("id", ideaId)
    .eq("retriage_reasons", expected)
    .select("id");
  if (write.error) throw new Error(write.error.message);
  return !!(write.data && write.data.length > 0);
}

/**
 * Read → mutate → CAS-write loop for retriage_reasons.
 * `mutate` receives the current reasons and returns the next pending/reasons.
 */
export async function casMutateRetriageFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ideaId: string,
  mutate: (
    current: RetriageReason[],
  ) => { pending: boolean; reasons: RetriageReason[] },
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIAGE_CAS_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("ideas")
      .select("retriage_reasons")
      .eq("id", ideaId)
      .single();
    if (error) throw new Error(error.message);

    const expected = normalizeRetriageReasons(data?.retriage_reasons);
    const next = mutate(expected);
    if (
      await casWriteRetriageFlags(
        supabase,
        ideaId,
        next.pending,
        next.reasons,
        expected,
      )
    ) {
      return true;
    }
  }
  return false;
}
