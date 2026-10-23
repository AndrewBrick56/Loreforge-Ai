-- Record the selected launch destination for each character token.
-- Existing token associations remain valid because this field is nullable.

ALTER TABLE public.character_tokens
ADD COLUMN IF NOT EXISTS launchpad_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.character_tokens'::regclass
      AND conname = 'character_tokens_launchpad_id_check'
  ) THEN
    ALTER TABLE public.character_tokens
    ADD CONSTRAINT character_tokens_launchpad_id_check
    CHECK (
      launchpad_id IS NULL
      OR launchpad_id IN ('pump-fun', 'raydium-launchlab')
    );
  END IF;
END
$$;

COMMENT ON COLUMN public.character_tokens.launchpad_id IS
'Selected launch destination ID from the LoreForge launchpad registry.';
