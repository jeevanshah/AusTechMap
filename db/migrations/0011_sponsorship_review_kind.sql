-- Adds a review_queue_kind value for an ambiguous (fuzzy, not exact)
-- Home Affairs labour-agreement name match, routed to the existing
-- review queue for human confirmation rather than auto-accepted as
-- sponsorship evidence -- per PRODUCT_SPEC.md §8.3's "ambiguous match
-- confidence routes to human review before display."
ALTER TYPE review_queue_kind ADD VALUE 'sponsorship_match';
