-- Close append-only and deletion-state constraint gaps without changing applied migrations.

ALTER TABLE account_deletion_requests
ADD CONSTRAINT account_deletion_requests_failed_requires_code
CHECK (status <> 'failed' OR failure_code IS NOT NULL);

CREATE TRIGGER audit_records_no_truncate
BEFORE TRUNCATE ON audit_records
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_record_mutation();
