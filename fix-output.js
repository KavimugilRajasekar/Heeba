const fs = require('fs');
let content = fs.readFileSync('src/core/intent-executor.js', 'utf8');

// Replace llm_reasoning case
content = content.replace(
  /case 'llm_reasoning':\n      out\(` \$\{M\}─── LLM Reasoning ───\$\{RST\}`\);/,
  "case 'llm_reasoning':\n      out(`  --- LLM Reasoning ---`);"
);

// Replace llm_response case
content = content.replace(
  /case 'llm_response':\n      out\(` \$\{M\}─── LLM Analysis ───\$\{RST\}`\);/,
  "case 'llm_response':\n      out(`  --- LLM Analysis ---`);"
);

// Replace kb_loading case
content = content.replace(
  /case 'kb_loading':\n      out\(`\n  \$\{B\}Loading KB file: \$\{C\$\{step\.toolName\}\.json\$\{RST\}`\);/,
  "case 'kb_loading':\n      out(`  Loading KB file : ${step.toolName}.json`);"
);

// Replace tool_selected case
content = content.replace(
  /case 'tool_selected':\n      out\(` \$\{Y\}\[Step \$\{step\.iteration\}\] Tool selected: \$\{C\$\{step\.toolName\}\$\{RST\}`\);\n      out\(` \$\{Y\}\[Step \$\{step\.iteration\}\] Reason for selecting: \$\{D\$\{step\.reason\}\$\{RST\}`\);/,
  "case 'tool_selected':\n      out(`  [Step ${step.iteration}] Tool selected : ${step.toolName}`);\n      out(`  [Step ${step.iteration}] Reason for selecting : ${step.reason}`);"
);

// Replace command_planning case
content = content.replace(
  /case 'command_planning':\n      out\(` \$\{M\}─── Command Planned ───\$\{RST\}`\);\n      out\(` \$\{C\}Tool    :\$\{RST\} \$\{step\.tool \|\| 'direct'\}`\);\n      out\(` \$\{D\}Reason  :\$\{RST\} \$\{step\.reason \|\| '\(no reason provided\)'\}`\);\n      out\(` \$\{C\}Command :\$\{RST\} \$\{step\.command\}`\);/,
  "case 'command_planning':\n      out(`  --- Command Planned ---`);\n      out(`  Tool     : ${step.tool || 'direct'}`);\n      out(`  Reason   : ${step.reason || '(no reason provided)'}`);\n      out(`  Command  : ${step.command}`);"
);

// Replace executing case
content = content.replace(
  /case 'executing':\n      out\(` \$\{Y\}⚡ Executing in agent terminal\.\.\.\$\{RST\}`\);/,
  "case 'executing':\n      out(`  Executing in agent terminal...`);"
);

// Replace command_done - output header
content = content.replace(
  /case 'command_done':\n      out\(` \$\{M\}─── Command Output \(stdout\) ───\$\{RST\}`\);/,
  "case 'command_done':\n      out(`  --- Command Output (stdout) ---`);"
);

// Replace command_done - analysis header
content = content.replace(
  /out\(` \$\{M\}─── Security Analysis of output ───\$\{RST\}`\);/,
  "out(`  --- Security Analysis of output ---`);"
);

// Replace command_done - result
content = content.replace(
  /out\(` \$\{step\.success \? G : R\}\$\{step\.success \? '✓' : '✗'\} Result: \$\{step\.success \? 'Command succeeded' : 'Command failed'\}\$\{RST\}`\);/,
  "out(`  ${step.success ? G : R}${step.success ? 'OK' : 'FAIL'} Result : ${step.success ? 'Command succeeded' : 'Command failed'}${RST}`);"
);

// Replace next_tool_decision
content = content.replace(
  /case 'next_tool_decision':\n      out\(` \$\{M\}─── Decision for next tool ───\$\{RST\}`\);\n      out\(` \$\{Y\}\[Step \$\{step\.iteration\}\] Next Category: \$\{C\$\{step\.nextCategory \|\| 'Conclusion\/Stop'\}\}\$\{RST\}`\);\n      out\(` \$\{Y\}\[Step \$\{step\.iteration\}\] Recursive step counter: \$\{W\}Step \$\{step\.iteration\} of \$\{step\.maxIterations\}\$\{RST\}`\);/,
  "case 'next_tool_decision':\n      out(`  --- Decision for next tool ---`);\n      out(`  [Step ${step.iteration}] Next Category : ${step.nextCategory || 'Conclusion/Stop'}`);\n      out(`  [Step ${step.iteration}] Recursive step counter : Step ${step.iteration} of ${step.maxIterations}`);"
);

