-- Optional, proof-of-control Solana wallet linking for LoreForge profiles.
-- This verifies the wallet address only. It does not prove ownership of a token project.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS wallet_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_unique_idx
  ON public.profiles (wallet_address)
  WHERE wallet_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wallet_link_challenges (
  nonce uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL CHECK (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_link_challenges_user_created_idx
  ON public.wallet_link_challenges (user_id, created_at DESC);

ALTER TABLE public.wallet_link_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_link_challenges FROM anon, authenticated;
GRANT ALL ON TABLE public.wallet_link_challenges TO service_role;

-- Profile clients may still edit normal profile fields, but cannot claim a wallet
-- by directly updating these two columns. Only server-side service-role verification
-- is allowed to change the wallet-link fields.
CREATE OR REPLACE FUNCTION public.protect_profile_wallet_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  request_role text;
BEGIN
  request_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );

  -- Only the server-side service-role API may change wallet-link fields.
  IF request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.wallet_address IS NOT NULL
       OR NEW.wallet_verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'Wallet link fields can only be changed by server-side verification.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address
       OR NEW.wallet_verified_at IS DISTINCT FROM OLD.wallet_verified_at THEN
      RAISE EXCEPTION 'Wallet link fields can only be changed by server-side verification.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_wallet_fields ON public.profiles;
CREATE TRIGGER profiles_protect_wallet_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_wallet_fields();

COMMENT ON COLUMN public.profiles.wallet_address IS
  'Optional Solana wallet address linked after server-verified message signing.';
COMMENT ON COLUMN public.profiles.wallet_verified_at IS
  'Time the profile linked this wallet by signing a single-use server challenge.';
