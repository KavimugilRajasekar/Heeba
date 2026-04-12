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

  // Try to find anything that looks like a JSON object containing "action", "command", or "plan"
  const anyJsonMatch = response.match(/\{[\s\S]*" (action|command|plan)"[\s\S]*\}/) || 
                       response.match(/\{[\s\S]*"(action|command|plan)"[\s\S]*\}/);
  
  if (anyJsonMatch) {
    try {
      // Find the outermost braces around the action/command
      const actionPos = response.indexOf(anyJsonMatch[0]);
      const firstBrace = response.lastIndexOf('{', actionPos);
      const lastBrace = response.indexOf('}', actionPos + anyJsonMatch[0].length - 1);
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = response.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonStr);
      }
    } catch (e) {
      // Final fallback to simple match
      try {
        return JSON.parse(anyJsonMatch[0]);
      } catch (e2) {}
    }
  }

  return null;
}

module.exports = { parseCommandFromResponse };
