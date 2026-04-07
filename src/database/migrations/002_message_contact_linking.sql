ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS author_number TEXT,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS is_from_me BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS messages_contact_number_idx ON messages (contact_number, occurred_at DESC);
CREATE INDEX IF NOT EXISTS messages_contact_id_idx ON messages (contact_id, occurred_at DESC);

UPDATE messages
SET
  contact_number = COALESCE(contact_number, sender_number),
  author_number = COALESCE(author_number, CASE WHEN direction = 'inbound' THEN sender_number ELSE NULL END),
  author_name = COALESCE(author_name, sender_name),
  is_from_me = CASE WHEN direction = 'outbound' THEN TRUE ELSE is_from_me END
WHERE
  contact_number IS NULL
  OR author_number IS NULL
  OR author_name IS NULL
  OR is_from_me = FALSE;

UPDATE messages m
SET contact_id = c.id
FROM contacts c
WHERE m.contact_id IS NULL
  AND m.contact_number IS NOT NULL
  AND c.whatsapp_number = m.contact_number;
