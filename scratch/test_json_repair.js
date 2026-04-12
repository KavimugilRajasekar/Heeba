function repairTruncatedJson(str) {
  if (!str) return str;
  let result = str.trim();

  // Remove trailing comma if exists
  result = result.replace(/,\s*$/, '');

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  // 1. Close string if still open
  if (inString) {
    result += '"';
  }

  // 2. Close containers in reverse order
  while (stack.length > 0) {
    const closingChar = stack.pop();
    result += closingChar;
  }

  return result;
}


const testCases = [
  '{"tool": "Get-NetTCPConnection", "command": "Get-NetTCPConnection -State Estab',
  '{"tool": "Get-NetTCPConnection", "command": "cmd", "reason": "Check for established outbound',
  '{"security_score": "Safe", "findings": ["No issues found"',
  '{"findings": ["one", "two'
];

testCases.forEach((tc, i) => {
  const repaired = repairTruncatedJson(tc);
  console.log(`Test Case ${i + 1}:`);
  console.log(`Original: ${tc}`);
  console.log(`Repaired: ${repaired}`);
  try {
    JSON.parse(repaired);
    console.log(`Status: SUCCESS (Valid JSON)`);
  } catch (e) {
    console.log(`Status: FAILED (${e.message})`);
  }
  console.log('---');
});
