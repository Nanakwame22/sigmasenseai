CREATE OR REPLACE FUNCTION public.ss_auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'analyst', 'viewer')),
  department TEXT,
  job_title TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()) + interval '14 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_email_idx
  ON public.organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organization_invitations_org_status_idx
  ON public.organization_invitations (organization_id, status, invited_at DESC);

CREATE OR REPLACE FUNCTION public.ss_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_organization_invitations_updated_at ON public.organization_invitations;
CREATE TRIGGER set_organization_invitations_updated_at
BEFORE UPDATE ON public.organization_invitations
FOR EACH ROW
EXECUTE FUNCTION public.ss_set_updated_at();

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'organization_invitations_select'
  ) THEN
    EXECUTE '
      CREATE POLICY organization_invitations_select
      ON public.organization_invitations
      FOR SELECT
      TO authenticated
      USING (
        public.ss_can_manage_team(organization_id)
        OR (
          status = ''pending''
          AND lower(email) = public.ss_auth_email()
        )
      )
    ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'organization_invitations_insert'
  ) THEN
    EXECUTE '
      CREATE POLICY organization_invitations_insert
      ON public.organization_invitations
      FOR INSERT
      TO authenticated
      WITH CHECK (public.ss_can_manage_team(organization_id))
    ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'organization_invitations_update'
  ) THEN
    EXECUTE '
      CREATE POLICY organization_invitations_update
      ON public.organization_invitations
      FOR UPDATE
      TO authenticated
      USING (
        public.ss_can_manage_team(organization_id)
        OR (
          status = ''pending''
          AND lower(email) = public.ss_auth_email()
        )
      )
      WITH CHECK (
        public.ss_can_manage_team(organization_id)
        OR (
          lower(email) = public.ss_auth_email()
          AND status = ''accepted''
          AND accepted_by = auth.uid()
          AND accepted_at IS NOT NULL
        )
      )
    ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_invitations'
      AND policyname = 'organization_invitations_delete'
  ) THEN
    EXECUTE '
      CREATE POLICY organization_invitations_delete
      ON public.organization_invitations
      FOR DELETE
      TO authenticated
      USING (public.ss_can_manage_team(organization_id))
    ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_organizations'
      AND policyname = 'user_organizations_insert_from_invitation'
  ) THEN
    EXECUTE '
      CREATE POLICY user_organizations_insert_from_invitation
      ON public.user_organizations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.organization_invitations oi
          WHERE oi.organization_id = user_organizations.organization_id
            AND oi.status = ''pending''
            AND lower(oi.email) = public.ss_auth_email()
            AND public.ss_normalize_role(oi.role) = public.ss_normalize_role(user_organizations.role)
        )
      )
    ';
  END IF;
END $$;
