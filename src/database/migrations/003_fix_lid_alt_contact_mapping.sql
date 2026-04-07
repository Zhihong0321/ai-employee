CREATE TEMP TABLE tmp_lid_remap AS
SELECT
  m.id,
  split_part(m.raw_payload->'key'->>'remoteJidAlt', '@', 1) AS pn_number,
  split_part(m.raw_payload->'key'->>'remoteJid', '@', 1) AS lid_number
FROM messages m
WHERE
  m.raw_payload->'key'->>'remoteJidAlt' LIKE '%@s.whatsapp.net'
  AND m.raw_payload->'key'->>'remoteJid' LIKE '%@lid';

INSERT INTO contacts (whatsapp_number, name, is_human_api, notes)
SELECT DISTINCT
  t.pn_number,
  COALESCE(lid_contact.name, t.pn_number),
  FALSE,
  'Auto-created from WhatsApp activity.'
FROM tmp_lid_remap t
LEFT JOIN contacts lid_contact ON lid_contact.whatsapp_number = t.lid_number
WHERE NOT EXISTS (
  SELECT 1
  FROM contacts c
  WHERE c.whatsapp_number = t.pn_number
);

UPDATE messages m
SET
  sender_number = CASE WHEN m.direction = 'inbound' THEN t.pn_number ELSE m.sender_number END,
  sender_name = COALESCE(m.sender_name, lid_contact.name),
  chat_id = CASE
    WHEN m.chat_id LIKE '%@lid' THEN t.pn_number || '@s.whatsapp.net'
    ELSE m.chat_id
  END,
  contact_number = t.pn_number,
  author_number = CASE WHEN m.direction = 'inbound' THEN t.pn_number ELSE m.author_number END,
  author_name = COALESCE(m.author_name, lid_contact.name)
FROM tmp_lid_remap t
LEFT JOIN contacts lid_contact ON lid_contact.whatsapp_number = t.lid_number
WHERE m.id = t.id;

UPDATE messages m
SET contact_id = c.id
FROM contacts c
WHERE m.contact_number = c.whatsapp_number
  AND (m.contact_id IS NULL OR m.contact_id <> c.id);

DELETE FROM contacts c
WHERE EXISTS (
    SELECT 1
    FROM tmp_lid_remap t
    WHERE t.lid_number = c.whatsapp_number
  )
  AND NOT EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.contact_number = c.whatsapp_number
  )
  AND c.notes = 'Auto-created from WhatsApp activity.';

DROP TABLE tmp_lid_remap;
