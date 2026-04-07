```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "enum": ["CASUAL_CHAT", "TASK_ACTION", "KNOWLEDGE_QUERY", "PROTOCOL_RESPONSE", "NOISE", "UNKNOWN"],
      "description": "The category of the message."
    },
    "reason": {
      "type": "string",
      "description": "Short explanation for why this category was chosen."
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Classification confidence score (0.0 to 1.0)."
    },
    "normalizedText": {
      "type": "string",
      "description": "A cleaner, more readable version of the message for reasoning."
    }
  },
  "required": ["category", "reason", "confidence", "normalizedText"]
}
```
