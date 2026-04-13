/**
 * Utilities for parsing JSON commands from LLM responses
 */

function parseCommandFromResponse(response) {
  if (!response) return null;

  // Try to find a JSON block in markdown
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      // Fall through to other parsing methods if this fails
    }
  }

  // Try to extract a JSON object by finding balanced braces
  // Look for { ... } blocks that contain action, command, or plan keys
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < response.length; i++) {
    const ch = response[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (start === -1) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const jsonStr = response.substring(start, i + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          // Only return if it has meaningful command fields
          if (parsed.action || parsed.command || parsed.plan) {
            return parsed;
          }
        } catch (e) {
          // Not valid JSON, continue searching
        }
        start = -1;
      }
    }
  }

  return null;
}

module.exports = { parseCommandFromResponse };
