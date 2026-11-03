INSERT INTO "AuditLog" (
    "id", "brandId", "locationId", "entityType", "entityId", "eventType", "actionType",
    "occurredAt", "actorId", "actorName", "actorRole", "payload", "createdAt"
)
SELECT
    access."id", access."brandId", access."locationId", 'ACCESS'::"AuditEntity",
    COALESCE(access."targetId", access."brandId"), 'ACCESS_CHANGED'::"AuditEvent", 'ACTION'::"AuditActionType",
    access."createdAt", access."actorId",
    COALESCE(NULLIF(CONCAT_WS(' ', actor."firstName", actor."lastName"), ''), actor."email", access."actorId"),
    'UNKNOWN'::"AuditActorRole",
    jsonb_build_object(
        'title', access."action",
        'changes', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('field', detail.key, 'from', '—', 'to',
                CASE WHEN detail.value = 'null'::jsonb THEN '—'
                     WHEN jsonb_typeof(detail.value) = 'string' THEN detail.value #>> '{}'
                     ELSE detail.value::text END)), '[]'::jsonb)
            FROM jsonb_each(
                jsonb_build_object('targetId', access."targetId") ||
                CASE WHEN jsonb_typeof(access."payload"::jsonb) = 'object' THEN access."payload"::jsonb ELSE '{}'::jsonb END
            ) AS detail
        )
    ),
    access."createdAt"
FROM "AccessAudit" access
LEFT JOIN "User" actor ON actor."id" = access."actorId"
ON CONFLICT ("id") DO NOTHING;
