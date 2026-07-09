-- Allow Grok as an independent user platform quota dimension.
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Existing deployments may have an auto-generated CHECK name, while newer
    -- migrations standardise it to user_platform_quotas_platform_check. Drop any
    -- CHECK constraint whose definition targets the platform column, then add the
    -- expanded platform list exactly once.
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'user_platform_quotas'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%platform%'
    LOOP
        EXECUTE format('ALTER TABLE user_platform_quotas DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    ALTER TABLE user_platform_quotas
        ADD CONSTRAINT user_platform_quotas_platform_check
        CHECK (platform IN ('anthropic', 'openai', 'grok', 'gemini', 'antigravity', 'kiro'));
END $$;