// Replace invalid_response
content = content.replace(
  /case 'invalid_response':\n      out\(` \$\{R\}─── Invalid LLM Response ───\$\{RST\}`\);\n      out\(` \$\{R\}Model did not output a valid JSON command or conclusion\. Retrying\.\.\.\$\{RST\}`\);/,
  "case 'invalid_response':\n      out(`  --- Invalid LLM Response ---`);\n      out(`  Model did not output a valid JSON command or conclusion. Retrying...`);"
);

// Replace conclusion box with simple text
content = content.replace(
  /case 'conclusion':\n      out\(`\n\$\{M\}╔\$\{'═'\.repeat\(66\)\}╗\$\{RST\}`\);\n      out\(`\$\{M\}║\$\{RST\}           \$\{M\}FINAL SECURITY CONCLUSION\$\{RST\}                          \$\{M\}║\$\{RST\}`\);\n      out\(`\$\{M\}╠\$\{'═'\.repeat\(66\)\}╣\$\{RST\}`\);\n      out\(`\$\{M\}║\$\{RST\}  \$\{Y\}Steps   :\$\{RST\} \$\{step\.iteration\}                                               \$\{M\}║\$\{RST\}`\);/,
  "case 'conclusion':\n      out(`  === FINAL SECURITY CONCLUSION ==============================================`);\n      out(`  Steps    : ${step.iteration}`);"
);

// Rest of conclusion
content = content.replace(
  /if \(step\.conclusion\) \{\n        const scoreColor = step\.conclusion\.security_score === 'Safe' \? G :\n                           step\.conclusion\.security_score === 'At Risk' \? R : Y;\n        out\(`\$\{M\}║\$\{RST\}  \$\{Y\}Score   :\$\{RST\} \$\{scoreColor\}\$\{step\.conclusion\.security_score \|\| 'Inconclusive'\}\$\{RST\}                                    \$\{M\}║\$\{RST\}`\);/,
  "if (step.conclusion) {\n        const scoreColor = step.conclusion.security_score === 'Safe' ? G :\n                           step.conclusion.security_score === 'At Risk' ? R : Y;\n        out(`  Score    : ${scoreColor}${step.conclusion.security_score || 'Inconclusive'}${RST}`);"
);

// FINDINGS box line
content = content.replace(
  /out\(`\$\{M\}╠\$\{'═'\.repeat\(66\)\}╣\$\{RST\}`\);\n          out\(`\$\{M\}║\$\{RST\}  \$\{Y\}FINDINGS:\$\{RST\}                                              \$\{M\}║\$\{RST\}`\);/,
  "out(`  Findings :`);"
);

// Recommended fixes box line
content = content.replace(
  /out\(`\$\{M\}╠\$\{'═'\.repeat\(66\)\}╣\$\{RST\}`\);\n          out\(`\$\{M\}║\$\{RST\}  \$\{Y\}RECOMMENDED FIXES:\$\{RST\}                                     \$\{M\}║\$\{RST\}`\);/,
  "out(`  Recommended Fixes :`);"
);

// Bottom box
content = content.replace(
  /out\(`\$\{M\}╚\$\{'═'\.repeat\(66\)\}╝\$\{RST\}`\);/,
  "out(`  ${D}${sep}${RST}`);"
);

// email_dispatch
content = content.replace(
  /case 'email_dispatch':\n      out\(`\n\$\{M\}━━━ Email Dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\$\{RST\}`\);\n      out\(`  \$\{Y\}To      :\$\{RST\} \$\{step\.emailTo\}`\);\n      out\(`  \$\{Y\}Subject :\$\{RST\} \[Heeba Security Audit\] \$\{step\.os\} — \$\{step\.conclusion\?\.security_score \|\| 'Report'\}`\);\n      out\(`  \$\{D\}Sending report\.\.\.\$\{RST\}`\);/,
  "case 'email_dispatch':\n      out(`  === Email Dispatch =========================================================`);\n      out(`  To       : ${step.emailTo}`);\n      out(`  Subject  : [Heeba Security Audit] ${step.os} - ${step.conclusion?.security_score || 'Report'}`);\n      out(`  Sending report...`);"
);

// email_sent
content = content.replace(
  /case 'email_sent':\n      out\(`  \$\{G\}✓ Report emailed successfully to \$\{step\.emailTo\}\$\{RST\}`\);/,
  "case 'email_sent':\n      out(`  ${G}OK Report emailed successfully to ${step.emailTo}${RST}`);"
);

// email_failed
content = content.replace(
  /case 'email_failed':\n      out\(`  \$\{R\}✗ Email dispatch failed: \$\{step\.error \|\| 'unknown error'\}\$\{RST\}`\);/,
  "case 'email_failed':\n      out(`  ${R}FAIL Email dispatch failed : ${step.error || 'unknown error'}${RST}`);"
);

fs.writeFileSync('src/core/intent-executor.js', content);
console.log('Done');
